// The Loop home (OpenSpec change open-loops-method, design D9; open-loops "Loop
// home"): one tile per move with live counts from the local rows, each opening the
// screen that does that move, and today's focus from the Daily check below. Works
// offline and follows changes from other devices as they sync.
import { useMemo, useState, type ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { resolveLabels } from '../../lib/labels'
import { useAllLabels, useReviewRow, useReviewedAt } from '../../lib/localData'
import { methodTagline, move, termName, type MoveId } from '../../lib/method'
import { nextGroups } from '../../lib/method/groups'
import { MethodRules, waitingTasks } from '../../lib/method/rules'
import { createTask, setTaskCompleted } from '../../lib/ops'
import { dailyDue, focusTasks, reviewAgo, reviewDue } from '../../lib/review'
import { qualifies } from '../../lib/triage'
import { Badge, Button, Dialog, Icon, PageBody, PageHeader, Skeleton, type IconName } from '../../ui'
import { act } from '../actionError'
import { MethodLink } from '../help/MethodLink'
import { setPanelTaskId } from '../panel'
import { QuickAdd } from '../QuickAdd'
import { navigate, type Route } from '../router'
import { TaskRow } from '../TaskRow'
import { useMethodInput } from './useMethodInput'

interface Tile {
  move: MoveId
  icon: IconName
  lines: ReactNode[]
  action: { label: string; run: () => void; disabled?: boolean }
}

export function LoopHome() {
  const input = useMethodInput()
  const labels = useAllLabels()
  const review = useReviewRow()
  const reviewedAt = useReviewedAt()
  const [catching, setCatching] = useState(false)
  const go = (r: Route) => () => navigate(r)
  const data = useMemo(() => {
    if (!input) return null
    const now = Date.now()
    const rules = new MethodRules(input)
    const inbox = input.tasks.filter((x) => !x.deleted_at && qualifies(x)).length
    const withoutNext = rules.working.filter((p) => rules.needsNextAction(p.id)).length
    const stalled = rules.working.filter((p) => rules.stalled(p.id, now)).length
    const contexts = nextGroups(input, labels)
    const nextCount = new Set(contexts.flatMap((g) => g.tasks.map((x) => x.id))).size
    const waiting = waitingTasks(input).length
    return { inbox, withoutNext, stalled, contexts, nextCount, waiting, focus: focusTasks(review, input.today, input.tasks) }
  }, [input, labels, review, reviewedAt]) // eslint-disable-line react-hooks/exhaustive-deps -- reviewedAt: the walk's stamps change what Place counts
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const projectMap = useMemo(() => new Map((input?.projects ?? []).map((p) => [p.id, p])), [input])

  const tiles: Tile[] = !data || !input ? [] : [
    { move: 'catch', icon: 'inbox', lines: [t('{n, plural, =0 {The Inbox is empty} one {# in the Inbox} other {# in the Inbox}}', { n: data.inbox })], action: { label: t('Catch something'), run: () => setCatching(true) } },
    { move: 'clarify', icon: 'list', lines: [t('{n, plural, =0 {Nothing to decide} one {# to decide} other {# to decide}}', { n: data.inbox })], action: { label: t('Process the Inbox'), run: go({ view: 'triage' }), disabled: data.inbox === 0 } },
    {
      move: 'place', icon: 'layers',
      lines: [
        t('{n, plural, =0 {Every project has a next action} one {# project without a next action} other {# projects without a next action}}', { n: data.withoutNext }),
        ...(data.stalled ? [t('{n, plural, one {# stalled} other {# stalled}}', { n: data.stalled })] : []),
      ],
      action: { label: t('Walk your projects'), run: go({ view: 'review', step: 'projects' }) },
    },
    {
      move: 'do', icon: 'arrow-right',
      lines: [
        t('{n, plural, =0 {No next action} one {# next action} other {# next actions}}', { n: data.nextCount }),
        ...data.contexts.slice(0, 3).map((g) => `${g.heading} ${new Set(g.tasks.map((x) => x.id)).size}`),
        t('{n} waiting', { n: data.waiting }),
      ],
      action: { label: t('Go to Next'), run: go({ view: 'next' }) },
    },
    {
      move: 'review', icon: 'clipboard-check',
      lines: [
        dailyDue(review?.daily_at, input.today) ? <Badge key="d" hue="orange">{t('Daily check due')}</Badge> : t('Daily check done today'),
        reviewDue(review?.completed_at) ? <Badge key="w" hue="orange">{t('Weekly review due')}</Badge> : t('Weekly review {ago}', { ago: reviewAgo(review?.completed_at) }),
      ],
      action: dailyDue(review?.daily_at, input.today)
        ? { label: t('Start the daily check'), run: go({ view: 'review', step: 'daily' }) }
        : { label: t('Open the weekly review'), run: go({ view: 'review' }) },
    },
  ]

  return (
    <PageBody width="list">
      <PageHeader title={t('Loop home')} icon="rotate-ccw" meta={<MethodLink />} subtitle={<MethodLink />} help="loop" />
      <p className="mb-4 text-body text-muted" data-loop-tagline>{methodTagline()}</p>
      {!data ? <Skeleton shape="row" count={5} /> : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('The five moves')} data-loop-tiles>
            {tiles.map((tile) => (
              <li key={tile.move} data-loop-tile={tile.move} className="surface-card flex flex-col gap-2 p-4">
                <h2 className="flex items-center gap-2 text-h3 font-semibold text-default">
                  <Icon name={tile.icon} />{termName(move(tile.move))}
                </h2>
                <ul className="flex-1 space-y-1 text-body text-muted">
                  {tile.lines.map((line, i) => <li key={i} className="user-text">{line}</li>)}
                </ul>
                <div><Button size="sm" onClick={tile.action.run} disabled={tile.action.disabled}>{tile.action.label}</Button></div>
              </li>
            ))}
          </ul>
          <section className="mt-6" aria-labelledby="loop-focus" data-loop-focus>
            <h2 id="loop-focus" className="mb-1 px-2 text-meta font-semibold text-faint">{t('Today’s focus')}</h2>
            {data.focus.length === 0 ? (
              <p className="px-2 text-body text-faint">{t('No focus chosen today. Pick up to three tasks in the Daily check.')}</p>
            ) : (
              <ul>
                {data.focus.map((task) => (
                  <TaskRow key={task.id} task={task} project={task.project_id ? projectMap.get(task.project_id) : undefined} labels={resolveLabels(task.labels, labelMap)}
                    showProject selected={false} onToggle={() => act(setTaskCompleted(task.id, !task.completed_at))} onOpen={() => setPanelTaskId(task.id)} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {catching && (
        <Dialog title={t('Catch into the Inbox')} onClose={() => setCatching(false)}>
          <QuickAdd autoFocus hideHint placeholder={t('Whatever is on your mind…')} label={t('Catch into the Inbox')}
            projects={(input?.projects ?? []).filter((p) => !p.deleted_at && !p.archived)} labels={labels}
            onAdd={async (task) => { await createTask({ ...task, project_id: task.project_id ?? null, labels: task.labels ?? [] }) }} />
        </Dialog>
      )}
    </PageBody>
  )
}
