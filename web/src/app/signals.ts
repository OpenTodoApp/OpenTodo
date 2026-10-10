// Tiny cross-component signals for keyboard flows (OpenSpec `time-blocking`):
// the `g` prefix state, the "focus the estimate control" request (`e` on a row) and
// the "place this task in the Day view" request (`s` on a row). Module state, no
// React context: the requests survive a route change and are consumed once.

import type { Task } from '../lib/types'
import { navigate } from './router'

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

/** `s` on a selected row: the Day view opens with that task in placement mode. */
export const placement = channel()

/** `s` on a list row: open the Day view (on the task's date, else today) in placement mode for it. */
export function placeInDay(task: Pick<Task, 'id' | 'due'>, today: string): void {
  placement.request(task.id)
  const date = task.due?.date
  navigate({ view: 'day', date: date && date !== today ? date : undefined })
}
