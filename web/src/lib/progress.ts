// Task and project progress (OpenSpec change task-progress): worked out on the device
// from rows it already holds, never stored or synced. A parent's progress is its
// direct subtasks (lib/subtasks.ts, progressMap); a project's is the All projects
// table's rule (statistics "Project health"), kept once here so the project page and
// the table cannot drift.
import type { Progress } from './subtasks'
import type { Task } from './types'
import { perList } from './taskDelta'

type ProgressTask = Pick<Task, 'project_id' | 'completed_at' | 'deleted_at' | 'series_id'> & Partial<Pick<Task, 'skipped' | 'sample'>>

/**
 * How a task counts toward its project's progress: done, open, or not at all. Deleted
 * tasks, skipped habit occurrences and start guide samples never count (statistics
 * "Excluded rows"); a completed occurrence record is a past turn of a series, which
 * counts once, through its open task.
 */
export function progressPart(task: ProgressTask): 'done' | 'open' | null {
  if (task.deleted_at || task.skipped || task.sample) return null
  if (task.completed_at !== null) return task.series_id ? null : 'done'
  return 'open'
}

/** The share done, 0 to 1; null when there is nothing to count. */
export function shareOf(p: Progress | undefined): number | null {
  return p && p.total > 0 ? p.done / p.total : null
}

/** A share as a whole percentage, as the rows' and the table's labels read it. */
export function percentOf(share: number): number {
  return Math.round(share * 100)
}

function add(map: Map<string, Progress>, task: ProgressTask | undefined, n: number): void {
  if (!task?.project_id) return
  const part = progressPart(task)
  if (!part) return
  const p = map.get(task.project_id)
  const v = { done: (p?.done ?? 0) + (part === 'done' ? n : 0), total: (p?.total ?? 0) + n }
  if (v.total > 0) map.set(task.project_id, v)
  else map.delete(task.project_id)
}

/**
 * Each project's own progress over a task snapshot: once per snapshot, then from the
 * rows each write changed (incremental-list-updates D2), so a write costs its changes,
 * not a scan of every task.
 */
export const projectProgressOf = perList<ReadonlyMap<string, Progress>>(
  (tasks) => {
    const out = new Map<string, Progress>()
    for (const task of tasks) add(out, task, 1)
    return out
  },
  (prev, changes) => {
    const next = new Map(prev)
    for (const c of changes) { add(next, c.before, -1); add(next, c.after, 1) }
    return next
  },
)

