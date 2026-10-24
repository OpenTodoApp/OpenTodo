// The briefing on the day pages (OpenSpec change `briefing`): one or two sentences
// under the title of Today and Upcoming that say what stands out. The rules run on
// the device over the local rows, so the sentence works offline, needs no network
// and no model, and two devices with the same rows say the same thing.
//
// `briefingFacts` is pure and returns data; `app/Briefing.tsx` words it through the
// message layer, so every language words the same facts (design D2).
import { calendarTasks, dayLoad } from './calendar'
import { addDaysISO, daysBetweenISO, localDueOf, logicalDay } from './dates'
import { blockedMap } from './dependencies'
import { todayList, upcomingList, withoutArchived } from './dayLists'
import { compareDueThenPriority } from './ordering'
import type { AppNotification, Project, Task } from './types'
import { overdueInToday, upcomingDate } from './views'

/** Days Upcoming's briefing looks ahead, and Today's looks for a full day in (design D3). */
export const BRIEFING_DAYS = 7

/** The notification kinds that are a reply waiting for the user (design D4). */
export const REPLY_KINDS: readonly string[] = ['mentioned', 'page_replied']

export interface BriefingTask {
  id: string
  title: string
  /** Local due time, `HH:MM`. */
  time?: string
}

/** What stands out, most pressing first (design D3). */
export type BriefingFact =
  /** Late tasks in Today's order (`ids`, briefing-links D1): the one task named with its days late, or only the count. */
  | { kind: 'late'; count: number; ids: string[]; task?: BriefingTask; days?: number }
  /** Today's estimates are past the day length. */
  | { kind: 'overfull'; planned: number; dayLength: number }
  /** Later days whose estimates fill the day length, in date order. */
  | { kind: 'full'; dates: string[] }
  /** Unread replies: who and about what when there is one, else the count. */
  | { kind: 'replies'; count: number; name?: string; task?: BriefingTask }

export interface BriefingTomorrow {
  count: number
  first: BriefingTask | null
}

export type Briefing =
  /** Today with tasks: the facts (none means a calm day), the open count and the planned minutes. */
  | { mode: 'today'; facts: BriefingFact[]; open: number; planned: number }
  /** Today empty after something was done or the day was closed. */
  | { mode: 'done'; tomorrow: BriefingTomorrow }
  /** Today empty with nothing done: a clear day. */
  | { mode: 'clear'; tomorrow: BriefingTomorrow }
  /** Upcoming: the tasks of the next seven days, the full days among them and tomorrow. */
  | { mode: 'upcoming'; count: number; facts: BriefingFact[]; tomorrow: BriefingTomorrow }

export interface BriefingInput {
  view: 'today' | 'upcoming'
  /** The logical today. */
  today: string
  /** Live tasks (not deleted). */
  tasks: readonly Task[]
  projects: readonly Pick<Project, 'id' | 'archived'>[]
  /** The day length of the calendar grid preferences, in minutes. */
  dayLength: number
  /** Cached in-app notifications; only unread replies count. */
  notifications: readonly AppNotification[]
  /** Whether Close the day closed today. */
  closed: boolean
  /** The day start in minutes after midnight, for the day a completion belongs to. */
  dayStart: number
}

const titleOf = (task: Task): BriefingTask => {
  const due = localDueOf(task.due)
  return { id: task.id, title: task.title, ...(due?.time ? { time: due.time } : {}) }
}

/** How many days late a task is: from its due date, else from its passed deadline. */
function daysLate(task: Task, today: string): number {
  const due = task.due ? localDueOf(task.due).date : null
  const dates = [due, task.deadline ?? null].filter((d): d is string => !!d && d < today)
  return dates.length ? Math.max(...dates.map((d) => daysBetweenISO(d, today))) : 0
}

/** The later days of the window whose estimates reach the day length. */
function fullDays(tasks: readonly Task[], today: string, dayLength: number): string[] {
  const out: string[] = []
  for (let i = 1; i <= BRIEFING_DAYS; i++) {
    const day = addDaysISO(today, i)
    if (dayLoad(tasks, day, dayLength).planned >= dayLength) out.push(day)
  }
  return out
}

function replies(notifications: readonly AppNotification[], tasks: readonly Task[]): BriefingFact | null {
  const unread = notifications.filter((n) => n.readAt === null && REPLY_KINDS.includes(n.kind))
  if (unread.length === 0) return null
  if (unread.length > 1) return { kind: 'replies', count: unread.length }
  const p = unread[0].payload as { taskId?: string; taskTitle?: string; actorName?: string; guestName?: string }
  // An encrypted task's notification carries no title: the device's own copy names it.
  const own = p.taskId ? tasks.find((x) => x.id === p.taskId) : undefined
  const title = own?.title || p.taskTitle
  const name = p.actorName || p.guestName
  return { kind: 'replies', count: 1, ...(name ? { name } : {}), ...(title && p.taskId ? { task: { id: p.taskId, title } } : {}) }
}

function tomorrowOf(upcoming: readonly Task[], today: string): BriefingTomorrow {
  const tomorrow = addDaysISO(today, 1)
  const list = upcoming.filter((x) => upcomingDate(x, today) === tomorrow).sort(compareDueThenPriority)
  return { count: list.length, first: list.length ? titleOf(list[0]) : null }
}

/** The briefing of a day page from the local rows (design D3). */
export function briefingFacts(input: BriefingInput): Briefing {
  const { today, dayLength } = input
  const all = withoutArchived(input.tasks.filter((x) => !x.deleted_at) as Task[], input.projects as Project[])
  const open = all.filter((x) => !x.completed_at)
  const upcoming = upcomingList(all, today)
  const tomorrow = tomorrowOf(upcoming, today)
  const later = fullDays(calendarTasks(open, [], addDaysISO(today, 1), addDaysISO(today, BRIEFING_DAYS)), today, dayLength)

  if (input.view === 'upcoming') {
    const last = addDaysISO(today, BRIEFING_DAYS)
    const count = upcoming.filter((x) => { const d = upcomingDate(x, today); return d !== null && d <= last }).length
    return { mode: 'upcoming', count, facts: later.length ? [{ kind: 'full', dates: later }] : [], tomorrow }
  }

  const list = todayList(all, today)
  if (list.length === 0) {
    const doneToday = input.closed || all.some((x) => x.completed_at && !x.skipped && logicalDay(x.completed_at, input.dayStart) === today)
    return { mode: doneToday ? 'done' : 'clear', tomorrow }
  }

  const facts: BriefingFact[] = []
  const blocked = blockedMap(all)
  const late = list.filter((x) => !blocked.has(x.id) && overdueInToday(x, today))
  const ids = late.map((x) => x.id)
  if (late.length === 1) facts.push({ kind: 'late', count: 1, ids, task: titleOf(late[0]), days: daysLate(late[0], today) })
  else if (late.length > 1) facts.push({ kind: 'late', count: late.length, ids })
  // Everything Today lists is today's work, late tasks included.
  const load = dayLoad(list.map((x) => ({ ...x, due: { date: today } })), today, dayLength)
  if (load.over) facts.push({ kind: 'overfull', planned: load.planned, dayLength })
  else if (later.length) facts.push({ kind: 'full', dates: later.slice(0, 1) })
  const reply = replies(input.notifications, all)
  if (reply) facts.push(reply)
  return { mode: 'today', facts, open: list.length, planned: load.planned }
}
