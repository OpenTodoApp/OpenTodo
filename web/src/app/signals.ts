// Tiny cross-component signals for keyboard flows (OpenSpec `time-blocking`):
// the `g` prefix state, the "focus the estimate control" request (`e` on a row) and
// the "place this task in the Day view" request (`s` on a row). Module state, no
// React context: the requests survive a route change and are consumed once.

import { localDate } from '../lib/dates'
import type { Task } from '../lib/types'
import { navigate, routePath } from './router'

let gPending = false
let gTimer: ReturnType<typeof setTimeout> | undefined

/** Shell calls this on `g`; list and calendar handlers ignore the next key while it is set. */
export function setGPending(on: boolean): void {
  gPending = on
  clearTimeout(gTimer)
  if (on) gTimer = setTimeout(() => (gPending = false), 800)
}

export function isGPending(): boolean {
  return gPending
}

type Listener = (id: string) => void

function channel() {
  let pending: string | null = null
  const listeners = new Set<Listener>()
  return {
    request(id: string) {
      pending = id
      listeners.forEach((fn) => fn(id))
    },
    /** Leave a request for whoever mounts or navigates next, without notifying current listeners. */
    set(id: string) {
      pending = id
    },
    /** Take a pending request for `id` (or any id when omitted); returns the id or null. */
    take(id?: string): string | null {
      if (pending === null || (id !== undefined && pending !== id)) return null
      const got = pending
      pending = null
      return got
    },
    subscribe(fn: Listener): () => void {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

/** `e` on a selected row: the detail panel for that task focuses its estimate input. */
export const estimateFocus = channel()

/** `d` on a selected row: the detail panel for that task opens its deadline field (deadlines). */
export const deadlineFocus = channel()

/** `s` on a selected row: the Day view opens with that task in placement mode. */
export const placement = channel()

/** `s` on a list row: open the Day view (on the task's date, else today) in placement mode for it. */
export function placeInDay(task: Pick<Task, 'id' | 'due'>, today: string): void {
  placement.request(task.id)
  const date = localDate(task.due)
  navigate({ view: 'day', date: date && date !== today ? date : undefined })
}

/**
 * Open a task's detail panel from outside a list (a reminder toast, a notification
 * click): go to the task's project (or the Inbox) and open it there. When the list
 * is already showing, its subscriber opens it at once; otherwise the list takes the
 * request when the route changes.
 */
export const openTask = channel()

export function openTaskInList(task: Pick<Task, 'id' | 'project_id'>): void {
  const route = task.project_id ? { view: 'project' as const, id: task.project_id } : { view: 'inbox' as const }
  const path = routePath(route)
  if (typeof location !== 'undefined' && (location.pathname === path || (path === '/' && location.pathname === '/inbox'))) {
    openTask.request(task.id)
    return
  }
  openTask.set(task.id)
  navigate(route)
}
