// Addresses a native shell opens the app at (OpenSpec change native-shells, design
// D4 and D6): `/?reminder=<id>&action=snooze|dismiss` from a notification's buttons,
// written as the same reminder operations the push worker writes, and `/?add=<text>`
// from the quick-add widget, which prefills quick add without saving anything. Every
// reminder notification offers `done` (location-reminders D2, reminder-done-action),
// which completes the reminder's task; the push worker opens the same address for
// Done when no window of the app is open. A shell with `focus` opens
// `/focus?action=pause|resume` from its Live Activity or ongoing notification
// (focus-live-activity D4), applied as Space applies it.
import { db } from './db'
import { completeTask } from './ops'
import { pauseSession, resumeSession } from './focus/session'
import { dismissReminder, snoozeReminder } from './reminders'

export type ReminderAction = 'snooze' | 'dismiss' | 'done'
export type FocusAction = 'pause' | 'resume'

export type ShellUrlAction =
  | { kind: 'reminder'; id: string; action: ReminderAction }
  | { kind: 'add'; text: string }
  | { kind: 'focus'; action: FocusAction }
  | null

/** Reads the action a shell put in the address, or null. */
export function shellUrlAction(search: string, pathname = '/'): ShellUrlAction {
  const p = new URLSearchParams(search)
  const id = p.get('reminder')
  const action = p.get('action')
  if (id && (action === 'snooze' || action === 'dismiss' || action === 'done')) return { kind: 'reminder', id, action }
  if (pathname === '/focus' && !id && (action === 'pause' || action === 'resume')) return { kind: 'focus', action }
  // `add` may be empty: the widget's button opens quick add (Android widgets hold no text field).
  const add = p.get('add')
  if (add != null) return { kind: 'add', text: add.slice(0, 500) }
  return null
}

/**
 * Writes a notification button's operation: Snooze 10 min or Dismiss, as `push-sw.js`
 * does, or Done, which completes the reminder's task through completeTask (a repeating
 * task moves to its next occurrence); completing disarms every reminder of the task.
 */
export async function applyReminderAction(id: string, action: ReminderAction, now = Date.now()): Promise<void> {
  if (action === 'snooze') await snoozeReminder(id, '10m', now)
  else if (action === 'dismiss') await dismissReminder(id, now)
  else {
    const r = await db.reminders.get(id)
    const task = r ? await db.tasks.get(r.task_id) : undefined
    if (task && !task.deleted_at && !task.completed_at) await completeTask(task.id, { now })
  }
}

/**
 * Pause or Resume from the shell, through the same transitions as Space; a session
 * already in that state (a stale notification) is left alone and nothing is written.
 */
export async function applyFocusAction(action: FocusAction, now?: number): Promise<void> {
  if (action === 'pause') await pauseSession(now)
  else await resumeSession(now)
}

let pendingAdd: string | null = null
let applied = 0

/** How many notification actions this page has written; a background run waits for its own (shell-reminders-on D4). */
export function reminderActionsApplied(): number {
  return applied
}

/** Text the quick-add widget asked to prefill; read once by the quick-add sheet. */
export function takeQuickAddPrefill(): string | null {
  const text = pendingAdd
  pendingAdd = null
  return text
}

/** Handles the shell's address action, if any, and removes it from the address. Returns what it did. */
export async function handleShellUrl(openQuickAdd: () => boolean, loc: Location = location, hist: History = history): Promise<ShellUrlAction> {
  const action = shellUrlAction(loc.search, loc.pathname)
  if (!action) return null
  const p = new URLSearchParams(loc.search)
  for (const k of ['reminder', 'action', 'add']) p.delete(k)
  const query = p.toString()
  hist.replaceState(hist.state, '', `${loc.pathname}${query ? `?${query}` : ''}${loc.hash}`)
  if (action.kind === 'reminder') {
    try { await applyReminderAction(action.id, action.action) } finally { applied++ }
  }
  else if (action.kind === 'focus') await applyFocusAction(action.action)
  else {
    pendingAdd = action.text
    if (!openQuickAdd()) pendingAdd = null
  }
  return action
}
