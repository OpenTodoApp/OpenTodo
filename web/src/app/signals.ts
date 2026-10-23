// Tiny cross-component signals for keyboard flows (OpenSpec `time-blocking`):
// the `g` prefix state, the "focus the estimate control" request (`e` on a row) and
// the "place this task in the Day view" request (`s` on a row). Module state, no
// React context: the requests survive a route change and are consumed once.

import { localDate } from '../lib/dates'
import type { Task } from '../lib/types'
import { navigate, routePath } from './router'
import { openTaskPage } from './taskTrail'
import { armGPrefix, clearPrefix, isPrefixPending } from './shortcuts/dispatch'

/** The `g` prefix now lives in the shortcut dispatcher (ux-overhaul D5); these stay for the Vim layer and tests. */
export function setGPending(on: boolean): void {
  if (on) armGPrefix()
  else clearPrefix()
}

export function isGPending(): boolean {
  return isPrefixPending()
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

/** "Set the location of …" in the command palette: the panel opens its location editor (task-locations). */
export const locationFocus = channel()

/** `Shift+N` on a selected row: the detail panel opens its start date field (someday-and-evening). */
export const deferFocus = channel()

/** `b` on a selected row: the detail panel opens its Blocked by picker (task-dependencies). */
export const blockedByFocus = channel()

/** `g /` and the palette: the sidebar opens its find field (sidebar-groups). Request id: `open`. */
export const sidebarFind = channel()

/** `s` on a selected row: the Day view opens with that task in placement mode. */
export const placement = channel()

/** `s` on a list row: open the Day view (on the task's date, else today) in placement mode for it. */
export function placeInDay(task: Pick<Task, 'id' | 'due'>, today: string): void {
  placement.request(task.id)
  const date = localDate(task.due)
  navigate({ view: 'day', date: date && date !== today ? date : undefined })
}

/**
 * Ask the list on screen to open a task (project activity, the triage card): the
 * list selects the row and opens the task as its page, remembering the list.
 */
export const openTask = channel()

/** Select a task (without opening it) when the list next shows: leaving the triage mode (inbox-triage). */
export const selectTask = channel()

/**
 * Open a task from outside a list (a reminder toast, a notification, the palette):
 * as its page, with Esc going to the task's own list (its project, or the Inbox)
 * with the task selected there (task-full-page D2).
 */
export function openTaskInList(task: Pick<Task, 'id' | 'project_id'>): void {
  openTaskPage(task.id, { from: routePath(task.project_id ? { view: 'project', id: task.project_id } : { view: 'inbox' }) })
}
