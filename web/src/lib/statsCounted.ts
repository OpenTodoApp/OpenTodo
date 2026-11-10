// The rows Statistics counts (OpenSpec `stats-and-review` design D1), on their own
// so a reader of a few numbers (the assistant's statistics block,
// assistant-project-blocks) need not load the whole statistics model. lib/stats
// re-exports them.
import type { Project, Task } from './types'

export type StatTask = Pick<Task, 'id' | 'project_id' | 'created_at' | 'completed_at' | 'deleted_at' | 'due' | 'series_id' | 'assignee_id'>
  & Partial<Pick<Task, 'skipped' | 'completed_by' | 'sample'>>
export type StatProject = Pick<Project, 'id' | 'name' | 'archived' | 'deleted_at'>

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

/**
 * The rows statistics see: live (not in the Trash, nor in a trashed project), not a skipped habit
 * occurrence, not a start guide sample (moments-and-onboarding D3), and the user's.
 */
export function countedTasks<T extends StatTask>(input: { tasks: readonly T[]; projects: readonly StatProject[]; shared: ReadonlySet<string>; me: string | null }): T[] {
  const trashed = new Set(input.projects.filter((p) => p.deleted_at).map((p) => p.id))
  return input.tasks.filter((item) => !item.deleted_at && !(item.project_id && trashed.has(item.project_id)) && !item.skipped && !item.sample && isMine(item, input.shared, input.me))
}

/** Open tasks due before today, outside archived projects, oldest due first. */
export function overdueOf<T extends StatTask>(counted: readonly T[], projects: readonly StatProject[], today: string): T[] {
  const archived = new Set(projects.filter((p) => p.archived).map((p) => p.id))
  return counted
    .filter((item) => item.completed_at === null && item.due && item.due.date < today && !(item.project_id && archived.has(item.project_id)))
    .sort((a, b) => (a.due!.date < b.due!.date ? -1 : a.due!.date > b.due!.date ? 1 : a.id < b.id ? -1 : 1))
}
