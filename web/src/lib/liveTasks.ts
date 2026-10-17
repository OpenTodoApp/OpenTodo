// One shared live snapshot of the visible tasks (OpenSpec change
// large-list-performance, design D2). Lists, sidebar counts, the project header,
// the calendar and the task panel used to run their own live query over the whole
// tasks table, so every write (local or from sync) scanned it once per component.
// They now read one snapshot, refreshed by a single Dexie live query while anything
// on screen subscribes, and derive what they need with the selectors below.
//
// The snapshot is shared: callers treat the array and its tasks as read-only (sort
// a copy, never the array itself).
import { liveSnapshot } from './liveSnapshot'
import { visibleTasks } from './trash'
import type { Task } from './types'

/** Stable empty list for callers that render before the first snapshot arrives. */
export const NO_TASKS: Task[] = []

const tasks = liveSnapshot('tasks', visibleTasks)

/** Every visible task (not deleted, project not in the Trash), live; undefined until loaded. */
export function useLiveTasks(): Task[] | undefined {
  return tasks.use()
}

// Derived lists are computed once per snapshot and shared by every caller.
const openCache = new WeakMap<Task[], Task[]>()

/** The open (not completed) subset of a snapshot, computed once per snapshot. */
export function openTasksOf(tasks: Task[]): Task[] {
  let open = openCache.get(tasks)
  if (!open) {
    open = tasks.filter((task) => !task.completed_at)
    openCache.set(tasks, open)
  }
  return open
}

/** Every visible open task, live (empty until loaded). */
export function useOpenTasks(): Task[] {
  const all = useLiveTasks()
  return all ? openTasksOf(all) : NO_TASKS
}

const countCache = new WeakMap<Task[], Map<string, number>>()

/** Open tasks per project id, computed once per snapshot. */
export function openCountsByProject(tasks: Task[]): Map<string, number> {
  let counts = countCache.get(tasks)
  if (!counts) {
    counts = new Map()
    for (const task of openTasksOf(tasks)) if (task.project_id) counts.set(task.project_id, (counts.get(task.project_id) ?? 0) + 1)
    countCache.set(tasks, counts)
  }
  return counts
}

/** Number of open tasks in a project, live (0 until loaded). */
export function useOpenTaskCount(projectId: string): number {
  const all = useLiveTasks()
  return all ? openCountsByProject(all).get(projectId) ?? 0 : 0
}
