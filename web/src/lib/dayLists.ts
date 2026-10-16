// The Today, Upcoming and project lists as pure functions (OpenSpec change
// `display-mode`, design D3): the list screen (TaskListView) and the display
// (app/display) both call these, so a display can never disagree with the list.
import { addDaysISO, todayISO } from './dates'
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
  return tasks.filter((task) => !task.project_id || !hidden.has(task.project_id) || task.project_id === keepProject)
}

/** Today: open tasks due today or earlier (or deadline / start reached), by due then priority. */
export function todayList(tasks: readonly Task[], today: string): Task[] {
  return tasks.filter((task) => inToday(task, today)).sort(compareDueThenPriority)
}

/**
 * Upcoming: open, active tasks due after today, and undated ones whose deadline
 * is ahead. Undated tasks sort after dated ones, so a deadline-only task follows
 * the tasks due that day within its group (deadlines D3).
 */
export function upcomingList(tasks: readonly Task[], today: string): Task[] {
  return tasks.filter((task) => inUpcoming(task, today)).sort(compareDueThenPriority)
}

/** A project's open tasks (any order; the project list builds its tree and sections from them). */
export function projectOpenList(tasks: readonly Task[], projectId: string): Task[] {
  return tasks.filter((task) => !task.completed_at && task.project_id === projectId)
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
  const waiting = list.filter((task) => blocked.has(task.id))
  const ready = waiting.length ? list.filter((tk) => !blocked.has(tk.id)) : [...list]
  const overdue = ready.filter((item) => overdueInToday(item, today))
  const rest = ready.filter((task) => !overdueInToday(task, today))
  return { overdue, day: rest.filter((task) => !task.evening), evening: rest.filter((task) => task.evening), blocked: waiting }
}

/** Upcoming's list (already sorted) bucketed by its day, in date order. */
export function groupUpcoming(list: readonly Task[]): { date: string; tasks: Task[] }[] {
  const byDate = new Map<string, Task[]>()
  for (const task of list) {
    const date = upcomingDate(task)
    if (!date) continue
    const bucket = byDate.get(date)
    if (bucket) bucket.push(task)
    else byDate.set(date, [task])
  }
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([date, tasks]) => ({ date, tasks }))
}

/**
 * The next `days` days after `today`, each with the Upcoming tasks listed under
 * it (an empty list on a free day), for the display's columns.
 */
export function nextDays(tasks: readonly Task[], today: string, days: number): { date: string; tasks: Task[] }[] {
  const byDate = new Map(groupUpcoming(upcomingList(tasks, today)).map((g) => [g.date, g.tasks]))
  return Array.from({ length: Math.max(0, days) }, (_, i) => {
    const date = addDaysISO(today, i + 1)
    return { date, tasks: byDate.get(date) ?? [] }
  })
}

/** Tasks completed on the local calendar day `today`, most recent first; a habit's skipped record is not a completion (habits D6). */
export function completedOn(tasks: readonly Task[], today: string): Task[] {
  return tasks
    .filter((task) => task.completed_at !== null && !task.deleted_at && !task.skipped && todayISO(new Date(task.completed_at)) === today)
    .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
}
