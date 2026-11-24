// The Today, Upcoming and project lists as pure functions (OpenSpec change
// `display-mode`, design D3): the list screen (TaskListView) and the display
// (app/display) both call these, so a display can never disagree with the list.
import { addDaysISO, compareDue, currentDayStart, localDueOf, logicalDay } from './dates'
import { blockedMap } from './dependencies'
import { placedPart } from './dayParts'
import { compareByPosition, compareDueThenPriority } from './ordering'
import type { Project, Task } from './types'
import { inToday, inUpcoming, overdueInToday, upcomingDate } from './views'

/**
 * The tasks the cross-project views consider: tasks of archived projects stay
 * out, except in the archived project's own list (`keepProject`), and graduated
 * habits stay out of every list (habits-home D7).
 */
export function withoutArchived(tasks: readonly Task[], projects: readonly Pick<Project, 'id' | 'archived'>[], keepProject?: string): Task[] {
  const hidden = new Set(projects.filter((p) => p.archived).map((p) => p.id))
  // A graduated habit is in no list (habits-home D7) whatever its project.
  if (hidden.size === 0) return tasks.some((t) => t.habit_graduated_at != null) ? tasks.filter((t) => t.habit_graduated_at == null) : [...tasks]
  return tasks.filter((t) => t.habit_graduated_at == null && (!t.project_id || !hidden.has(t.project_id) || t.project_id === keepProject))
}

/**
 * The personal views (Inbox, Today, Upcoming, Anytime, Someday, Next) leave out a task
 * assigned to someone else (personal-views-assignee): it is theirs to do, and it stays
 * in its project, Waiting and the Filter view. `me` is the viewer; without one nothing is left out.
 */
export function assignedToSomeoneElse(task: Pick<Task, 'assignee_id'>, me: string | null | undefined): boolean {
  return !!me && !!task.assignee_id && task.assignee_id !== me
}

/** Today: open tasks due today or earlier (or deadline / start reached), by due then priority, without tasks assigned to someone other than `me`. */
export function todayList(tasks: readonly Task[], today: string, me?: string | null): Task[] {
  return tasks.filter((t) => inToday(t, today) && !assignedToSomeoneElse(t, me)).sort(compareDueThenPriority)
}

/**
 * Upcoming: open, active tasks due after today, and undated ones whose deadline
 * is ahead. Undated tasks sort after dated ones, so a deadline-only task follows
 * the tasks due that day within its group (deadlines D3). Tasks assigned to someone other than `me` stay out.
 */
export function upcomingList(tasks: readonly Task[], today: string, me?: string | null): Task[] {
  return tasks.filter((t) => inUpcoming(t, today) && !assignedToSomeoneElse(t, me)).sort(compareDueThenPriority)
}

/**
 * Upcoming with Start with Today (OpenSpec change upcoming-start-with-today, D2):
 * Today's list by the date rule, then the Upcoming tasks Today does not already
 * hold (a task due tomorrow whose deadline has passed is Today's), each task once.
 */
export function upcomingWithToday(tasks: readonly Task[], today: string, me?: string | null): Task[] {
  return [...todayList(tasks, today, me), ...upcomingList(tasks, today, me).filter((t) => !inToday(t, today))]
}

/** A project's open tasks (any order; the project list builds its tree and sections from them). */
export function projectOpenList(tasks: readonly Task[], projectId: string): Task[] {
  return tasks.filter((t) => !t.completed_at && t.project_id === projectId)
}

export interface TodayGroups {
  overdue: Task[]
  /** Today's tasks that are not in the evening (with day parts on: no part and no due time). */
  day: Task[]
  /** Morning and Afternoon (day-parts D3): empty unless day parts are on. */
  morning: Task[]
  afternoon: Task[]
  /** This Evening (someday-and-evening; with day parts on also an untagged task due from 18:00). */
  evening: Task[]
  /** Blocked tasks (task-dependencies D7), kept apart at the end. */
  blocked: Task[]
}

/** Each part's place in a day, as Time of day lays them out: no part first (day-manual-order D4). */
const PART_RANK = { none: 0, morning: 1, afternoon: 2, evening: 3 } as const

/** A task's place in its day while day parts are on: its stored part, else the part of its due time, else none. */
export function partRank(task: Pick<Task, 'evening' | 'day_part' | 'due'>): number {
  return PART_RANK[placedPart(task) ?? 'none']
}

/**
 * Due date order with the part of the day (day-parts "Part of the day in the due order"):
 * the date, then the part, then the time and the usual tie-breaks. `desc` reverses the
 * date, part and time, as Due date descending does, and keeps the tie-breaks ascending.
 */
export function compareDueWithParts(desc = false): (a: Task, b: Task) => number {
  const sign = desc ? -1 : 1
  return (a, b) => {
    const da = a.due ? localDueOf(a.due).date : null
    const db = b.due ? localDueOf(b.due).date : null
    if (da === null || db === null || da !== db) return (da === null || db === null ? 1 : sign) * compareDue(a.due, b.due) || compareDueThenPriority(a, b)
    return sign * (partRank(a) - partRank(b) || compareDue(a.due, b.due)) || a.priority - b.priority || compareByPosition(a, b)
  }
}

/**
 * Split Today's list (already sorted) into Earlier (`overdue`), the day, This Evening
 * and Blocked. With `parts` (the account's day parts, day-parts D3) the day is split
 * further into Morning and Afternoon, a task without a part placed by its due time.
 */
export function groupToday(list: readonly Task[], today: string, blocked: { has(id: string): boolean } = new Set<string>(), parts = false): TodayGroups {
  const waiting = list.filter((t) => blocked.has(t.id))
  const ready = waiting.length ? list.filter((t) => !blocked.has(t.id)) : [...list]
  const overdue = ready.filter((t) => overdueInToday(t, today))
  const rest = ready.filter((t) => !overdueInToday(t, today))
  if (!parts) return { overdue, day: rest.filter((t) => !t.evening), morning: [], afternoon: [], evening: rest.filter((t) => t.evening), blocked: waiting }
  const of = new Map(rest.map((t) => [t.id, placedPart(t)]))
  const where = (part: ReturnType<typeof placedPart>) => rest.filter((t) => of.get(t.id) === part)
  return { overdue, day: where(null), morning: where('morning'), afternoon: where('afternoon'), evening: where('evening'), blocked: waiting }
}

/**
 * The ids of Today's Earlier group (page-rhythm D6), as the list shows it: open tasks
 * of active projects due (or with a deadline) before today, blocked ones left out.
 */
export function earlierIds(tasks: readonly Task[], projects: readonly Pick<Project, 'id' | 'archived'>[], today: string, me?: string | null): string[] {
  const live = withoutArchived(tasks.filter((t) => !t.deleted_at), projects)
  return groupToday(todayList(live, today, me), today, blockedMap(live)).overdue.map((t) => t.id)
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
export function nextDays(tasks: readonly Task[], today: string, days: number, me?: string | null): { date: string; tasks: Task[] }[] {
  const byDate = new Map(groupUpcoming(upcomingList(tasks, today, me), today).map((g) => [g.date, g.tasks]))
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
