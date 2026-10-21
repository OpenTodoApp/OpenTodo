// The Today, Upcoming and project lists as pure functions (OpenSpec change
// `display-mode`, design D3): the list screen (TaskListView) and the display
// (app/display) both call these, so a display can never disagree with the list.
import { addDaysISO, currentDayStart, logicalDay } from './dates'
import { compareDueThenPriority } from './ordering'
import type { Project, Task } from './types'
import { inToday, inUpcoming, overdueInToday, upcomingDate } from './views'

/**
 * The tasks the cross-project views consider: tasks of archived projects stay
 * out, except in the archived project's own list (`keepProject`).
 */
export function withoutArchived(tasks: readonly Task[], projects: readonly Pick<Project, 'id' | 'archived'>[], keepProject?: string): Task[] {
  const hidden = new Set(projects.filter((p) => p.archived).map((p) => p.id))
  if (hidden.size === 0) return [...tasks]
  return tasks.filter((t) => !t.project_id || !hidden.has(t.project_id) || t.project_id === keepProject)
}

/** Today: open tasks due today or earlier (or deadline / start reached), by due then priority. */
export function todayList(tasks: readonly Task[], today: string): Task[] {
  return tasks.filter((t) => inToday(t, today)).sort(compareDueThenPriority)
}

/**
 * Upcoming: open, active tasks due after today, and undated ones whose deadline
 * is ahead. Undated tasks sort after dated ones, so a deadline-only task follows
 * the tasks due that day within its group (deadlines D3).
 */
export function upcomingList(tasks: readonly Task[], today: string): Task[] {
  return tasks.filter((t) => inUpcoming(t, today)).sort(compareDueThenPriority)
}

/** A project's open tasks (any order; the project list builds its tree and sections from them). */
export function projectOpenList(tasks: readonly Task[], projectId: string): Task[] {
  return tasks.filter((t) => !t.completed_at && t.project_id === projectId)
}

export interface TodayGroups {
  overdue: Task[]
  /** Today's tasks that are not in the evening. */
  day: Task[]
  /** This Evening (someday-and-evening). */
  evening: Task[]
  /** Blocked tasks (task-dependencies D7), kept apart at the end. */
  blocked: Task[]
}

/** Split Today's list (already sorted) into Overdue, the day, This Evening and Blocked. */
export function groupToday(list: readonly Task[], today: string, blocked: { has(id: string): boolean } = new Set<string>()): TodayGroups {
  const waiting = list.filter((t) => blocked.has(t.id))
  const ready = waiting.length ? list.filter((t) => !blocked.has(t.id)) : [...list]
  const overdue = ready.filter((t) => overdueInToday(t, today))
  const rest = ready.filter((t) => !overdueInToday(t, today))
  return { overdue, day: rest.filter((t) => !t.evening), evening: rest.filter((t) => t.evening), blocked: waiting }
}

/** Upcoming's list (already sorted) bucketed by its day, in date order. */
export function groupUpcoming(list: readonly Task[], today?: string): { date: string; tasks: Task[] }[] {
  const byDate = new Map<string, Task[]>()
  for (const t of list) {
    const date = upcomingDate(t, today)
    if (!date) continue
    const bucket = byDate.get(date)
    if (bucket) bucket.push(t)
    else byDate.set(date, [t])
  }
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([date, tasks]) => ({ date, tasks }))
}

/**
 * The next `days` days after `today`, each with the Upcoming tasks listed under
 * it (an empty list on a free day), for the display's columns.
 */
export function nextDays(tasks: readonly Task[], today: string, days: number): { date: string; tasks: Task[] }[] {
  const byDate = new Map(groupUpcoming(upcomingList(tasks, today), today).map((g) => [g.date, g.tasks]))
  return Array.from({ length: Math.max(0, days) }, (_, i) => {
    const date = addDaysISO(today, i + 1)
    return { date, tasks: byDate.get(date) ?? [] }
  })
}

/** Tasks completed on the logical day `today` (day-boundary D4), most recent first; a habit's skipped record is not a completion (habits D6). */
export function completedOn(tasks: readonly Task[], today: string): Task[] {
  return tasks
    .filter((t) => t.completed_at !== null && !t.deleted_at && !t.skipped && logicalDay(t.completed_at, currentDayStart()) === today)
    .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
}
