// Which task the Focus screen shows (OpenSpec change focus-mode, design D9): pure
// functions over today's focus (the Daily check's ids) and the live tasks.
// Choosing a task writes nothing.
import type { Task } from '../types'
import type { FocusState } from './timer'

type Row = Pick<Task, 'id' | 'completed_at' | 'deleted_at'>

const openIn = (byId: ReadonlyMap<string, Row>, id: string) => {
  const task = byId.get(id)
  return !!task && !task.completed_at && !task.deleted_at
}

/**
 * The next open, live task of today's focus after `currentId`: the first one when
 * `currentId` is not in the list (or null), else the ones after it and then the
 * ones before it, never `currentId` itself; null when none is left.
 */
export function nextFocusTask(focusIds: readonly string[], tasks: readonly Row[], currentId: string | null): string | null {
  const byId = new Map(tasks.map((x) => [x.id, x]))
  const at = currentId ? focusIds.indexOf(currentId) : -1
  const order = at < 0 ? focusIds : [...focusIds.slice(at + 1), ...focusIds.slice(0, at)]
  return order.find((id) => id !== currentId && openIn(byId, id)) ?? null
}

/**
 * The task on screen: the address's task when it is open (or the task of the
 * session that runs or just ended), else the session's task, else the first open
 * task of today's focus. `unavailable` when the address named a task that does
 * not exist, is completed or is in the Trash ("Unknown or closed task").
 */
export function focusTarget(input: { routeId?: string; state: FocusState | null | undefined; focusIds: readonly string[]; tasks: readonly Row[] }): { taskId: string | null; unavailable: boolean } {
  const { routeId, state, focusIds, tasks } = input
  const byId = new Map(tasks.map((x) => [x.id, x]))
  const session = state && state.phase !== 'idle' ? state : null
  if (routeId) {
    if (session && (session.taskId === routeId || session.ended?.taskId === routeId)) return { taskId: session.taskId, unavailable: false }
    if (openIn(byId, routeId)) return { taskId: routeId, unavailable: false }
    return { taskId: nextFocusTask(focusIds, tasks, null), unavailable: true }
  }
  if (session) return { taskId: session.taskId, unavailable: false }
  return { taskId: nextFocusTask(focusIds, tasks, null), unavailable: false }
}
