// One shared live snapshot of the visible tasks (OpenSpec change
// large-list-performance, design D2). Lists, sidebar counts, the project header,
// the calendar and the task panel used to run their own live query over the whole
// tasks table, so every write (local or from sync) scanned it once per component.
// They now read one snapshot, refreshed by a single Dexie live query while anything
// on screen subscribes, and derive what they need with the selectors below.
//
// The snapshot is shared: callers treat the array and its tasks as read-only (sort
// a copy, never the array itself).
import { liveQuery, type Subscription } from 'dexie'
import { useSyncExternalStore } from 'react'
import { db } from './db'
import { visibleTasks } from './trash'
import type { Task } from './types'

/** Stable empty list for callers that render before the first snapshot arrives. */
export const NO_TASKS: Task[] = []

let snapshot: Task[] | undefined
let sub: Subscription | null = null
/** The database the live query reads; tests swap it with useDatabase. */
let source: unknown = null
const listeners = new Set<() => void>()

/**
 * Under test the snapshot is frozen, so a caller that sorts or edits the shared
 * array or one of its tasks in place fails loudly instead of changing what the
 * other components show.
 */
function frozen(list: Task[]): Task[] {
  for (const task of list) {
    Object.freeze(task.labels)
    if (task.due) Object.freeze(task.due)
    Object.freeze(task)
  }
  return Object.freeze(list) as Task[]
}

function start() {
  sub?.unsubscribe()
  source = db
  snapshot = undefined
  sub = liveQuery(visibleTasks).subscribe({
    next: (list) => {
      snapshot = import.meta.env.MODE === 'test' ? frozen(list) : list
      for (const l of listeners) l()
    },
    // A failed read keeps the last snapshot; the next write retries it.
    error: (err) => console.warn('live tasks:', err),
  })
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  if (!sub || source !== db) start()
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0 && sub) {
      sub.unsubscribe()
      sub = null
      snapshot = undefined
    }
  }
}

const read = () => (source === db ? snapshot : undefined)

/** Every visible task (not deleted, project not in the Trash), live; undefined until loaded. */
export function useLiveTasks(): Task[] | undefined {
  return useSyncExternalStore(subscribe, read, read)
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
