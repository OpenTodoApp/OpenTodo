// Statistics computed on the device (OpenSpec change `stats-and-review`, design D1):
// what a user completed, created and let slip over a period, from the local rows
// only. Pure: no request, no write, no cache. The same definitions run on the
// server for the weekly digest (internal/digest/stats.go), pinned by the shared
// fixture internal/digest/testdata/stats_fixture.json.
import { resolveRange, shiftISO, weekdayOf } from './filter/parse'
import { todayISO } from './dates'
import type { Membership, Project, Task } from './types'

export type PeriodKind = 'this-week' | 'last-week' | '4-weeks' | '12-weeks'
export const PERIOD_KINDS: readonly PeriodKind[] = ['this-week', 'last-week', '4-weeks', '12-weeks']
export const PERIOD_LABELS: Record<PeriodKind, string> = {
  'this-week': 'This week', 'last-week': 'Last week', '4-weeks': 'Last 4 weeks', '12-weeks': 'Last 12 weeks',
}

/** An inclusive range of local days; `weeks` is the number of weeks it spans (1, 4 or 12). */
export interface Period {
  kind: PeriodKind
  start: string
  end: string
  weeks: number
}

/**
 * The days a period covers, from the viewer's `today` and first day of the week
 * (0 = Sunday). Weeks are resolved by the filter grammar's period code, so `this
 * week` here is `completed = this week` there. The current week ends today.
 */
export function periodFor(kind: PeriodKind, today: string, weekStart: number): Period {
  const week = (offset: number) => resolveRange({ type: 'period', unit: 'week', offset }, today, weekStart)
  const current = week(0)
  switch (kind) {
    case 'last-week': {
      const r = week(-1)
      return { kind, start: r.start, end: r.end, weeks: 1 }
    }
    case '4-weeks':
      return { kind, start: shiftISO(current.start, -21), end: today, weeks: 4 }
    case '12-weeks':
      return { kind, start: shiftISO(current.start, -77), end: today, weeks: 12 }
    default:
      return { kind: 'this-week', start: current.start, end: today, weeks: 1 }
  }
}

/** Every day of a period, oldest first. */
export function daysOf(p: Pick<Period, 'start' | 'end'>): string[] {
  const out: string[] = []
  for (let d = p.start; d <= p.end; d = shiftISO(d, 1)) out.push(d)
  return out
}

type StatTask = Pick<Task, 'id' | 'project_id' | 'created_at' | 'completed_at' | 'deleted_at' | 'due' | 'series_id' | 'assignee_id'>
  & Partial<Pick<Task, 'skipped' | 'completed_by'>>
type StatProject = Pick<Project, 'id' | 'name' | 'archived' | 'deleted_at'>

export interface StatsInput<T extends StatTask = Task> {
  tasks: readonly T[]
  projects: readonly StatProject[]
  /** Ids of the projects shared with the user (the local membership cache). */
  shared: ReadonlySet<string>
  /** The signed-in account id. */
  me: string | null
  /** The viewer's local day, YYYY-MM-DD. */
  today: string
  /** The local day of an instant; the device's zone by default (the server passes the digest's zone). */
  dayOf?: (ms: number) => string
}

export interface ProjectCount {
  /** The project id, '' for the Inbox, 'other' for the rest. */
  id: string
  name: string
  count: number
}

export interface Stats<T extends StatTask = Task> {
  completed: number
  created: number
  late: number
  slipped: number
  overdue: number
  /** Completions per day of the period, oldest first. */
  perDay: { date: string; count: number }[]
  /** Completions per week of the period (the week's first day), oldest first. */
  perWeek: { start: string; count: number }[]
  /** Completions per weekday, starting on the first day of the week (index 0 = that day). */
  perWeekday: { weekday: number; count: number }[]
  /** The five projects with most completions, then "other", in descending order. */
  perProject: ProjectCount[]
  lateTasks: T[]
  slippedTasks: T[]
  overdueTasks: T[]
}

/** Ids of the shared projects from the membership cache. */
export function sharedIds(memberships: readonly Pick<Membership, 'projectId'>[]): Set<string> {
  return new Set(memberships.map((m) => m.projectId))
}

const deviceDay = (ms: number) => todayISO(new Date(ms))

/**
 * Whether a row counts for the user (design D1): every row outside shared
 * projects; in a shared project the account that completed it when recorded
 * (`completed_by`), otherwise the assignee, or the user when unassigned.
 */
export function isMine(item: StatTask, shared: ReadonlySet<string>, me: string | null): boolean {
  if (!item.project_id || !shared.has(item.project_id)) return true
  if (item.completed_at !== null && item.completed_by) return item.completed_by === me
  return !item.assignee_id || item.assignee_id === me
}

/** The rows statistics see: live (not in the Trash, nor in a trashed project), not a skipped habit occurrence, and the user's. */
export function countedTasks<T extends StatTask>(input: Pick<StatsInput<T>, 'tasks' | 'projects' | 'shared' | 'me'>): T[] {
  const trashed = new Set(input.projects.filter((p) => p.deleted_at).map((p) => p.id))
  return input.tasks.filter((item) => !item.deleted_at && !(item.project_id && trashed.has(item.project_id)) && !item.skipped && isMine(item, input.shared, input.me))
}

/** Open tasks due before today, outside archived projects, oldest due first. */
export function overdueOf<T extends StatTask>(counted: readonly T[], projects: readonly StatProject[], today: string): T[] {
  const archived = new Set(projects.filter((p) => p.archived).map((p) => p.id))
  return counted
    .filter((item) => item.completed_at === null && item.due && item.due.date < today && !(item.project_id && archived.has(item.project_id)))
    .sort((a, b) => (a.due!.date < b.due!.date ? -1 : a.due!.date > b.due!.date ? 1 : a.id < b.id ? -1 : 1))
}

export function compute<T extends StatTask>(input: StatsInput<T>, period: Pick<Period, 'start' | 'end'>, weekStart = 1): Stats<T> {
  const dayOf = input.dayOf ?? deviceDay
  const { today } = input
  const counted = countedTasks(input)
  const inPeriod = (d: string) => d >= period.start && d <= period.end
  const days = daysOf(period)
  const perDay = new Map(days.map((d) => [d, 0]))
  const perWeekday = new Map<number, number>(Array.from({ length: 7 }, (_, i) => [(weekStart + i) % 7, 0]))
  const perWeek = new Map<string, number>()
  for (let i = 0; i < days.length; i += 7) perWeek.set(days[i], 0)
  const projectCounts = new Map<string, number>()
  let completed = 0
  let created = 0
  const lateTasks: T[] = []
  const slippedTasks: T[] = []
  for (const item of counted) {
    const doneDay = item.completed_at !== null ? dayOf(item.completed_at) : null
    if (doneDay !== null && inPeriod(doneDay)) {
      completed++
      perDay.set(doneDay, (perDay.get(doneDay) ?? 0) + 1)
      const wd = weekdayOf(doneDay)
      perWeekday.set(wd, (perWeekday.get(wd) ?? 0) + 1)
      const weekKey = days[Math.floor(days.indexOf(doneDay) / 7) * 7]
      perWeek.set(weekKey, (perWeek.get(weekKey) ?? 0) + 1)
      const pk = item.project_id ?? ''
      projectCounts.set(pk, (projectCounts.get(pk) ?? 0) + 1)
      if (item.due && doneDay > item.due.date) lateTasks.push(item)
    }
    if (item.series_id === null && inPeriod(dayOf(item.created_at))) created++
    if (item.due && inPeriod(item.due.date) && item.due.date < today && (doneDay === null || doneDay > period.end)) slippedTasks.push(item)
  }
  const names = new Map(input.projects.map((p) => [p.id, p.name]))
  const ranked = [...projectCounts.entries()]
    .map(([id, count]) => ({ id, name: id ? names.get(id) ?? 'Project' : 'Inbox', count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const perProject = ranked.slice(0, 5)
  const rest = ranked.slice(5).reduce((n, p) => n + p.count, 0)
  if (rest > 0) perProject.push({ id: 'other', name: 'Other', count: rest })
  const byDue = (a: T, b: T) => (a.due!.date < b.due!.date ? -1 : a.due!.date > b.due!.date ? 1 : 0)
  const overdueTasks = overdueOf(counted, input.projects, today)
  return {
    completed, created, late: lateTasks.length, slipped: slippedTasks.length, overdue: overdueTasks.length,
    perDay: days.map((date) => ({ date, count: perDay.get(date) ?? 0 })),
    perWeek: [...perWeek.entries()].map(([start, count]) => ({ start, count })),
    perWeekday: [...perWeekday.entries()].map(([weekday, count]) => ({ weekday, count })),
    perProject,
    lateTasks: lateTasks.sort(byDue), slippedTasks: slippedTasks.sort(byDue), overdueTasks,
  }
}

/** The local day of an instant in an IANA zone (tests and the shared fixture). */
export function dayInZone(zone: string): (ms: number) => string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
  return (ms) => {
    const parts = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]))
    return `${parts.year}-${parts.month}-${parts.day}`
  }
}
