// The weekly review's project walk (OpenSpec change open-loops-method, design D6;
// weekly-review "Project walk"): one card per project, least recently reviewed
// first, with its outcome, next action, waiting and deferred counts and markers,
// and single-key decisions. The queue is fixed when the walk opens; a project that
// stops being in the walk (archived or deleted anywhere) drops out.
import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../lib/i18n'
import { archiveProject } from '../../lib/ops'
import { freshlyReviewed, markProjectReviewed, reviewAgo, type WalkProject } from '../../lib/review'
import { Badge, Button, EmptyState } from '../../ui'
import { act } from '../actionError'
import { navigate } from '../router'
import { isActivationTarget, useShortcutScope } from '../shortcuts'

/** The first lines of a project's note, as plain text: its outcome. */
export function outcomeOf(description: string | undefined | null): string {
  const lines = (description ?? '').split('\n').map((l) => l.replace(/^[#>*\-\s\d.[\]x]+/i, '').replace(/[*_`~]/g, '').trim()).filter(Boolean)
  const text = lines.slice(0, 2).join(' ')
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
}

export function ProjectWalk({ walk, now, onAdd, paused }: { walk: readonly WalkProject[]; now: number; onAdd: (w: WalkProject) => void; paused?: boolean }) {
  const [queue, setQueue] = useState<string[] | null>(null)
  const [index, setIndex] = useState(0)
  const [announce, setAnnounce] = useState('')
  const card = useRef<HTMLElement>(null)
  // The queue is fixed on first render; projects added meanwhile join its end.
  useEffect(() => {
    setQueue((q) => {
      const ids = walk.map((w) => w.project.id)
      if (!q) return ids
      const extra = ids.filter((id) => !q.includes(id))
      return extra.length ? [...q, ...extra] : q
    })
  }, [walk])
  const byId = useMemo(() => new Map(walk.map((w) => [w.project.id, w])), [walk])
  const live = useMemo(() => (queue ?? []).filter((id) => byId.has(id)), [queue, byId])
  const current = index < live.length ? byId.get(live[index]) ?? null : null

  useEffect(() => {
    if (!current) return
    setAnnounce(t('{n} of {total}: {name}', { n: index + 1, total: live.length, name: current.project.name }))
    card.current?.focus({ preventScroll: true })
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
  const onCard = (e: KeyboardEvent) => !!current && !isActivationTarget(e.target)
  useShortcutScope('view', {
    'review.walk-reviewed': () => { if (!current) return false; act(reviewed()) },
    'review.walk-add': () => { if (!current) return false; onAdd(current) },
    'review.walk-open': (e) => { if (!onCard(e)) return false; navigate({ view: 'project', id: current!.project.id }) },
    'review.walk-archive': () => { if (!current?.canArchive) return false; act(archive()) },
    'review.walk-skip': (e) => { if (!onCard(e)) return false; advance() },
    'review.walk-back': () => { if (!current && index === 0) return false; setIndex((i) => Math.max(0, i - 1)) },
  }, { view: 'review', paused })

  if (!queue) return null
  const remaining = walk.filter((w) => w.needsNext)
  if (!current) {
    return (
      <div data-walk-summary>
        <p className="sr-only" role="status" aria-live="polite">{announce}</p>
        <EmptyState icon="clipboard-check" title={live.length ? t('Every project walked') : t('No project to walk')}
          body={remaining.length ? t('{n, plural, one {# project still has no next action: {names}.} other {# projects still have no next action: {names}.}}', { n: remaining.length, names: remaining.map((w) => w.project.name).join(', ') }) : t('Every project has a next action.')}
          action={live.length > 0 ? <Button onClick={() => setIndex(0)}>{t('Walk again')}</Button> : undefined} />
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
    { key: 'skip', hint: 'j', label: t('Skip'), run: advance },
    { key: 'back', hint: 'k', label: t('Back'), run: () => setIndex((i) => Math.max(0, i - 1)), disabled: index === 0 },
  ]
  return (
    <div data-walk>
      <p className="sr-only" role="status" aria-live="polite" data-walk-live>{announce}</p>
      <p className="mb-2 text-meta text-muted tabular-nums" data-walk-progress>{t('{n} of {total}', { n: index + 1, total: live.length })}</p>
      <section ref={card} tabIndex={-1} data-walk-card={w.project.id} aria-label={t('Project {n} of {total}: {name}', { n: index + 1, total: live.length, name: w.project.name })}
        className="rounded-card border border-default bg-surface p-5 shadow-1 outline-none focus-visible:outline-2 focus-visible:outline-focus">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-2 text-h2 font-semibold text-strong">
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: w.project.color }} />
            <span className="user-text truncate">{w.project.name}</span>
          </h3>
          <span className="text-meta text-faint" data-walk-reviewed>{w.reviewedAt ? t('Reviewed {ago}', { ago: reviewAgo(w.reviewedAt, now) }) : t('Never reviewed')}</span>
        </div>
        {outcome && <p className="user-text mt-2 text-body text-muted" data-walk-outcome>{outcome}</p>}
        <dl className="mt-3 grid gap-1 text-body">
          <div className="flex flex-wrap gap-x-2"><dt className="text-muted">{t('Next action')}</dt>
            <dd className="user-text text-default" data-walk-next>{w.nextAction ? w.nextAction.title || t('Untitled') : t('None')}</dd></div>
          {w.waiting > 0 && <div className="flex gap-x-2"><dt className="text-muted">{t('Waiting')}</dt><dd>{w.waiting}</dd></div>}
          {w.deferred > 0 && <div className="flex gap-x-2"><dt className="text-muted">{t('Starts later')}</dt><dd>{w.deferred}</dd></div>}
        </dl>
        {(w.needsNext || w.stalled || freshlyReviewed(w, now)) && (
          <p className="mt-3 flex flex-wrap gap-2">
            {w.needsNext && <Badge hue="orange">{t('No next action')}</Badge>}
            {w.stalled && <Badge hue="red">{t('Stalled')}</Badge>}
            {freshlyReviewed(w, now) && <Badge hue="green">{t('Reviewed this week')}</Badge>}
          </p>
        )}
      </section>
      <div role="toolbar" aria-label={t('Decisions')} className="mt-4 flex flex-wrap gap-2" data-walk-bar>
        {buttons.map((b) => (
          <Button key={b.key} size="sm" variant={b.primary ? 'primary' : 'secondary'} disabled={b.disabled} onClick={b.run} data-walk-action={b.key}
            aria-keyshortcuts={b.hint}>
            {b.label} <span className="ui-kbd ml-1">{b.hint}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
