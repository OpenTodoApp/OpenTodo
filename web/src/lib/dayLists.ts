// Today, Upcoming and project lists as pure functions (OpenSpec change
// `display-mode`, design D3): the list view and the display screen select and
// group tasks through the same code, so the two can never disagree.
import { addDaysISO } from './dates'
import { blockedMap } from './dependencies'
import { compareDueThenPriority } from './ordering'
import type { Project, Task } from './types'
import { inToday, inUpcoming, overdueInToday, upcomingDate } from './views'

/**
 * Tasks the cross-project views consider: tasks of archived projects stay out,
 * except in that project's own view (`projectId`).
 */
export function unarchivedTasks(all: readonly Task[], projects: readonly Pick<Project, 'id' | 'archived'>[], projectId?: string): Task[] {
  const hidden = new Set(projects.filter((p) => p.archived).map((p) => p.id))
  return all.filter((t) => !t.project_id || !hidden.has(t.project_id) || (projectId !== undefined && t.project_id === projectId))
}

/** Today: open tasks due, deadlined or started today or earlier, by due then priority. */
export function todayTasks(all: readonly Task[], today: string): Task[] {
  return all.filter((t) => inToday(t, today)).sort(compareDueThenPriority)
}

/** Upcoming: open tasks due (or deadlined) after today, by due then priority. */
export function upcomingTasks(all: readonly Task[], today: string): Task[] {
  return all.filter((t) => inUpcoming(t, today)).sort(compareDueThenPriority)
}

/** A project's open tasks (tree order is the caller's). */
export function projectTasks(all: readonly Task[], projectId: string): Task[] {
  return all.filter((t) => !t.completed_at && t.project_id === projectId)
}

export interface TodayGroups {
  overdue: Task[]
  /** The day's tasks, This Evening excluded. */
  day: Task[]
  evening: Task[]
  /** Tasks waiting for an open blocker (task-dependencies D7). */
  blocked: Task[]
}

/**
 * Today's groups: blocked tasks wait apart, then Overdue, the day's tasks and
 * This Evening. `blocked` is the blocker map of every live task (blockedMap).
 */
export function groupToday(tasks: readonly Task[], today: string, blocked: ReadonlyMap<string, number>): TodayGroups {
  const waiting = tasks.filter((t) => blocked.has(t.id))
  const ready = waiting.length ? tasks.filter((t) => !blocked.has(t.id)) : tasks
  const overdue = ready.filter((t) => overdueInToday(t, today))
  const rest = ready.filter((t) => !overdueInToday(t, today))
  return { overdue, day: rest.filter((t) => !t.evening), evening: rest.filter((t) => t.evening), blocked: waiting }
}

/** Upcoming grouped by its listing day, in date order. */
export function groupUpcoming(tasks: readonly Task[]): { date: string; tasks: Task[] }[] {
  const byDate = new Map<string, Task[]>()
  for (const t of tasks) {
    const date = upcomingDate(t)
    if (!date) continue
    const list = byDate.get(date) ?? []
    list.push(t)
    byDate.set(date, list)
  }
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([date, list]) => ({ date, tasks: list }))
}

/**
 * The columns after today for a display showing `days` days (today included):
 * one per following date, each with the Upcoming tasks listed that day, empty
 * days kept so the columns line up with the calendar.
 */
export function nextDays(all: readonly Task[], today: string, days: number): { date: string; tasks: Task[] }[] {
  const n = Math.max(1, Math.min(7, Math.floor(days))) - 1
  const byDate = new Map(groupUpcoming(upcomingTasks(all, today)).map((g) => [g.date, g.tasks]))
  const out: { date: string; tasks: Task[] }[] = []
  for (let i = 1; i <= n; i++) {
    const date = addDaysISO(today, i)
    out.push({ date, tasks: byDate.get(date) ?? [] })
  }
  return out
}

/** Tasks completed on `today` (local day of `completed_at`), most recent first. */
export function completedToday(all: readonly Task[], today: string): Task[] {
  return all.filter((t) => t.completed_at && localDay(t.completed_at) === today).sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
}

function localDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Convenience for screens: Today's groups from every live task. */
export function todayGroups(all: readonly Task[], projects: readonly Pick<Project, 'id' | 'archived'>[], today: string): TodayGroups {
  return groupToday(todayTasks(unarchivedTasks(all, projects), today), today, blockedMap(all))
}
