// Statistics computed on the device (OpenSpec change `stats-and-review`, design D1):
// what a user completed, created and let slip over a period, from the local rows
// only. Pure: no request, no write, no cache. The same definitions run on the
// server for the weekly digest (internal/digest/stats.go), pinned by the shared
// fixture internal/digest/testdata/stats_fixture.json.
import { resolveRange, shiftISO, weekdayOf } from './filter/parse'
import { addDaysISO, currentDayStart, logicalDay } from './dates'
import type { Membership, Project, Task } from './types'
import { t, msg, translatedMap } from './i18n'
import { minutesOf, type EntryLike } from './time'

/**
 * The periods Statistics offers (stats-dashboard D3), plus `4-weeks`, which the
 * Monthly look reads and the chooser does not offer.
 */
export type PeriodKind = 'this-week' | 'this-month' | 'this-quarter' | 'this-year' | 'last-week' | '4-weeks'
export type DashboardPeriod = Exclude<PeriodKind, '4-weeks'>
export const PERIOD_KINDS: readonly DashboardPeriod[] = ['this-week', 'this-month', 'this-quarter', 'this-year', 'last-week']
export const PERIOD_LABELS = translatedMap<PeriodKind>({
  'this-week': msg('This week'), 'this-month': msg('This month'), 'this-quarter': msg('This quarter'), 'this-year': msg('This year'),
  'last-week': msg('Last week'), '4-weeks': msg('Last 4 weeks'),
})

/** The step of the "keeping up" series: per day up to a month, per week for a quarter, per month for a year. */
export type PeriodUnit = 'day' | 'week' | 'month'

/** An inclusive range of local days; `weeks` is the number of weeks it spans, rounded up. */
export interface Period {
  kind: PeriodKind
  start: string
  end: string
  weeks: number
  unit: PeriodUnit
}

/** First day of the calendar month `months` away from the month of `iso`. */
export function monthStartOf(iso: string, months = 0): string {
  const [y, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10)
}

/** Days from `start` to `end`, both included. */
export function spanDays(start: string, end: string): number {
  const ms = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((ms(end) - ms(start)) / 86_400_000) + 1
}

const period = (kind: PeriodKind, start: string, end: string, unit: PeriodUnit): Period =>
  ({ kind, start, end, unit, weeks: Math.ceil(spanDays(start, end) / 7) })

/**
 * The days a period covers, from the viewer's logical `today` and first day of the
 * week (0 = Sunday). Weeks are resolved by the filter grammar's period code, so
 * `this week` here is `completed = this week` there. A current period ends today;
 * months, quarters and years are calendar units.
 */
export function periodFor(kind: PeriodKind, today: string, weekStart: number): Period {
  const week = (offset: number) => resolveRange({ type: 'period', unit: 'week', offset }, today, weekStart)
  switch (kind) {
    case 'last-week': {
      const r = week(-1)
      return period(kind, r.start, r.end, 'day')
    }
    case '4-weeks':
      return period(kind, shiftISO(week(0).start, -21), today, 'day')
    case 'this-month':
      return period(kind, monthStartOf(today), today, 'day')
    case 'this-quarter': {
      const month = Number(today.slice(5, 7)) - 1
      return period(kind, monthStartOf(today, -(month % 3)), today, 'week')
    }
    case 'this-year':
      return period(kind, `${today.slice(0, 4)}-01-01`, today, 'month')
    default:
      return period('this-week', week(0).start, today, 'day')
  }
}

/**
 * What a period is compared with (stats-dashboard D3): the same number of days from
 * the start of the previous unit, never past that unit's end, so a period to date
 * is never measured against a full one. Last week is compared with the week before.
 */
export function comparisonOf(p: Period, weekStart: number): Pick<Period, 'start' | 'end'> {
  const n = spanDays(p.start, p.end)
  const from = (start: string, unitEnd: string) => {
    const end = shiftISO(start, n - 1)
    return { start, end: end < unitEnd ? end : unitEnd }
  }
  switch (p.kind) {
    case 'this-month': return from(monthStartOf(p.start, -1), shiftISO(p.start, -1))
    case 'this-quarter': return from(monthStartOf(p.start, -3), shiftISO(p.start, -1))
    case 'this-year': return from(`${Number(p.start.slice(0, 4)) - 1}-01-01`, shiftISO(p.start, -1))
    case '4-weeks': return { start: shiftISO(p.start, -28), end: shiftISO(p.start, -1) }
    default: {
      // This week and last week: the week before, the same days into it.
      const prev = resolveRange({ type: 'period', unit: 'week', offset: -1 }, p.start, weekStart)
      return from(prev.start, prev.end)
    }
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
  /**
   * Time entries this device holds (OpenSpec time-tracking, design D3); only the
   * user's own live entries on live tasks count. Optional, so callers without
   * entries (the Loop pulse) are unchanged.
   */
  entries?: readonly EntryLike[]
  /** Now (Unix ms), for a running entry; Date.now() by default. */
  now?: number
}

/** Tracked minutes per project: the five with most time, then "other"; '' is the Inbox. */
export interface ProjectMinutes {
  id: string
  name: string
  minutes: number
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
  /** The user's own tracked minutes in the period, a running entry to now (time-tracking). */
  trackedMinutes: number
  /** How many of the user's entries started in the period. */
  trackedEntries: number
  /** Tracked minutes per day of the period, oldest first. */
  trackedPerDay: { date: string; minutes: number }[]
  /** Tracked minutes per project (five, then "other"), descending. */
  trackedPerProject: ProjectMinutes[]
}

/** Ids of the shared projects from the membership cache. */
export function sharedIds(memberships: readonly Pick<Membership, 'projectId'>[]): Set<string> {
  return new Set(memberships.map((m) => m.projectId))
}

/** The device's logical day of an instant (day-boundary D4); the shared fixture overrides it with `dayOf`. */
const deviceDay = (ms: number) => logicalDay(ms, currentDayStart())

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
    .map(([id, count]) => ({ id, name: id ? names.get(id) ?? t('Project') : t('Inbox'), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const perProject = ranked.slice(0, 5)
  const rest = ranked.slice(5).reduce((n, p) => n + p.count, 0)
  if (rest > 0) perProject.push({ id: 'other', name: 'Other', count: rest })
  const tracked = trackedOf(input, period, days, dayOf)
  const byDue = (a: T, b: T) => (a.due!.date < b.due!.date ? -1 : a.due!.date > b.due!.date ? 1 : 0)
  const overdueTasks = overdueOf(counted, input.projects, today)
  return {
    completed, created, late: lateTasks.length, slipped: slippedTasks.length, overdue: overdueTasks.length,
    perDay: days.map((date) => ({ date, count: perDay.get(date) ?? 0 })),
    perWeek: [...perWeek.entries()].map(([start, count]) => ({ start, count })),
    perWeekday: [...perWeekday.entries()].map(([weekday, count]) => ({ weekday, count })),
    perProject,
    lateTasks: lateTasks.sort(byDue), slippedTasks: slippedTasks.sort(byDue), overdueTasks,
    ...tracked,
  }
}

/**
 * Tracked time of a period (time-tracking D3): the user's own live entries on live
 * tasks (not in the Trash, nor in a trashed project), each counted whole on the
 * logical day it started, a running one to now.
 */
function trackedOf<T extends StatTask>(input: StatsInput<T>, period: Pick<Period, 'start' | 'end'>, days: string[], dayOf: (ms: number) => string) {
  const now = input.now ?? Date.now()
  const trashed = new Set(input.projects.filter((p) => p.deleted_at).map((p) => p.id))
  const tasks = new Map(input.tasks.filter((x) => !x.deleted_at && !(x.project_id && trashed.has(x.project_id))).map((x) => [x.id, x]))
  const perDay = new Map(days.map((d) => [d, 0]))
  const perProject = new Map<string, number>()
  let minutes = 0
  let count = 0
  for (const e of input.entries ?? []) {
    const task = tasks.get(e.task_id)
    if (e.deleted_at || e.user_id !== input.me || !task) continue
    const day = dayOf(e.started_at)
    if (day < period.start || day > period.end) continue
    const m = minutesOf(e, now)
    count++
    minutes += m
    perDay.set(day, (perDay.get(day) ?? 0) + m)
    const pk = task.project_id ?? ''
    perProject.set(pk, (perProject.get(pk) ?? 0) + m)
  }
  const names = new Map(input.projects.map((p) => [p.id, p.name]))
  const ranked = [...perProject.entries()]
    .map(([id, m]) => ({ id, name: id ? names.get(id) ?? t('Project') : t('Inbox'), minutes: m }))
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))
  const trackedPerProject = ranked.slice(0, 5)
  const rest = ranked.slice(5).reduce((n, p) => n + p.minutes, 0)
  if (rest > 0) trackedPerProject.push({ id: 'other', name: 'Other', minutes: rest })
  return { trackedMinutes: minutes, trackedEntries: count, trackedPerDay: days.map((date) => ({ date, minutes: perDay.get(date) ?? 0 })), trackedPerProject }
}

/**
 * The local day of an instant in an IANA zone (tests and the shared fixture). With
 * `dayStart` (minutes after midnight, day-boundary D2) it is the logical day in that
 * zone: the previous date while the zone's wall time is before the day start, the
 * rule `logicalDay` applies in the device's zone.
 */
export function dayInZone(zone: string, dayStart = 0): (ms: number) => string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return (ms) => {
    const parts = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]))
    const iso = `${parts.year}-${parts.month}-${parts.day}`
    return dayStart > 0 && Number(parts.hour) * 60 + Number(parts.minute) < dayStart ? addDaysISO(iso, -1) : iso
  }
}
