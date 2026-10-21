// Inbox membership (OpenSpec change inbox-means-unplaced, design D1, D2): a task
// is in the Inbox while it is open, live, not placed, and none of its parents is
// placed either: a subtask is part of its parent's plan, so it follows the parent
// out of the Inbox. Placed means a project or a schedule (a do-on date, a start
// date, past or future, or Someday); a deadline, a reminder or a label alone does
// not place a task. Derived from synced fields only, so it needs no clock and
// converges with them. internal/inbox is the Go twin; both read
// web/src/lib/inbox.vectors.json.
import type { Task } from './types'

export type InboxFields = Pick<Task, 'project_id' | 'due' | 'completed_at' | 'deleted_at'> & { start?: string | null; parent_id?: string | null }

/** Finds a task by id, to walk a subtask's parents; undefined when it is not known here. */
export type InboxParentOf = (id: string) => InboxFields | undefined

/** Parents deeper than this are not walked (a guard against a cycle in synced data). */
const MAX_DEPTH = 64

/** A do-on date, a start date or Someday. */
export function isScheduled(task: Pick<Task, 'due'> & { start?: string | null }): boolean {
  return !!task.due || !!(task.start ?? null)
}

/** A project or a schedule: the task has a place outside the Inbox. */
export function isPlaced(task: Pick<InboxFields, 'project_id' | 'due' | 'start'>): boolean {
  return task.project_id !== null || isScheduled(task)
}

/**
 * Whether the task is in the Inbox. With `parentOf`, a subtask is left out when
 * any parent it can find is placed (whether that parent is open, done or deleted);
 * a parent that is not found ends the walk.
 */
export function isInboxTask(task: InboxFields, parentOf?: InboxParentOf): boolean {
  if (task.completed_at || task.deleted_at || isPlaced(task)) return false
  let parent = task.parent_id ?? null
  for (let depth = 0; parent && parentOf && depth < MAX_DEPTH; depth++) {
    const p = parentOf(parent)
    if (!p) break
    if (isPlaced(p)) return false
    parent = p.parent_id ?? null
  }
  return true
}

/** A parent lookup over `tasks` for isInboxTask. */
export function inboxParents(tasks: readonly (InboxFields & { id: string })[]): InboxParentOf {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  return (id) => byId.get(id)
}

/** The tasks of `tasks` that are in the Inbox; parents are looked up in `known` (default: `tasks`). */
export function inboxTasks<T extends InboxFields & { id: string }>(tasks: readonly T[], known: readonly (InboxFields & { id: string })[] = tasks): T[] {
  const parentOf = inboxParents(known)
  return tasks.filter((task) => isInboxTask(task, parentOf))
}

/** How many of `tasks` are in the Inbox: the sidebar's count. Parents are looked up in `known`. */
export function countInbox(tasks: readonly (InboxFields & { id: string })[], known: readonly (InboxFields & { id: string })[] = tasks): number {
  return inboxTasks(tasks, known).length
}

/** Open, live, without a project and scheduled: the Inbox's "planned tasks without a project" line. */
export function isPlannedWithoutProject(task: InboxFields): boolean {
  return !task.completed_at && !task.deleted_at && task.project_id === null && isScheduled(task)
}
