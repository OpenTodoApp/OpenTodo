// The weekly review's project walk (OpenSpec change open-loops-method, design D6;
// weekly-review "Project walk"): one card per project, least recently reviewed
// first, with its outcome, next action, waiting and deferred counts and markers,
// and single-key decisions. The queue is fixed when the walk opens; a project that
// stops being in the walk (archived or deleted anywhere) drops out. Only projects
// due for review start in the queue (project-review-cadence D4); the end of the
// walk counts the rest and "Review them too" appends them. A card keeps its place
// once reviewed, so the queue never shifts under the user.
import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../lib/i18n'
import { archiveProject } from '../../lib/ops'
import { freshlyReviewed, markProjectReviewed, pausedCount, reviewAgo, type WalkProject } from '../../lib/review'
import { REVIEW_EVERY_NAMES } from '../../lib/reviewCadence'
import { Badge, Button, EmptyState } from '../../ui'
import { act } from '../actionError'
import { ActionMenu } from '../menus/ActionMenu'
import { reviewEveryChoices, setMaintenance } from '../menus/reviewMenu'
import { navigate } from '../router'
import { isActivationTarget, useShortcutScope } from '../shortcuts'
import { Kbd } from '../shortcuts/Kbd'

/** The first lines of a project's note, as plain text: its outcome. */
export function outcomeOf(description: string | undefined | null): string {
  const lines = (description ?? '').split('\n').map((l) => l.replace(/^[#>*\-\s\d.[\]x]+/i, '').replace(/[*_`~]/g, '').trim()).filter(Boolean)
  const text = lines.slice(0, 2).join(' ')
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
}

export function ProjectWalk({ walk, notDue = [], now, onAdd, paused }: {
  walk: readonly WalkProject[]
  /** Working projects not due yet or paused: counted at the end, appended by "Review them too". */
  notDue?: readonly WalkProject[]
  now: number
  onAdd: (w: WalkProject) => void
  paused?: boolean
}) {
  const [queue, setQueue] = useState<string[] | null>(null)
  const [index, setIndex] = useState(0)
  const [announce, setAnnounce] = useState('')
  const [everyOpen, setEveryOpen] = useState(false)
  const card = useRef<HTMLElement>(null)
  // The queue is fixed on first render; due projects added meanwhile join its end.
  useEffect(() => {
    setQueue((q) => {
      const ids = walk.map((w) => w.project.id)
      if (!q) return ids
      const extra = ids.filter((id) => !q.includes(id))
      return extra.length ? [...q, ...extra] : q
    })
  }, [walk])
  // A reviewed card stops being due but keeps its place: look projects up among both sets.
  const byId = useMemo(() => new Map([...notDue, ...walk].map((w) => [w.project.id, w])), [walk, notDue])
  const live = useMemo(() => (queue ?? []).filter((id) => byId.has(id)), [queue, byId])
  const current = index < live.length ? byId.get(live[index]) ?? null : null

  // The first card leaves focus on the step's title; after a decision focus follows the new card.
  const shown = useRef(false)
  useEffect(() => {
    if (!current) return
    setAnnounce(t('{n} of {total}: {name}', { n: index + 1, total: live.length, name: current.project.name }))
    if (shown.current) card.current?.focus({ preventScroll: true })
    shown.current = true
  }, [current?.project.id, index, live.length]) // eslint-disable-line react-hooks/exhaustive-deps -- announce once per card

  const advance = () => setIndex((i) => Math.min(i + 1, live.length))
  const reviewed = async () => {
    if (!current) return
    await markProjectReviewed(current.project.id)
    setAnnounce(t('{name} reviewed.', { name: current.project.name }))
    advance()
  }
  const archive = async () => {
    if (!current?.canArchive) return
    const name = current.project.name
    await archiveProject(current.project.id)
    setAnnounce(t('Archived {name}.', { name }))
  }
  const maintenance = async () => {
    if (!current?.canArchive) return
    const on = !current.maintenance
    await setMaintenance(current.project, on)
    setAnnounce(on ? t('{name} is in maintenance', { name: current.project.name }) : t('Maintenance ended for {name}', { name: current.project.name }))
  }
  // "Review them too" (design D4): the projects not due, appended to this walk only; nothing is written.
  const rest = notDue.filter((w) => !(queue ?? []).includes(w.project.id))
  const reviewRest = () => {
    if (!queue || !rest.length) return
    setQueue([...queue, ...rest.map((w) => w.project.id)])
    setIndex(live.length)
  }
  const onCard = (e: KeyboardEvent) => !!current && !isActivationTarget(e.target)
  useShortcutScope('view', {
    'review.walk-reviewed': () => { if (!current) return false; act(reviewed()) },
    'review.walk-add': () => { if (!current) return false; onAdd(current) },
    'review.walk-open': (e) => { if (!onCard(e)) return false; navigate({ view: 'project', id: current!.project.id }) },
    'review.walk-archive': () => { if (!current?.canArchive) return false; act(archive()) },
    'review.walk-every': () => { if (!current) return false; setEveryOpen(true) },
    'review.walk-maintenance': () => { if (!current?.canArchive) return false; act(maintenance()) },
    'review.walk-skip': (e) => { if (!onCard(e)) return false; advance() },
    'review.walk-back': () => { if (!current && index === 0) return false; setIndex((i) => Math.max(0, i - 1)) },
  }, { view: 'review', paused: paused || everyOpen })

  if (!queue) return null
  const remaining = live.map((id) => byId.get(id)!).filter((w) => w.needsNext)
  if (!current) {
    const pausedN = pausedCount(rest)
    return (
      <div data-walk-summary>
        <p className="sr-only" role="status" aria-live="polite">{announce}</p>
        <EmptyState icon="clipboard-check" title={live.length ? t('Every project walked') : t('No project to walk')}
          body={remaining.length ? t('{n, plural, one {# project still has no next action: {names}.} other {# projects still have no next action: {names}.}}', { n: remaining.length, names: remaining.map((w) => w.project.name).join(', ') }) : t('Every project has a next action.')}
          control={(live.length > 0 || rest.length > 0) ? (
            <div className="flex flex-col items-center gap-2">
              {rest.length > 0 && (
                <p className="text-body text-muted" data-walk-rest>
                  {pausedN
                    ? t('{n, plural, one {# not due yet, {paused} of them paused} other {# not due yet, {paused} of them paused}}', { n: rest.length, paused: pausedN })
                    : t('{n, plural, one {# not due yet} other {# not due yet}}', { n: rest.length })}
                </p>
              )}
              <div className="flex flex-wrap justify-center gap-2">
                {rest.length > 0 && <Button onClick={reviewRest} data-walk-rest-add>{t('Review them too')}</Button>}
                {live.length > 0 && <Button variant={rest.length ? 'ghost' : 'secondary'} onClick={() => setIndex(0)}>{t('Walk again')}</Button>}
              </div>
            </div>
          ) : undefined} />
      </div>
    )
  }
  const w = current
  const outcome = outcomeOf(w.project.description)
  const buttons: { key: string; hint: string; label: string; run: () => void; primary?: boolean; disabled?: boolean }[] = [
    { key: 'reviewed', hint: 'r', label: t('Looks good'), run: () => act(reviewed()), primary: !w.needsNext },
    { key: 'add', hint: 'q', label: t('Add a next action'), run: () => onAdd(w), primary: w.needsNext },
    { key: 'open', hint: 'Enter', label: t('Open'), run: () => navigate({ view: 'project', id: w.project.id }) },
    ...(w.canArchive ? [{ key: 'archive', hint: 'a', label: t('Archive'), run: () => act(archive()) }] : []),
    ...(w.canArchive ? [{ key: 'maintenance', hint: 'm', label: w.maintenance ? t('End maintenance') : t('Put in maintenance'), run: () => act(maintenance()) }] : []),
    { key: 'skip', hint: 'j', label: t('Skip'), run: advance },
    { key: 'back', hint: 'k', label: t('Previous project'), run: () => setIndex((i) => Math.max(0, i - 1)), disabled: index === 0 },
  ]
  return (
    <div data-walk>
      <p className="sr-only" role="status" aria-live="polite" data-walk-live>{announce}</p>
      <p className="mb-2 text-meta text-muted tabular-nums" data-walk-progress>{t('{n} of {total}', { n: index + 1, total: live.length })}</p>
      <section ref={card} tabIndex={-1} data-walk-card={w.project.id} aria-label={t('Project {n} of {total}: {name}', { n: index + 1, total: live.length, name: w.project.name })}
        className="rounded-card bg-sunken p-4 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-2 text-h2 font-semibold text-strong">
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: w.project.color }} />
            <span className="user-text truncate">{w.project.name}</span>
          </h3>
          <span className="text-meta text-faint" data-walk-reviewed>
            {w.reviewedAt ? t('Reviewed {ago}', { ago: reviewAgo(w.reviewedAt, now) }) : t('Never reviewed')}
            {' · '}<span data-walk-every={w.every}>{REVIEW_EVERY_NAMES[w.every]}</span>
          </span>
        </div>
        {outcome && <p className="user-text mt-2 text-body text-muted" data-walk-outcome>{outcome}</p>}
        <dl className="mt-3 grid gap-1 text-body">
          <div className="flex flex-wrap gap-x-2"><dt className="text-muted">{t('Next action')}</dt>
            <dd className="user-text text-default" data-walk-next>{w.nextAction ? w.nextAction.title || t('Untitled') : t('None')}</dd></div>
          {w.waiting > 0 && <div className="flex gap-x-2"><dt className="text-muted">{t('Waiting')}</dt><dd>{w.waiting}</dd></div>}
          {w.deferred > 0 && <div className="flex gap-x-2"><dt className="text-muted">{t('Starts later')}</dt><dd>{w.deferred}</dd></div>}
        </dl>
        {(w.needsNext || w.stalled || w.maintenance || freshlyReviewed(w)) && (
          <p className="mt-3 flex flex-wrap gap-2">
            {w.maintenance && <span data-walk-maintenance><Badge hue="slate">{t('In maintenance')}</Badge></span>}
            {w.needsNext && <Badge hue="orange">{t('No next action')}</Badge>}
            {w.stalled && <Badge hue="red">{t('Stalled')}</Badge>}
            {freshlyReviewed(w) && <Badge hue="green">{t('Reviewed, not due yet')}</Badge>}
          </p>
        )}
      </section>
      <div role="toolbar" aria-label={t('Decisions')} className="mt-4 flex flex-wrap gap-2" data-walk-bar>
        {buttons.map((b) => (
          <Button key={b.key} size="sm" variant={b.primary ? 'primary' : b.key === 'reviewed' || b.key === 'add' ? 'secondary' : 'ghost'} disabled={b.disabled} onClick={b.run} data-walk-action={b.key}
            aria-keyshortcuts={b.hint}>
            {b.label}<Kbd k={b.hint} only className="ml-1" />
          </Button>
        ))}
        {/* Review every… (project-review-cadence D6): the user's own interval, in every mode. */}
        <ActionMenu label={t('Review every…')} title={w.project.name} align="start" open={everyOpen} onOpenChange={setEveryOpen}
          groups={[{ items: reviewEveryChoices(w.project.id, w.every) }]}
          trigger={<>{t('Review every…')}<Kbd k="e" only className="ml-1" /></>}
          triggerClassName="ui-btn ui-btn--ghost ui-btn--sm" triggerProps={{ 'data-walk-action': 'every', 'aria-keyshortcuts': 'e' }} />
      </div>
    </div>
  )
}
