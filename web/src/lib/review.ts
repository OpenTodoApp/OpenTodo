// The weekly review's steps (OpenSpec `stats-and-review`, design D3): derived from
// the local rows, so the review works offline and edits made inside it update the
// steps at once. The only thing written is the finish time (finishReview in ops).
import { addDaysISO, localDueOf } from './dates'
import { roleOf } from './sharing'
import { counts } from './stats'
import type { Membership, Project, Task } from './types'

export type StepId = 'get-clear' | 'look-back' | 'next-actions' | 'look-ahead'

export const STEPS: readonly StepId[] = ['get-clear', 'look-back', 'next-actions', 'look-ahead']

export interface ReviewSteps {
  inbox: Task[]
  overdue: Task[]
  nextActions: Project[]
  ahead: Task[]
  done: Record<StepId, boolean>
}

const open = (t: Task) => t.completed_at === null && !t.deleted_at

/** Whether the user may add tasks to or archive a project (anything but viewer). */
export function canEditProject(projectId: string, memberships: ReadonlyMap<string, Membership>): boolean {
  return roleOf(projectId, memberships as Map<string, Membership>) !== 'viewer'
}

/**
 * The four steps: Get clear (open Inbox tasks), Look back (overdue tasks), Next
 * actions (live, unarchived, editable projects without an open task) and Look
 * ahead (open tasks due in the next seven days, today included).
 */
export function reviewSteps(
  tasks: readonly Task[], projects: readonly Project[], memberships: ReadonlyMap<string, Membership>, me: string | null, today: string,
): ReviewSteps {
  const mine = tasks.filter((t) => open(t) && counts(t, memberships, me))
  const due = (t: Task) => (t.due ? localDueOf(t.due).date : null)
  const inbox = mine.filter((t) => t.project_id === null)
  const overdue = mine.filter((t) => { const d = due(t); return d !== null && d < today })
  const horizon = addDaysISO(today, 7)
  const ahead = mine.filter((t) => { const d = due(t); return d !== null && d >= today && d < horizon })
  const withOpen = new Set(tasks.filter(open).map((t) => t.project_id))
  const nextActions = projects.filter((p) => !p.deleted_at && !p.archived && canEditProject(p.id, memberships) && !withOpen.has(p.id))
  return {
    inbox, overdue, nextActions, ahead,
    done: { 'get-clear': inbox.length === 0, 'look-back': overdue.length === 0, 'next-actions': nextActions.length === 0, 'look-ahead': true },
  }
}

/** The step the review opens on: the first that is not done, else the last. */
export function firstUnfinished(done: Record<StepId, boolean>): StepId {
  return STEPS.find((s) => !done[s]) ?? 'look-ahead'
}

/** Whether a review is due: never finished, or more than seven days ago. */
export function reviewDue(completedAt: number | null | undefined, now = Date.now()): boolean {
  return !completedAt || now - completedAt > 7 * 24 * 60 * 60 * 1000
}
