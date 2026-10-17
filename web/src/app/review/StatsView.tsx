// Statistics (OpenSpec change `stats-and-review`, design D1, D2, D8): what was
// completed, created and let slip over a period, computed on this device from the
// local rows with lib/stats.ts. It sends nothing and writes nothing, so it works
// offline and every synced device shows the same numbers.
import { useLiveQuery } from 'dexie-react-hooks'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { PageBody, PageHeader } from '../../ui'
import { db } from '../../lib/db'
import { formatDate, dateLocaleOf } from '../../lib/dates'
import { currentUserId } from '../../lib/sharing'
import { compute, periodFor, PERIOD_KINDS, PERIOD_LABELS, sharedIds, type PeriodKind, type Stats } from '../../lib/stats'
import type { Membership, Project, Task } from '../../lib/types'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { HelpLink } from '../help/HelpLink'
import { useToday } from '../useViews'
import { Bars } from './Bars'
import { t } from '../../lib/i18n'

const PERIOD_KEY = 'ot.stats.period'
function readPeriod(): PeriodKind {
  try {
    const v = localStorage.getItem(PERIOD_KEY)
    return (PERIOD_KINDS as readonly string[]).includes(v ?? '') ? (v as PeriodKind) : 'this-week'
  } catch {
    return 'this-week'
  }
}
function writePeriod(p: PeriodKind): void {
  try { localStorage.setItem(PERIOD_KEY, p) } catch { /* device convenience only */ }
}

/** The period chooser: a radio group with roving focus; the arrow keys change the period. */
export function PeriodChooser({ value, onChange, chooserRef }: { value: PeriodKind; onChange: (p: PeriodKind) => void; chooserRef?: React.Ref<HTMLDivElement> }) {
  const refs = useRef<Partial<Record<PeriodKind, HTMLButtonElement | null>>>({})
  const move = (e: KeyboardEvent) => {
    const i = PERIOD_KINDS.indexOf(value)
    const n = PERIOD_KINDS.length
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n
      : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (next < 0) return
    e.preventDefault()
    onChange(PERIOD_KINDS[next])
    refs.current[PERIOD_KINDS[next]]?.focus()
  }
  return (
    <div ref={chooserRef} role="radiogroup" aria-label={t('Period')} onKeyDown={move} className="inline-flex flex-wrap gap-1 rounded-control border border-default bg-sunken p-1" data-period-chooser>
      {PERIOD_KINDS.map((p) => {
        const on = p === value
        return (
          <button key={p} ref={(el) => { refs.current[p] = el }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            onClick={() => onChange(p)}
            className={`rounded-chip px-3 py-1 text-meta font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${on ? 'bg-surface text-default shadow-1' : 'text-muted hover:text-default'}`}>
            {PERIOD_LABELS[p]}
          </button>
        )
      })}
    </div>
  )
}

const NUMBERS: { key: keyof Pick<Stats, 'completed' | 'created' | 'late' | 'slipped' | 'overdue'>; label: string; hint: string }[] = [
  { key: 'completed', get label() { return t('Completed') }, get hint() { return t('including each day of a recurring task') } },
  { key: 'created', get label() { return t('Created') }, get hint() { return t('new tasks') } },
  { key: 'late', get label() { return t('Completed late') }, get hint() { return t('after their due day') } },
  { key: 'slipped', get label() { return t('Slipped') }, get hint() { return t('due in the period, not done by its end') } },
  { key: 'overdue', get label() { return t('Overdue now') }, get hint() { return t('open and due before today') } },
]

/** The screen's content for given rows; the view below feeds it live rows. */
export function StatsContent({ tasks, projects, memberships, me, today, weekStart, period, onPeriod, chooserRef }: {
  tasks: readonly Task[]
  projects: readonly Project[]
  memberships: readonly Membership[]
  me: string | null
  today: string
  weekStart: number
  period: PeriodKind
  onPeriod: (p: PeriodKind) => void
  chooserRef?: React.Ref<HTMLDivElement>
}) {
  const range = useMemo(() => periodFor(period, today, weekStart), [period, today, weekStart])
  const stats = useMemo(() => compute({ tasks, projects, shared: sharedIds(memberships), me, today }, range, weekStart),
    [tasks, projects, memberships, me, today, range, weekStart])
  const names = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects])
  const empty = stats.completed === 0 && stats.created === 0
  const wd = (iso: string) => new Intl.DateTimeFormat(dateLocaleOf(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))
  const perDay = stats.perDay.map((d, i) => ({
    label: range.weeks === 1 ? wd(d.date) : i % 7 === 0 ? formatDate(d.date, 'compact') : '',
    name: formatDate(d.date, 'heading'), value: d.count,
  }))
  const weekdayLabel = (n: number) => new Intl.DateTimeFormat(dateLocaleOf(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 11 + n)))
  const weekdayName = (n: number) => new Intl.DateTimeFormat(dateLocaleOf(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 11 + n)))
  const projectOf = (task: Task) => (task.project_id ? names.get(task.project_id) ?? t('Project') : t('Inbox'))
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PeriodChooser value={period} onChange={onPeriod} chooserRef={chooserRef} />
        <p className="flex flex-wrap items-center gap-2 text-meta text-muted" data-testid="stats-local">
          {t('{date} – {date2}. Computed on this device from your tasks; nothing is sent anywhere.', { date: formatDate(range.start, 'long'), date2: formatDate(range.end, 'long') })}
          <HelpLink screen="stats" topic={t('Statistics')} />
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="stats-numbers">
        {NUMBERS.map((n) => (
          <div key={n.key} className="rounded-card border border-default bg-surface p-3" data-number={n.key}>
            <dt className="text-meta text-muted">{n.label}</dt>
            <dd className="text-h2 font-semibold tabular-nums text-default">{stats[n.key]}</dd>
            <dd className="text-hint text-faint">{n.hint}</dd>
          </div>
        ))}
      </dl>
      {empty ? (
        <p className="rounded-card border border-dashed border-input p-4 text-body text-muted" data-testid="stats-empty">
          {t('Nothing completed or created in this period yet. Tasks you complete, including each day of a recurring task, are counted here.')}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2" data-testid="stats-charts">
          {range.weeks < 12 && <Bars title={t('Completed per day')} bars={perDay} />}
          {range.weeks > 1 && <Bars title={t('Completed per week')} bars={stats.perWeek.map((w) => ({ label: formatDate(w.start, 'compact'), name: t('Week of {date}', { date: formatDate(w.start, 'long') }), value: w.count }))} />}
          {range.weeks > 1 && <Bars title={t('Completed per weekday')} bars={stats.perWeekday.map((w) => ({ label: weekdayLabel(w.weekday), name: weekdayName(w.weekday), value: w.count }))} />}
          {stats.perProject.length > 0 && <Bars title={t('Completed per project')} bars={stats.perProject.map((p) => ({ label: p.name, value: p.count }))} />}
        </div>
      )}
      <TaskList title={t('Completed late')} empty={t('Nothing was completed late.')} tasks={stats.lateTasks} projectOf={projectOf} />
      <TaskList title={t('Slipped')} empty={t('Nothing slipped.')} tasks={stats.slippedTasks} projectOf={projectOf} />
    </div>
  )
}

function TaskList({ title, empty, tasks, projectOf }: { title: string; empty: string; tasks: readonly Task[]; projectOf: (task: Task) => string }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-1 text-meta font-semibold uppercase tracking-wide text-faint">{title}</h2>
      {tasks.length === 0 ? <p className="text-meta text-muted">{empty}</p> : (
        <ul className="divide-y divide-(--ot-border) rounded-card border border-default bg-surface">
          {tasks.map((tk) => (
            <li key={tk.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-body">
              <span className="min-w-0 truncate text-default">{tk.title}</span>
              <span className="text-meta text-muted">{t('{projectOf} · due', { projectOf: projectOf(tk) })}{' '}{tk.due ? formatDate(tk.due.date, 'compact') : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function StatsView() {
  const today = useToday()
  const weekStart = useDateTimeFormat().resolved.weekStart
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], [] as Task[])
  // Deleted projects too: their tasks are in the Trash with them and must not count.
  const projects = useLiveQuery(() => db.projects.toArray(), [], [] as Project[])
  const memberships = useLiveQuery(() => db.memberships.toArray(), [], [] as Membership[])
  const me = useLiveQuery(() => currentUserId(), [], null)
  const [period, setPeriod] = useState<PeriodKind>(readPeriod)
  const title = useRef<HTMLHeadingElement>(null)
  // The heading takes focus, so Tab reaches the period chooser first (statistics "Keyboard").
  useEffect(() => { title.current?.focus() }, [])
  return (
    <PageBody width="full" className="max-w-5xl">
      <PageHeader title={t('Statistics')} icon="chart-column" titleRef={title} titleTabIndex={-1} />
      <StatsContent tasks={tasks} projects={projects} memberships={memberships} me={me} today={today} weekStart={weekStart}
        period={period} onPeriod={(p) => { setPeriod(p); writePeriod(p) }} />
    </PageBody>
  )
}
