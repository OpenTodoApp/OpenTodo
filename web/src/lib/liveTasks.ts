// One shared live snapshot of the visible tasks (OpenSpec change
// large-list-performance, design D2). Lists, sidebar counts, the project header,
// the calendar and the task panel used to run their own live query over the whole
// tasks table, so every write (local or from sync) scanned it once per component.
// They now read one snapshot, refreshed by a single Dexie live query while anything
// on screen subscribes, and derive what they need with the selectors below.
//
// The snapshot is shared: callers treat the array and its tasks as read-only (sort
// a copy, never the array itself).
import { taskSnapshot } from './taskSnapshot'
import { visibleTaskSets } from './trash'
import type { Task } from './types'
import { LayeredMap, noteChanges, noteKeys, patchSorted, perList } from './taskDelta'

/** Stable empty list for callers that render before the first snapshot arrives. */
export const NO_TASKS: Task[] = []

// One read of the tasks table for both: every workspace's visible tasks (the
// workspace switcher's counts, the palette) and the current workspace's, the
// list everything else shows (OpenSpec change workspaces). With one workspace
// both are the same array.
// Patched from the changed rows of each write, not read again (list-rendering-at-scale D2).
const both = taskSnapshot()

/** Every visible task of every workspace, live; undefined until loaded. */
export function useTasksOfEveryWorkspace(): Task[] | undefined {
  return both.use()?.every
}

/** Every workspace's visible tasks outside React (the tracked totals' store), and its subscription. */
export const everyTask = { read: (): Task[] | undefined => both.read()?.every, subscribe: (fn: () => void): (() => void) => both.subscribe(fn) }

/** Every visible task (not deleted, project not in the Trash) of the current workspace, live; undefined until loaded. */
export function useLiveTasks(): Task[] | undefined {
  return both.use()?.here
}

// Derived lists are computed once per snapshot and shared by every caller; a
// snapshot patched from a write works them out from the rows it changed
// (incremental-list-updates D2), with a link of their own for what follows them.

/** Every task of a snapshot by id. */
export const taskIndexOf = perList<Map<string, Task>>(
  (tasks) => new Map(tasks.map((task) => [task.id, task])),
  (prev, changes) => {
    // Layered on the last index: copying 10,000 entries after each write took about 5 ms in the phone profile.
    const next = LayeredMap.patched(prev, changes.map((c) => [c.id, c.after] as const))
    noteKeys(prev, next, new Set(changes.map((c) => c.id)))
    return next
  },
)

const isOpen = (task: Task) => !task.completed_at

/** The open (not completed) subset of a snapshot, in its order (by id). */
export const openTasksOf: (tasks: readonly Task[]) => Task[] = perList<Task[]>(
  (tasks) => tasks.filter(isOpen),
  (prev, changes) => {
    const next = patchSorted(prev, changes, isOpen)
    noteChanges(prev, next.list, next.changes)
    return next.list
  },
)

/** Every visible open task, live (empty until loaded). */
export function useOpenTasks(): Task[] {
  const all = useLiveTasks()
  return all ? openTasksOf(all) : NO_TASKS
}

const countOpen = perList<ReadonlyMap<string, number>>(
  (open) => {
    const counts = new Map<string, number>()
    for (const task of open) if (task.project_id) counts.set(task.project_id, (counts.get(task.project_id) ?? 0) + 1)
    return counts
  },
  (prev, changes) => {
    const next = new Map(prev)
    const add = (task: Task | undefined, n: number) => {
      if (!task?.project_id) return
      const v = (next.get(task.project_id) ?? 0) + n
      if (v > 0) next.set(task.project_id, v)
      else next.delete(task.project_id)
    }
    for (const c of changes) { add(c.before, -1); add(c.after, 1) }
    return next
  },
)

/** Open tasks per project id, computed once per snapshot. */
export function openCountsByProject(tasks: readonly Task[]): ReadonlyMap<string, number> {
  return countOpen(openTasksOf(tasks))
}

/** Open tasks per project id, live (empty until loaded). */
export function useLiveOwnOpenCounts(): ReadonlyMap<string, number> {
  const all = useLiveTasks()
  return all ? openCountsByProject(all) : NO_COUNTS
}
const NO_COUNTS: ReadonlyMap<string, number> = new Map()

/** Number of open tasks in a project, live; undefined until the first snapshot arrives. */
export function useOpenTaskCount(projectId: string): number | undefined {
  const all = useLiveTasks()
  return all ? openCountsByProject(all).get(projectId) ?? 0 : undefined
}

/** Number of open tasks in a project now: the shared snapshot, or one read when nothing holds it yet. */
export async function openTaskCount(projectId: string): Promise<number> {
  const here = both.read()?.here ?? (await visibleTaskSets()).here
  return openCountsByProject(here).get(projectId) ?? 0
}
