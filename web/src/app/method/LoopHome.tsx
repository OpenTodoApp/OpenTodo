// The Loop home (OpenSpec change loop-home-refresh; open-loops "Loop home" and
// "Loop pulse"): an inline capture field, the five moves on one rail with exactly
// one lit as the next move, today's focus with its progress, and the Loop pulse.
// Everything is computed on the device from the local rows, nothing is stored or
// sent, and the page follows changes from other devices as they sync.
import { useMemo, type MouseEvent, type ReactNode } from 'react'
import { formatDate, formatInstant } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { resolveLabels } from '../../lib/labels'
import { hasTimeColumn } from '../../lib/rowTime'
import { useAllLabels, useReviewRow, useReviewedAt } from '../../lib/localData'
import { move, PLACES, RHYTHMS, termDescription, termName, type MoveId, type RhythmId } from '../../lib/method'
import { nextGroups } from '../../lib/method/groups'
import { decided, INBOX_AGE_CAUTION_DAYS, inboxAge, lastDays, nextMove, PULSE_DAYS } from '../../lib/method/pulse'
import { MethodRules, waitingTasks } from '../../lib/method/rules'
import { createTask, setTaskCompleted } from '../../lib/ops'
import { dailyDue, dayClosed, monthlyDue, reviewAgo, reviewDue, storedFocus } from '../../lib/review'
import { compute, periodFor, sharedIds } from '../../lib/stats'
import { qualifies } from '../../lib/triage'
import type { Label, Project, Task } from '../../lib/types'
import { Button, Icon, PageBody, PageHeader, Skeleton, Tooltip, type IconName } from '../../ui'
import { act } from '../actionError'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { MethodLink } from '../help/MethodLink'
import { setPanelTaskId } from '../panel'
import { QuickAdd } from '../QuickAdd'
import { navigate, routePath, type Route } from '../router'
import { TaskRow } from '../TaskRow'
import { useMethodInput } from './useMethodInput'

interface Move {
  id: MoveId
  icon: IconName
  route: Route
  /** The full sentence, read by assistive technology in place of the numeral. */
  sentence: string
  /** The big numeral; null shows the done mark (Catch, Clarify and Place at zero). */
  count: number | null
  unit?: string
  lines: ReactNode[]
  /** A line outside the move's link (the Review move's Close the day line, close-the-day D6). */
  extra?: ReactNode
  action: string
}

const ICONS: Record<MoveId, IconName> = { catch: 'inbox', clarify: 'list', place: 'layers', do: 'arrow-right', review: 'clipboard-check' }
const inboxPlace = PLACES.find((p) => p.id === 'inbox')!
const CLOSE_ROUTE: Route = { view: 'review', step: 'close' }

function linkTo(route: Route) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(route)
  }
}

export function LoopHome() {
  const input = useMethodInput()
  const labels = useAllLabels()
  const review = useReviewRow()
  const reviewedAt = useReviewedAt()
  const weekStart = useDateTimeFormat().resolved.weekStart
  const data = useMemo(() => {
    if (!input) return null
    const now = Date.now()
    const rules = new MethodRules(input)
    const live = input.tasks.filter((x) => !x.deleted_at)
    const inbox = live.filter(qualifies).length
    const withoutNext = rules.working.filter((p) => rules.needsNextAction(p.id)).length
    const stalled = rules.working.filter((p) => rules.stalled(p.id, now)).length
    const contexts = nextGroups(input, labels)
    const nextCount = new Set(contexts.flatMap((g) => g.tasks.map((x) => x.id))).size
    const waiting = waitingTasks(input).length
    const rhythms = { daily: dailyDue(review?.daily_at, input.today), weekly: reviewDue(review?.completed_at, now), monthly: monthlyDue(review?.monthly_at, now) }
    const rhythmDue = rhythms.daily || rhythms.weekly || rhythms.monthly
    const byId = new Map(live.map((x) => [x.id, x]))
    const focus = storedFocus(review, input.today).map((id) => byId.get(id)).filter((x): x is Task => !!x)
    const stats = { tasks: input.tasks, projects: input.projects, shared: sharedIds([...input.memberships.values()]), me: input.me, today: input.today }
    const pulse = {
      week: compute(stats, periodFor('this-week', input.today, weekStart), weekStart).completed,
      lastWeek: compute(stats, periodFor('last-week', input.today, weekStart), weekStart).completed,
      ...decided(input.tasks, input.today),
      age: inboxAge(input.tasks, input.today),
      days: compute(stats, lastDays(input.today), weekStart).perDay,
    }
    const stamps = { weekly: review?.completed_at ?? null, monthly: review?.monthly_at ?? null }
    const closedAt = review && dayClosed(review.closed_at, input.today) ? review.closed_at : null
    return { inbox, withoutNext, stalled, contexts, nextCount, waiting, rhythms, rhythmDue, stamps, closedAt, focus, pulse, up: nextMove({ inbox, withoutNext, rhythmDue, nextCount }) }
  }, [input, labels, review, reviewedAt, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps -- reviewedAt: the walk's stamps change what Place counts
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const projectMap = useMemo(() => new Map((input?.projects ?? []).map((p) => [p.id, p])), [input])
  const projects = useMemo(() => (input?.projects ?? []).filter((p) => !p.deleted_at && !p.archived), [input])

  const closed = !!data && data.inbox === 0 && data.withoutNext === 0 && !data.rhythmDue
  return (
    <PageBody width="list">
      <PageHeader title={t('Loop home')} icon="rotate-ccw" meta={<MethodLink />} subtitle={<MethodLink />} help="loop" />
      <div className="mb-4" data-loop-capture>
        <QuickAdd placeholder={t('Whatever is on your mind…')} label={t('Catch into the Inbox')} projects={projects} labels={labels}
          onAdd={async (task) => { await createTask({ ...task, project_id: task.project_id ?? null, labels: task.labels ?? [] }) }} />
      </div>
      {!data || !input ? <LoopSkeleton /> : (
        <>
          {closed && (
            <p className="mb-3 flex items-center gap-2 rounded-card bg-success-soft px-3 py-2 text-body text-on-success-soft" data-loop-closed>
              <Icon name="circle-check-big" className="shrink-0 text-success" />{t('Your loops are closed. Work from Next, and catch things as they come.')}
            </p>
          )}
          <Rail moves={movesOf(data)} up={data.up} />
          <Focus tasks={data.focus} projectMap={projectMap} labelMap={labelMap} />
          <Pulse pulse={data.pulse} />
        </>
      )}
    </PageBody>
  )
}

interface Data {
  inbox: number
  withoutNext: number
  stalled: number
  contexts: { heading: string; tasks: Task[] }[]
  nextCount: number
  waiting: number
  rhythms: Record<RhythmId, boolean>
  stamps: { weekly: number | null; monthly: number | null }
  /** When the day was closed on the logical today, else null. */
  closedAt: number | null
  up: MoveId
}

/** The five moves with their counts, sentences and destinations (open-loops "Loop home", the table). */
function movesOf(d: Data): Move[] {
  const inboxSentence = t('{n, plural, =0 {The Inbox is empty} one {# in the Inbox} other {# in the Inbox}}', { n: d.inbox })
  const decideSentence = t('{n, plural, =0 {Nothing to decide} one {# to decide} other {# to decide}}', { n: d.inbox })
  const placeSentence = t('{n, plural, =0 {Every project has a next action} one {# project without a next action} other {# projects without a next action}}', { n: d.withoutNext })
  const nextSentence = t('{n, plural, =0 {No next action} one {# next action} other {# next actions}}', { n: d.nextCount })
  const reviewRoute: Route = d.rhythms.daily ? { view: 'review', step: 'daily' } : d.rhythms.weekly ? { view: 'review' } : d.rhythms.monthly ? { view: 'review', step: 'monthly' } : { view: 'review' }
  const rhythmLines = RHYTHMS.map((r) => {
    const due = d.rhythms[r.id]
    const when = due ? t('due') : r.id === 'daily' ? t('done today') : reviewAgo(d.stamps[r.id])
    return { id: r.id, name: termName(r), due, when }
  })
  return [
    { id: 'catch', icon: ICONS.catch, route: { view: 'inbox' }, sentence: inboxSentence, count: d.inbox || null, unit: t('in the Inbox'), lines: [d.inbox ? termDescription(inboxPlace) : inboxSentence], action: t('Open the Inbox') },
    { id: 'clarify', icon: ICONS.clarify, route: { view: 'triage' }, sentence: decideSentence, count: d.inbox || null, unit: t('to decide'), lines: [d.inbox ? termDescription(move('clarify')) : decideSentence], action: t('Process the Inbox') },
    {
      id: 'place', icon: ICONS.place, route: { view: 'review', step: 'projects' }, sentence: placeSentence, count: d.withoutNext || null,
      unit: t('{n, plural, one {project without a next action} other {projects without a next action}}', { n: d.withoutNext }),
      lines: [d.withoutNext ? '' : placeSentence, ...(d.stalled ? [t('{n, plural, one {# stalled} other {# stalled}}', { n: d.stalled })] : [])].filter(Boolean),
      action: t('Walk your projects'),
    },
    {
      id: 'do', icon: ICONS.do, route: { view: 'next' }, sentence: nextSentence, count: d.nextCount, unit: t('{n, plural, one {next action} other {next actions}}', { n: d.nextCount }),
      lines: [t('{n} waiting', { n: d.waiting }), ...(d.contexts.length ? [<Chips key="c" groups={d.contexts} />] : [])],
      action: t('Go to Next'),
    },
    {
      id: 'review', icon: ICONS.review, route: reviewRoute, count: null, lines: rhythmLines.map((r) => <Rhythm key={r.id} {...r} lit={d.up === 'review'} />),
      sentence: rhythmLines.map((r) => `${r.name}: ${r.when}`).join(', '),
      // Close the day (close-the-day D6): a plain link, never the primary action, and it does not change the next move.
      extra: d.closedAt
        ? <span data-loop-day="closed">{t('Day: closed {time}', { time: formatInstant(d.closedAt, 'time') })}</span>
        : <a href={routePath(CLOSE_ROUTE)} onClick={linkTo(CLOSE_ROUTE)} className="inline-flex min-h-6 items-center text-accent underline" data-loop-day="open">{t('Close the day')}</a>,
      action: d.rhythms.daily ? t('Start the daily check') : d.rhythms.monthly && !d.rhythms.weekly ? t('Open the monthly look') : t('Open the weekly review'),
    },
  ]
}

function Chips({ groups }: { groups: { heading: string; tasks: Task[] }[] }) {
  return (
    <span className="flex flex-wrap gap-1" data-loop-contexts>
      {groups.slice(0, 3).map((g) => (
        <span key={g.heading} className="rounded-chip border border-default bg-sunken px-1.5 text-hint text-default">{g.heading} {new Set(g.tasks.map((x) => x.id)).size}</span>
      ))}
    </span>
  )
}

function Rhythm({ name, due, when, lit }: { name: string; due: boolean; when: string; lit: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${due ? 'bg-warning' : 'bg-success'}`} />
      <span>{name}{' '}</span>
      <span className={due ? (lit ? 'font-semibold' : 'font-semibold text-warning') : undefined}>{when}</span>
    </span>
  )
}

/** The five moves on one rail, in method order; the next move is lit and carries the page's only primary action. */
function Rail({ moves, up }: { moves: Move[]; up: MoveId }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label={t('The five moves')} data-loop-tiles>
      {moves.map((m) => {
        const lit = m.id === up
        const done = m.count === null && m.id !== 'review'
        return (
          <li key={m.id} data-loop-tile={m.id} data-loop-up={lit || undefined} className={`flex flex-col rounded-card border shadow-1 transition duration-(--duration-ui) ease-calm ${lit ? 'border-accent bg-accent-soft' : 'border-default bg-surface'}`}>
            <a href={routePath(m.route)} onClick={linkTo(m.route)}
              className="flex flex-1 flex-col gap-1 rounded-card p-3 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus">
              <h2 className={`flex items-center gap-1.5 text-meta font-semibold uppercase tracking-wide ${lit ? 'text-on-accent-soft' : 'text-muted'}`}>
                <Icon name={m.icon} />{termName(move(m.id))}
              </h2>{' '}
              {m.id !== 'review' && !done && <span className="sr-only">{m.sentence}</span>}
              {m.id !== 'review' && (
                <span className="flex items-baseline gap-1.5" aria-hidden="true">
                  {done ? <span className="flex self-center text-success" data-loop-done><Icon name="circle-check-big" size="md" /></span> : <span className="text-h1 font-semibold tabular-nums text-strong">{m.count}</span>}
                  {!done && <span className={`text-meta ${lit ? 'text-on-accent-soft' : 'text-muted'}`}>{m.unit}</span>}
                </span>
              )}
              <span className={`flex flex-col gap-1 text-meta ${lit ? 'text-on-accent-soft' : 'text-muted'}`}>
                {m.lines.map((line, i) => <span key={i} className="user-text">{line}{' '}</span>)}
              </span>
            </a>
            {m.extra && <div className={`px-3 pb-3 text-meta ${lit ? 'text-on-accent-soft' : 'text-muted'}`} data-loop-extra>{m.extra}</div>}
            {lit && <div className="px-3 pb-3"><Button size="sm" variant="primary" iconEnd="arrow-right" onClick={() => navigate(m.route)} data-loop-action>{m.action}</Button></div>}
          </li>
        )
      })}
    </ul>
  )
}

/** Today's focus from the Daily check, with how many of the chosen tasks are done. */
function Focus({ tasks, projectMap, labelMap }: { tasks: Task[]; projectMap: Map<string, Project>; labelMap: Map<string, Label> }) {
  const done = tasks.filter((x) => x.completed_at).length
  // The time column (rows-v2 D2): one fact of the focus list.
  const timeColumn = hasTimeColumn(tasks)
  const r = 7
  const c = 2 * Math.PI * r
  return (
    <section className="mt-6" aria-labelledby="loop-focus" data-loop-focus>
      <div className="mb-1 flex items-center gap-2 px-2">
        <h2 id="loop-focus" className="text-meta font-semibold text-faint">{t('Today’s focus')}</h2>
        {tasks.length > 0 && (
          <span className="ml-auto flex items-center gap-1.5 text-meta tabular-nums text-muted" data-loop-focus-progress>
            <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 -rotate-90">
              <circle cx="9" cy="9" r={r} fill="none" strokeWidth="3" className="stroke-(--ot-border)" />
              <circle cx="9" cy="9" r={r} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-(--ot-accent) transition-[stroke-dashoffset] duration-(--duration-emphasis) ease-calm"
                strokeDasharray={c} strokeDashoffset={c * (1 - done / tasks.length)} />
            </svg>
            {t('{done} of {total} done', { done, total: tasks.length })}
          </span>
        )}
      </div>
      {tasks.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 px-2 py-1 text-body text-faint">
          <span>{t('No focus chosen today.')}</span>
          <Button size="sm" onClick={() => navigate({ view: 'review', step: 'daily' })}>{t('Pick up to three in the Daily check')}</Button>
        </div>
      ) : (
        <ul>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} project={task.project_id ? projectMap.get(task.project_id) : undefined} labels={resolveLabels(task.labels, labelMap)}
              showProject selected={false} timeColumn={timeColumn} onToggle={() => act(setTaskCompleted(task.id, !task.completed_at))} onOpen={() => setPanelTaskId(task.id)} />
          ))}
        </ul>
      )}
    </section>
  )
}

interface PulseData { week: number; lastWeek: number; decided: number; caught: number; age: number | null; days: { date: string; count: number }[] }

/** The Loop pulse (open-loops "Loop pulse"): four figures about the last 14 days, from the statistics definitions. */
function Pulse({ pulse }: { pulse: PulseData }) {
  const dt = useDateTimeFormat().resolved
  const delta = pulse.week - pulse.lastWeek
  const max = Math.max(1, ...pulse.days.map((d) => d.count))
  const pct = pulse.caught ? Math.round((100 * pulse.decided) / pulse.caught) : 0
  const stale = pulse.age !== null && pulse.age > INBOX_AGE_CAUTION_DAYS
  const figure = 'flex min-w-0 flex-col gap-0.5 rounded-card border border-default bg-surface px-3 py-2.5'
  const label = 'break-words text-hint font-semibold uppercase tracking-wide text-muted'
  const value = 'flex items-baseline gap-1.5 text-h2 font-semibold tabular-nums text-strong'
  return (
    <section className="mt-6" aria-labelledby="loop-pulse" data-loop-pulse>
      <div className="mb-1 flex items-center gap-2 px-2">
        <h2 id="loop-pulse" className="text-meta font-semibold text-faint">{t('Loop pulse · last {n} days', { n: PULSE_DAYS })}</h2>
        <a href={routePath({ view: 'stats' })} onClick={linkTo({ view: 'stats' })} className="ml-auto text-meta text-accent underline">{t('Statistics')}</a>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-[1fr_1fr_1fr_1.6fr]">
        <div className={figure} data-pulse="week">
          <span className={label}>{t('Done this week')}</span>
          <span className={value}>{pulse.week}<span className="text-meta font-normal text-muted">{t('{n, plural, one {task} other {tasks}}', { n: pulse.week })}</span></span>
          <span className={`break-words text-meta ${delta < 0 ? 'text-on-warning-soft' : 'text-on-success-soft'}`}>{t('{n} vs last week', { n: delta > 0 ? `+${delta}` : String(delta) })}</span>
        </div>
        <div className={figure} data-pulse="decided">
          <span className={label}>{t('Caught, decided')}</span>
          <span className={value}>{pulse.decided}<span className="text-meta font-normal text-muted">{t('of {n}', { n: pulse.caught })}</span></span>
          <span className="break-words text-meta text-muted">{t('{pct}% left the Inbox', { pct })}</span>
        </div>
        <div className={figure} data-pulse="age">
          <span className={label}>{t('Oldest in Inbox')}</span>
          <span className={value}>
            {pulse.age === null ? <span className="text-body font-semibold text-success">{t('empty')}</span>
              : <>{pulse.age}<span className="text-meta font-normal text-muted">{t('{n, plural, one {day} other {days}}', { n: pulse.age })}</span></>}
          </span>
          <span className={`break-words text-meta ${stale ? 'text-on-warning-soft' : 'text-muted'}`}>{pulse.age === null ? t('nothing waiting') : stale ? t('older than a week') : t('within the week')}</span>
        </div>
        <div className={`${figure} col-span-2 lg:col-span-1`} data-pulse="strip">
          <span className={label}>{t('Completed per day')}</span>
          <div className="flex h-10 items-end gap-0.5" aria-hidden="true">
            {pulse.days.map((d) => (
              <Tooltip key={d.date} label={`${formatDate(d.date, 'compact', dt)}: ${d.count}`}>
                <span tabIndex={-1} className={`block min-w-0 flex-1 rounded-chip ${d.count ? 'bg-accent' : 'bg-(--ot-border)'}`} style={{ height: `${Math.max(6, Math.round((100 * d.count) / max))}%` }} />
              </Tooltip>
            ))}
          </div>
          <span className="flex justify-between text-hint tabular-nums text-faint" aria-hidden="true">
            <span>{formatDate(pulse.days[0].date, 'compact', dt)}</span><span className="text-muted">{t('{n} this week', { n: pulse.week })}</span><span>{t('today')}</span>
          </span>
          <ul className="sr-only" aria-label={t('Completed per day, last {n} days', { n: PULSE_DAYS })} data-loop-strip-values>
            {pulse.days.map((d) => <li key={d.date}>{t('{date}: {n, plural, one {# task} other {# tasks}}', { date: formatDate(d.date, 'long', dt), n: d.count })}</li>)}
          </ul>
        </div>
      </div>
    </section>
  )
}

/** The loading state has the final layout's shape, so nothing shifts when the rows arrive. */
export function LoopSkeleton() {
  return (
    <div data-loop-skeleton>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} shape="card" count={1} label="" />)}
      </div>
      <Skeleton shape="row" count={3} className="mt-6" />
    </div>
  )
}
