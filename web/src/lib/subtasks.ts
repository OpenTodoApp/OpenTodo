// Task-specific tree rules on top of the generic tree module: parent progress,
// the display state of a subtask whose parent is missing, deleted or completed,
// and the "complete the parent too?" check. Everything here is derived from local
// data; nothing writes, so it is correct offline and converges by construction.
import { db } from './db'
import { ancestors, buildTree, type Tree } from './tree'
import type { Task } from './types'
import { noteKeys, perList, type TaskChange } from './taskDelta'
import { t } from './i18n'

export interface Progress {
  done: number
  total: number
}

/** "completed/total" over the direct, non-deleted children of `task`. */
export function progressOf(task: Pick<Task, 'id'>, tasks: Iterable<Task>): Progress {
  let done = 0
  let total = 0
  for (const tk of tasks) {
    if (tk.parent_id !== task.id || tk.deleted_at) continue
    total++
    if (tk.completed_at) done++
  }
  return { done, total }
}

/** Progress of every parent in one pass; parents without children are absent. */
export function progressMap(tasks: Iterable<Task>): Map<string, Progress> {
  const out = new Map<string, Progress>()
  for (const task of tasks) {
    if (!task.parent_id || task.deleted_at) continue
    const p = out.get(task.parent_id) ?? { done: 0, total: 0 }
    p.total++
    if (task.completed_at) p.done++
    out.set(task.parent_id, p)
  }
  return out
}

/**
 * progressMap after `changes`, from the parents of the changed rows (OpenSpec change
 * incremental-list-updates D2): the same entries, with the parents it touched noted.
 */
export function patchProgress(prev: Map<string, Progress>, changes: readonly TaskChange[]): Map<string, Progress> {
  let next: Map<string, Progress> | null = null
  const touched = new Set<string>()
  const count = (task: Task | undefined, n: number) => {
    if (!task?.parent_id || task.deleted_at) return
    next ??= new Map(prev)
    const p = next.get(task.parent_id)
    const v = { done: (p?.done ?? 0) + (task.completed_at ? n : 0), total: (p?.total ?? 0) + n }
    if (v.total > 0) next.set(task.parent_id, v)
    else next.delete(task.parent_id)
    touched.add(task.parent_id)
  }
  for (const c of changes) {
    const a = c.before
    const b = c.after
    // Only the parent pointer and the done and deleted states count.
    if (a && b && a.parent_id === b.parent_id && !a.completed_at === !b.completed_at && !a.deleted_at === !b.deleted_at) continue
    count(a, -1)
    count(b, 1)
  }
  if (!next) return prev
  noteKeys(prev, next, touched)
  return next
}

/** progressMap of a task snapshot, worked out from the rows each write changed. */
export const liveProgress = perList<Map<string, Progress>>(progressMap, patchProgress)

export type ParentState = 'nested' | 'missing' | 'deleted' | 'completed' | 'elsewhere' | 'none'

/**
 * How `task` relates to its parent for display. Only `nested` renders the task
 * beneath its parent; every other state puts it at the top level of its project.
 */
export function parentState(task: Task, byId: Map<string, Task>): ParentState {
  if (!task.parent_id) return 'none'
  const parent = byId.get(task.parent_id)
  if (!parent) return 'missing'
  if (parent.deleted_at) return 'deleted'
  if (parent.completed_at && !task.completed_at) return 'completed'
  if (parent.project_id !== task.project_id) return 'elsewhere'
  return 'nested'
}

/** Title of the nearest known parent, for breadcrumbs; null when the parent is unknown locally. */
export function breadcrumbOf(task: Task, byId: Map<string, Task>): string | null {
  const [parent] = ancestors(task.id, byId)
  return parent ? parent.title || t('Untitled') : null
}

/**
 * Build the tree for a list view. `visible` are the tasks the view shows (already
 * filtered by project and completion); a parent outside that list leaves its
 * children at the top level, which is exactly the display rule for missing,
 * deleted and completed parents.
 */
export function buildTaskTree(visible: Task[]): Tree<Task> {
  return buildTree(visible)
}

/**
 * After `taskId` was completed: its parent when that parent is open, not deleted,
 * and now has no open subtask left. The caller offers to complete it; nothing is
 * written here (see design D5: auto-completing would race a concurrent add).
 */
export async function parentReadyToComplete(taskId: string): Promise<Task | null> {
  const task = await db.tasks.get(taskId)
  if (!task?.parent_id) return null
  const parent = await db.tasks.get(task.parent_id)
  if (!parent || parent.deleted_at || parent.completed_at) return null
  const siblings = await db.tasks.where('parent_id').equals(parent.id).toArray()
  const open = siblings.some((s) => !s.deleted_at && !s.completed_at)
  return open ? null : parent
}
