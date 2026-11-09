// Tiny cross-component signals for keyboard flows (OpenSpec `time-blocking`):
// the `g` prefix state, the "focus the estimate control" request (`e` on a row) and
// the "place this task in the Day view" request (`s` on a row). Module state, no
// React context: the requests survive a route change and are consumed once.

import { useEffect, useState, type ComponentType } from 'react'
import { localDate } from '../lib/dates'
import { createStore } from '../lib/store'
import type { Task } from '../lib/types'
import { navigate, routePath } from './router'
import { openTaskPage } from './taskTrail'
import { armGPrefix, clearPrefix, isPrefixPending, pendingPrefix } from './shortcuts/dispatch'

/** The `g` prefix now lives in the shortcut dispatcher (ux-overhaul D5); these stay for the Vim layer and tests. */
export function setGPending(on: boolean): void {
  if (on) armGPrefix()
  else clearPrefix()
}

export function isGPending(): boolean {
  const p = pendingPrefix()
  return p.length === 1 && p[0].key === 'g' && !p[0].shift && !p[0].ctrl && !p[0].alt
}

/** Another sequence is under way (`r g`, display-keys): the Vim layer leaves its keys to the dispatcher. */
export function isOtherSequencePending(): boolean {
  return isPrefixPending() && !isGPending()
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

/** "Log a win" (today-closed-list D6): the command bar opens in Add with "Log as done" on. */
export const logWinRequest = channel()

/** `b` on a selected row: the detail panel opens its Blocked by picker (task-dependencies). */
export const blockedByFocus = channel()

/** `g /` and the palette: the sidebar opens its find field (sidebar-groups). Request id: `open`. */
export const sidebarFind = channel()

/** `s` on a selected row: the Day view opens with that task in placement mode. */
export const placement = channel()

/** "Re-plan the rest of the day" (replan-the-day D4): the Day or Week view opens its preview. Request id: `open`. */
export const replanRequest = channel()

/**
 * Open the re-plan preview: in place on the Day or Week view, else on the Day view of
 * today (Today's menu, the command palette elsewhere).
 */
export function openReplan(inCalendar: boolean): void {
  replanRequest.request('open')
  if (!inCalendar) navigate({ view: 'day' })
}

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

/** The briefing's replies (briefing-links D2): the shell opens the drawer on a phone, the bell opens its list. Request id: `open`. */
export const notificationsOpen = channel()

/**
 * Open a task from outside a list (a reminder toast, a notification, the palette):
 * as its page, with Esc going to the task's own list (its project, or the Inbox)
 * with the task selected there (task-full-page D2).
 */
export function openTaskInList(task: Pick<Task, 'id' | 'project_id'>): void {
  openTaskPage(task.id, { from: routePath(task.project_id ? { view: 'project', id: task.project_id } : { view: 'inbox' }) })
}

// ---- Connections (OpenSpec change notes-graph, design D3, D6) ----
// The menus, the palette and Linked references ask for an item's connections here;
// the Shell mounts the lazy dialog. Whether an item has a link either way is read by
// a probe in the lazy Linked references chunk, so nothing of the index is in the first load.

export type ConnectionKind = 'note' | 'task' | 'project'

type DialogProps = { kind: ConnectionKind; id: string; onClose: () => void }
const connections = createStore<{ kind: ConnectionKind; id: string; Dialog: ComponentType<DialogProps> } | null>('connectionsRequest', null)

/** Loads the dialog's chunk, then asks the Shell to show it (no Suspense round, which React reveals only after 300 ms). */
export function openConnections(kind: ConnectionKind, id: string): void {
  void import('./connections/ConnectionsDialog').then((m) => connections.set({ kind, id, Dialog: m.default }))
}

export const closeConnections = (): void => connections.set(null)
export const useConnectionsRequest = connections.use

/** Whether the item links to, or is linked from, something this device can read (false until known). */
export function useConnected(kind: ConnectionKind, id: string | undefined): boolean {
  const [on, setOn] = useState('')
  const key = id ? `${kind}:${id}` : ''
  useEffect(() => {
    if (!id) return
    let stop: (() => void) | undefined
    let live = true
    // The probe sits in the Linked references chunk, which already holds the link index.
    void import('./LinkedReferences').then((m) => { if (live) stop = m.watchConnected(kind, id, (v) => setOn(v ? key : '')) })
    return () => { live = false; stop?.() }
  }, [kind, id, key])
  return !!key && on === key
}
