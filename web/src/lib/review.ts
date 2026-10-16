// The weekly review (OpenSpec change `stats-and-review`, design D3 and D4): four
// steps derived from the local rows with the definitions of lib/stats.ts, and the
// synced personal `review` row that records when the last review was finished.
// Pure apart from `finishReview`, which writes one op.
import { addDaysISO } from './dates'
import { mutate } from './ops'
import { canEditProject, canEditTasks, roleOf } from './sharing'
import { countedTasks, overdueOf, type StatsInput } from './stats'
import { qualifies } from './triage'
import type { Membership, Project, Task } from './types'

export const REVIEW_ID = 'me'
/** A review is due when the last one is more than seven days old, or there was none. */
export const REVIEW_INTERVAL_MS = 7 * 86_400_000

export type StepId = 'clear' | 'back' | 'next' | 'ahead'
export const STEP_IDS: readonly StepId[] = ['clear', 'back', 'next', 'ahead']
export const STEP_TITLES: Record<StepId, string> = { clear: 'Get clear', back: 'Look back', next: 'Next actions', ahead: 'Look ahead' }

export interface NextActionProject {
  project: Project
  /** The user may archive it (owner or admin of a shared project, always for their own). */
  canArchive: boolean
}

export interface ReviewSteps {
  /** Open top-level Inbox tasks, in Inbox order. */
  inbox: Task[]
  /** Completed this week (the count Look back shows). */
  completedThisWeek: number
  overdue: Task[]
  nextActions: NextActionProject[]
  /** Open tasks due today and in the next six days, by due date. */
  ahead: Task[]
  done: Record<StepId, boolean>
  /** What is left per step (Look ahead has nothing to finish). */
  left: Record<StepId, number>
}

export interface ReviewInput {
  tasks: readonly Task[]
  projects: readonly Project[]
  memberships: ReadonlyMap<string, Membership>
  me: string | null
  today: string
  /** Completions this week, from lib/stats.ts `compute` with the current week. */
  completedThisWeek: number
}

export function reviewSteps(input: ReviewInput): ReviewSteps {
  const statsInput: StatsInput = { tasks: input.tasks, projects: input.projects, shared: new Set(input.memberships.keys()), me: input.me, today: input.today }
  const counted = countedTasks(statsInput)
  const inbox = counted.filter(qualifies).sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1))
  const overdue = overdueOf(counted, input.projects, input.today)
  const until = addDaysISO(input.today, 6)
  const archived = new Set(input.projects.filter((p) => p.archived).map((p) => p.id))
  const ahead = counted
    .filter((t) => t.completed_at === null && t.due && t.due.date >= input.today && t.due.date <= until && !(t.project_id && archived.has(t.project_id)))
    .sort((a, b) => (a.due!.date < b.due!.date ? -1 : a.due!.date > b.due!.date ? 1 : a.priority - b.priority))
  // "No open task" looks at every live task of the project, whoever it is assigned to.
  const withOpen = new Set(input.tasks.filter((t) => !t.deleted_at && t.completed_at === null && t.project_id).map((t) => t.project_id!))
  const memberships = input.memberships as Map<string, Membership>
  const nextActions = input.projects
    .filter((p) => !p.deleted_at && !p.archived && !withOpen.has(p.id) && canEditTasks(roleOf(p.id, memberships)))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map((project) => ({ project, canArchive: canEditProject(roleOf(project.id, memberships)) }))
  const left: Record<StepId, number> = { clear: inbox.length, back: overdue.length, next: nextActions.length, ahead: 0 }
  const done: Record<StepId, boolean> = { clear: left.clear === 0, back: left.back === 0, next: left.next === 0, ahead: true }
  return { inbox, completedThisWeek: input.completedThisWeek, overdue, nextActions, ahead, done, left }
}

/** The step the screen opens on: the first that is not done, else Look ahead. */
export function firstUnfinished(done: Record<StepId, boolean>): StepId {
  return STEP_IDS.find((s) => !done[s]) ?? 'ahead'
}

/** Whether a review is due: never finished, or more than seven days ago. */
export function reviewDue(completedAt: number | null | undefined, now = Date.now()): boolean {
  return !completedAt || now - completedAt > REVIEW_INTERVAL_MS
}

/** When the last review was, in words: "today", "yesterday", "9 days ago" or "never". */
export function reviewAgo(completedAt: number | null | undefined, now = Date.now()): string {
  if (!completedAt) return 'never'
  const day = (ms: number) => { const d = new Date(ms); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) }
  const days = Math.max(0, Math.round((day(now) - day(completedAt)) / 86_400_000))
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

/** Records a finished review through the op log (offline-safe; the latest finish wins on every device). */
export function finishReview(now = Date.now()): Promise<void> {
  return mutate('review', REVIEW_ID, { completed_at: now })
}
