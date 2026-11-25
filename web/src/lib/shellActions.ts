// Addresses a native shell opens the app at (OpenSpec change native-shells, design
// D4 and D6): `/?reminder=<id>&action=snooze|dismiss` from a notification's buttons,
// written as the same reminder operations the push worker writes, and `/?add=<text>`
// from the quick-add widget, which prefills quick add without saving anything. Every
// reminder notification offers `done` (location-reminders D2, reminder-done-action),
// which completes the reminder's task; the push worker opens the same address for
// Done when no window of the app is open. A shell with `focus` opens
// `/focus?action=pause|resume` from its Live Activity or ongoing notification
// (focus-live-activity D4), applied as Space applies it. The Android Today widget's
// completion circle opens `/?complete=<taskId>` in a background run
// (android-widget-list D2), applied only there, never in the visible app; an entry
// `<taskId>@<YYYY-MM-DD>` names the occurrence ticked (android-upcoming-calendar-widgets D6).
import { localDueOf } from './dates'
import { db } from './db'
import { completeTask } from './ops'
import { pauseSession, resumeSession } from './focus/session'
import { dismissReminder, snoozeReminder } from './reminders'
import { has } from './shell'

export type ReminderAction = 'snooze' | 'dismiss' | 'done'
export type FocusAction = 'pause' | 'resume'

export type ShellUrlAction =
  | { kind: 'reminder'; id: string; action: ReminderAction }
  | { kind: 'complete'; ids: string[]; on?: Record<string, string> }
  | { kind: 'add'; text: string }
  | { kind: 'focus'; action: FocusAction }
  | null

/** Reads the action a shell put in the address, or null. */
export function shellUrlAction(search: string, pathname = '/'): ShellUrlAction {
  const p = new URLSearchParams(search)
  const id = p.get('reminder')
  const action = p.get('action')
  if (id && (action === 'snooze' || action === 'dismiss' || action === 'done')) return { kind: 'reminder', id, action }
  // One run carries every tick queued since the last one: `?complete=a&complete=b`;
  // `a@2026-10-23` is the occurrence due that day (android-upcoming-calendar-widgets D6).
  const ids: string[] = []
  const on: Record<string, string> = {}
  for (const entry of p.getAll('complete')) {
    const m = OCCURRENCE.exec(entry)
    const id = m ? m[1] : entry
    if (!id || ids.includes(id) || ids.length >= 50) continue
    ids.push(id)
    if (m) on[id] = m[2]
  }
  if (ids.length) return Object.keys(on).length ? { kind: 'complete', ids, on } : { kind: 'complete', ids }
  if (pathname === '/focus' && !id && (action === 'pause' || action === 'resume')) return { kind: 'focus', action }
  // `add` may be empty: the widget's button opens quick add (Android widgets hold no text field).
  const add = p.get('add')
  if (add != null) return { kind: 'add', text: add.slice(0, 500) }
  return null
}

/** A widget tick naming its occurrence: `<taskId>@<YYYY-MM-DD>`. */
const OCCURRENCE = /^(.+)@(\d{4}-\d{2}-\d{2})$/

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
 * The widget's completion circle (android-widget-list D2): completes an open task
 * through completeTask, as a tap in the list does (a repeating task moves to its
 * next occurrence). A task already completed, deleted or unknown is left alone, and
 * so is one no longer due on `on`, the day of the occurrence ticked: a repeating task
 * another run or device already advanced is not advanced twice
 * (android-upcoming-calendar-widgets D6).
 */
export async function applyWidgetComplete(id: string, now = Date.now(), on?: string): Promise<void> {
  const task = await db.tasks.get(id)
  if (!task || task.deleted_at || task.completed_at) return
  if (on !== undefined && (task.due ? localDueOf(task.due).date : null) !== on) return
  await completeTask(task.id, { now })
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

/** How many notification and widget actions this page has written; a background run waits for its own (shell-reminders-on D4). */
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
  for (const k of ['reminder', 'action', 'add', 'complete']) p.delete(k)
  const query = p.toString()
  hist.replaceState(hist.state, '', `${loc.pathname}${query ? `?${query}` : ''}${loc.hash}`)
  if (action.kind === 'reminder') {
    try { await applyReminderAction(action.id, action.action) } finally { applied++ }
  }
  else if (action.kind === 'complete') {
    // Only in a background run: any app can open the visible app at an address (D2).
    if (has('background')) {
      try { for (const id of action.ids) await applyWidgetComplete(id, Date.now(), action.on?.[id]).catch(() => undefined) } finally { applied++ }
    }
  }
  else if (action.kind === 'focus') await applyFocusAction(action.action)
  else {
    pendingAdd = action.text
    if (!openQuickAdd()) pendingAdd = null
  }
  return action
}
