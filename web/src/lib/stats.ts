// Statistics of the user's own work (OpenSpec `stats-and-review`, design D1):
// pure functions over the local rows, so the screen works offline and every
// device computes the same numbers. Days are the device's local days.
import { addDaysISO, localDueOf, todayISO } from './dates'
import type { Membership, Project, Task } from './types'

export type PeriodKind = 'this-week' | 'last-week' | '4-weeks' | '12-weeks'

export interface Period {
  kind: PeriodKind
  /** First day, YYYY-MM-DD. */
  start: string
  /** Last day shown (today for a period that runs to now), YYYY-MM-DD. */
  last: string
  startMs: number
  /** Exclusive end: now for a running period, else midnight after the last day. */
  endMs: number
  /** Whether the period runs to now. */
  running: boolean
  /** Every day from start to last. */
  days: string[]
  /** The first day of each week in the period. */
  weeks: string[]
}

const midnight = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

function weekStartFor(iso: string, weekStart: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return addDaysISO(iso, -((new Date(y, m - 1, d).getDay() - weekStart + 7) % 7))
}

/**
 * The period of `kind` around `today`, weeks starting on `weekStart` (0 = Sunday):
 * this week runs to now, last week is the full week before, and 4 or 12 weeks are
 * the full weeks before the current one plus the current week to now.
 */
export function periodFor(kind: PeriodKind, today: string, weekStart: number, now = Date.now()): Period {
  const thisWeek = weekStartFor(today, weekStart)
  const weeksBack = kind === '4-weeks' ? 3 : kind === '12-weeks' ? 11 : 0
  const start = kind === 'last-week' ? addDaysISO(thisWeek, -7) : addDaysISO(thisWeek, -7 * weeksBack)
  const running = kind !== 'last-week'
  const last = running ? today : addDaysISO(thisWeek, -1)
  const days: string[] = []
  for (let d = start; d <= last; d = addDaysISO(d, 1)) days.push(d)
  const weeks: string[] = []
  for (let w = start; w <= last; w = addDaysISO(w, 7)) weeks.push(w)
  return { kind, start, last, startMs: midnight(start), endMs: running ? now : midnight(thisWeek), running, days, weeks }
}

export interface ProjectCount {
  /** A project id, null for the Inbox, 'other' for the rest. */
  projectId: string | null
  count: number
}

export interface Stats {
  completed: number
  created: number
  late: number
  slipped: number
  overdue: number
  perDay: { date: string; count: number }[]
  /** Completions per weekday, starting on the first day of the week (0 … 6 offsets from it). */
  perWeekday: number[]
  perWeek: { start: string; count: number }[]
  perProject: ProjectCount[]
  lateTasks: Task[]
  slippedTasks: Task[]
}

/** Top projects named in the breakdown; the rest is "other". */
export const TOP_PROJECTS = 5

/**
 * Whether a row counts as the user's: live, and in a shared project not assigned
 * to someone else (local rows record the assignee, not who completed a task).
 */
export function counts(task: Pick<Task, 'deleted_at' | 'project_id' | 'assignee_id'>, memberships: ReadonlyMap<string, Membership>, me: string | null): boolean {
  if (task.deleted_at) return false
  if (task.project_id && memberships.has(task.project_id) && task.assignee_id && task.assignee_id !== me) return false
  return true
}

/** The statistics of `period`. `projects` limits the breakdown to known projects (others count as Inbox-less "other"). */
export function compute(
  tasks: readonly Task[], projects: readonly Pick<Project, 'id'>[], memberships: ReadonlyMap<string, Membership>, me: string | null,
  period: Period, today: string, weekStart: number,
): Stats {
  const known = new Set(projects.map((p) => p.id))
  const perDay = new Map(period.days.map((d) => [d, 0]))
  const perWeek = new Map(period.weeks.map((w) => [w, 0]))
  const perWeekday = [0, 0, 0, 0, 0, 0, 0]
  const perProject = new Map<string | null, number>()
  const out: Stats = { completed: 0, created: 0, late: 0, slipped: 0, overdue: 0, perDay: [], perWeekday, perWeek: [], perProject: [], lateTasks: [], slippedTasks: [] }
  const inPeriod = (ms: number | null) => ms !== null && ms >= period.startMs && ms < period.endMs
  const slipEnd = period.running ? today : addDaysISO(period.last, 1)
  for (const t of tasks) {
    if (!counts(t, memberships, me)) continue
    const due = t.due ? localDueOf(t.due).date : null
    if (inPeriod(t.created_at)) out.created++
    if (t.completed_at === null && due && due < today) out.overdue++
    if (inPeriod(t.completed_at)) {
      out.completed++
      const day = todayISO(new Date(t.completed_at!))
      if (perDay.has(day)) perDay.set(day, perDay.get(day)! + 1)
      const week = weekStartFor(day, weekStart)
      if (perWeek.has(week)) perWeek.set(week, perWeek.get(week)! + 1)
      const [y, m, d] = day.split('-').map(Number)
      perWeekday[(new Date(y, m - 1, d).getDay() - weekStart + 7) % 7]++
      const pid = t.project_id && known.has(t.project_id) ? t.project_id : null
      perProject.set(pid, (perProject.get(pid) ?? 0) + 1)
      if (due && day > due) {
        out.late++
        out.lateTasks.push(t)
      }
    }
    if (due && due >= period.start && due < slipEnd && (t.completed_at === null || t.completed_at >= period.endMs)) {
      out.slipped++
      out.slippedTasks.push(t)
    }
  }
  out.perDay = period.days.map((date) => ({ date, count: perDay.get(date)! }))
  out.perWeek = period.weeks.map((start) => ({ start, count: perWeek.get(start)! }))
  const ranked = [...perProject.entries()].map(([projectId, count]) => ({ projectId, count })).sort((a, b) => b.count - a.count)
  out.perProject = ranked.slice(0, TOP_PROJECTS)
  const rest = ranked.slice(TOP_PROJECTS).reduce((n, x) => n + x.count, 0)
  if (rest) out.perProject.push({ projectId: 'other', count: rest })
  return out
}
