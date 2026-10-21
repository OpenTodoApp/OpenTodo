// Inbox membership (OpenSpec change inbox-means-unplaced, design D1, D2): a task
// is in the Inbox while it is open, live, without a project and not scheduled.
// Scheduled means a do-on date, a start date (past or future) or Someday; a
// deadline, a reminder or a label alone does not schedule a task. Derived from
// synced fields only, so it needs no clock and converges with them. internal/inbox
// is the Go twin; both read internal/inbox/testdata/inbox_vectors.json.
import type { Task } from './types'

export type InboxFields = Pick<Task, 'project_id' | 'due' | 'completed_at' | 'deleted_at'> & { start?: string | null }

/** A do-on date, a start date or Someday. */
export function isScheduled(task: Pick<Task, 'due'> & { start?: string | null }): boolean {
  return !!task.due || !!(task.start ?? null)
}

/** Whether the task is in the Inbox. */
export function isInboxTask(task: InboxFields): boolean {
  return !task.completed_at && !task.deleted_at && task.project_id === null && !isScheduled(task)
}

/** Open, live, without a project and scheduled: the Inbox's "planned tasks without a project" line. */
export function isPlannedWithoutProject(task: InboxFields): boolean {
  return !task.completed_at && !task.deleted_at && task.project_id === null && isScheduled(task)
}
