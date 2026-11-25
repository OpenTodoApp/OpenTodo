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

/** The fields the kept rule reads (keep-open-subtasks D2). */
export interface KeptRow { id: string; parent_id?: string | null; completed_at?: number | null; deleted_at?: number | null }

/** Whether completing a parent leaves its open subtasks open (user_prefs.complete_subtasks "keep"; anything else completes them). */
export function keepsOpenSubtasks(row: { complete_subtasks?: string } | null | undefined): boolean {
  return row?.complete_subtasks === 'keep'
}

/**
 * Whether `task` is kept (keep-open-subtasks D2): open, not deleted, with a live
 * (not deleted) completed ancestor at any depth. A missing or deleted ancestor ends
 * the walk, and so does a cycle. `get` finds a task by id among the tasks held.
 */
export function isKept(task: KeptRow, get: (id: string) => KeptRow | undefined): boolean {
  if (task.completed_at || task.deleted_at || !task.parent_id) return false
  const seen = new Set<string>([task.id])
  for (let id: string | null | undefined = task.parent_id; id && !seen.has(id); ) {
    seen.add(id)
    const up = get(id)
    if (!up || up.deleted_at) return false
    if (up.completed_at) return true
    id = up.parent_id
  }
  return false
}

/** The ids of the kept tasks among `tasks` (shared vectors: kept.vectors.json, Go internal/kept). */
export function keptIds(tasks: readonly KeptRow[], get?: (id: string) => KeptRow | undefined): Set<string> {
  const out = new Set<string>()
  let find = get
  for (const task of tasks) {
    if (task.completed_at || task.deleted_at || !task.parent_id) continue
    if (!find) {
      const byId = new Map(tasks.map((x) => [x.id, x]))
      find = (id) => byId.get(id)
    }
    if (isKept(task, find)) out.add(task.id)
  }
  return out
}

/** `tasks` without the kept ones, read from the tasks themselves (the shell's lists and reminders). */
export function withoutKept<T extends KeptRow>(tasks: readonly T[]): T[] {
  const kept = keptIds(tasks)
  return kept.size ? tasks.filter((task) => !kept.has(task.id)) : (tasks as T[])
}

/** The ids among `tasks` that are kept, reading their ancestors from the database (the reminder watcher reads only a few tasks). */
export async function keptAmong(tasks: Iterable<KeptRow>): Promise<Set<string>> {
  const out = new Set<string>()
  const cache = new Map<string, KeptRow | undefined>()
  for (const task of tasks) {
    if (task.completed_at || task.deleted_at || !task.parent_id) continue
    for (let id: string | null | undefined = task.parent_id, n = 0; id && !cache.has(id) && n < 1000; n++) {
      const up: Task | undefined = await db.tasks.get(id)
      cache.set(id, up)
      id = up?.parent_id
    }
    if (isKept(task, (id) => cache.get(id))) out.add(task.id)
  }
  return out
}

/** `rows` read from the database without the kept ones (keptAmong). */
export async function dropKept<T extends KeptRow>(rows: T[]): Promise<T[]> {
  const kept = await keptAmong(rows)
  return kept.size ? rows.filter((r) => !kept.has(r.id)) : rows
}
