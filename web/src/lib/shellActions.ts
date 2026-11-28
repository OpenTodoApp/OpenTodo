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
// The Android quick-add notification's reply opens `/?add=<text>&id=<id>` in a background
// run, which saves the task with that id (android-quick-add-notification D4); the
// visible app only ever prefills.
import { localDueOf } from './dates'
import { db } from './db'
import { completeTask } from './ops'
import { pauseSession, resumeSession } from './focus/session'
import { dismissReminder, snoozeReminder } from './reminders'
import { resettable } from './moduleState'
import { has } from './shell'
import { seriesRule } from './recurring'
import { deadlineFireAt, relativeFireAt } from './reminderTime'
import type { Reminder, Task } from './types'
import { onSyncStatus, syncSnapshot } from './sync'

export type ReminderAction = 'snooze' | 'dismiss' | 'done'
export type FocusAction = 'pause' | 'resume'

export type ShellUrlAction =
  | { kind: 'reminder'; id: string; action: ReminderAction }
  | { kind: 'complete'; ids: string[]; on?: Record<string, string> }
  | { kind: 'add'; text: string; id?: string }
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
  // A quick-add notification's reply also names the task's id (android-quick-add-notification D4).
  const addId = p.get('id')
  if (add != null) return { kind: 'add', text: add.slice(0, 500), ...(addId ? { id: addId } : {}) }
  return null
}

/** A widget tick naming its occurrence: `<taskId>@<YYYY-MM-DD>`. */
const OCCURRENCE = /^(.+)@(\d{4}-\d{2}-\d{2})$/

/**
 * Writes a notification button's operation: Snooze 10 min or Dismiss, as `push-sw.js`
 * does, or Done, which completes the reminder's task through completeTask (a repeating
 * task moves to its next occurrence); completing disarms every reminder of the task.
 * A repeating task whose relative or deadline reminder, computed here from the task's
 * current due or deadline, fires more than an hour from now has already moved past the
 * firing the notification showed (completed on another device): Done leaves it alone
 * rather than complete the next occurrence too, and only when the stored `fire_at` is
 * that far ahead as well: a snooze set elsewhere, a server clock ahead or a firing
 * written in another time zone does not stop a Done; a series moves by at least a day. Absolute
 * and location reminders have no occurrence to compare with and are not guarded.
 */
export async function applyReminderAction(id: string, action: ReminderAction, now = Date.now()): Promise<void> {
  if (action === 'snooze') await snoozeReminder(id, '10m', now)
  else if (action === 'dismiss') await dismissReminder(id, now)
  else {
    const r = await db.reminders.get(id)
    const task = r ? await db.tasks.get(r.task_id) : undefined
    if (!r || !task || task.deleted_at || task.completed_at) return
    if (seriesRule(task) && movedOn(r, task, now)) return
    await completeTask(task.id, { now })
  }
}

/** A series moves by at least a day; within this margin a firing is still the one shown. */
const MOVED_ON_MARGIN_MS = 60 * 60_000

/**
 * Whether the reminder of a series now fires for a later occurrence than the one due by
 * `now`: both its firing computed here and its stored `fire_at` (which the shells schedule
 * from; a writer in another zone may differ) are more than the margin away.
 */
function movedOn(r: Reminder, task: Task, now: number): boolean {
  const at = r.kind === 'relative' ? relativeFireAt(task.due, r.offset_minutes)
    : r.kind === 'deadline' ? deadlineFireAt(task.deadline, r.offset_minutes)
    : null
  const later = (t: number) => t > now + MOVED_ON_MARGIN_MS
  return at != null && later(at) && (r.fire_at == null || later(r.fire_at))
}

/** Done from an address waits at most this long for the page's first sync. */
const DONE_SYNC_MS = 30_000
/** ...and this long for a sync that never starts (signed out, a login wall). */
const DONE_NO_SYNC_MS = 10_000

type SyncView = { state: string; lastSyncedAt: number | null }

/**
 * Resolves once the page's first sync exchange has ended, or cannot run (offline, an
 * error, signed out, locked), or after the limits. Done from an address applies after
 * it: a page just opened by a notification (a background run, a cold start) may hold a
 * repeating task several occurrences behind the server, and completing that copy would
 * write the occurrence already done elsewhere and move the series back (#2183).
 */
export function afterFirstSync(read: () => SyncView = syncSnapshot, listen: (fn: () => void) => () => void = onSyncStatus, limitMs = DONE_SYNC_MS, noSyncMs = DONE_NO_SYNC_MS): Promise<void> {
  return new Promise((resolve) => {
    let noSyncPassed = false
    const timers: ReturnType<typeof setTimeout>[] = []
    let off = () => {}
    const finish = () => { off(); timers.forEach(clearTimeout); resolve() }
    const check = () => {
      const s = read()
      if (s.state === 'syncing' || s.state === 'reseeding') return
      if (s.lastSyncedAt != null || s.state !== 'idle' || noSyncPassed) finish()
    }
    off = listen(check)
    timers.push(setTimeout(() => { noSyncPassed = true; check() }, noSyncMs), setTimeout(finish, limitMs))
    check()
  })
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
let added: string[] = []
resettable('shellActions', () => { added = [] })

/** How many notification and widget actions this page has written; a background run waits for its own (shell-reminders-on D4). */
export function reminderActionsApplied(): number {
  return applied
}

/** The tasks this page saved from quick-add notification replies, for `backgroundDone` (android-quick-add-notification D4). */
export function notificationAddsSaved(): readonly string[] {
  return added
}

/** Text the quick-add widget asked to prefill; read once by the quick-add sheet. */
export function takeQuickAddPrefill(): string | null {
  const text = pendingAdd
  pendingAdd = null
  return text
}

/** Handles the shell's address action, if any, and removes it from the address. Returns what it did. */
export async function handleShellUrl(openQuickAdd: () => boolean, loc: Location = location, hist: History = history, synced: () => Promise<void> = afterFirstSync): Promise<ShellUrlAction> {
  const action = shellUrlAction(loc.search, loc.pathname)
  if (!action) return null
  const p = new URLSearchParams(loc.search)
  for (const k of ['reminder', 'action', 'add', 'complete']) p.delete(k)
  if (action.kind === 'add') p.delete('id')
  const query = p.toString()
  hist.replaceState(hist.state, '', `${loc.pathname}${query ? `?${query}` : ''}${loc.hash}`)
  if (action.kind === 'reminder') {
    try {
      if (action.action === 'done') await synced()
      await applyReminderAction(action.id, action.action)
    } finally { applied++ }
  }
  else if (action.kind === 'complete') {
    // Only in a background run: any app can open the visible app at an address (D2).
    if (has('background')) {
      try { for (const id of action.ids) await applyWidgetComplete(id, Date.now(), action.on?.[id]).catch(() => undefined) } finally { applied++ }
    }
  }
  else if (action.kind === 'focus') await applyFocusAction(action.action)
  else if (has('background')) {
    if (action.text.trim()) {
      try {
        const id = await (await import('./shellQuickAdd')).applyNotificationAdd(action.text, action.id)
        if (id) added = [...added, id]
      } finally { applied++ }
    }
  }
  else {
    pendingAdd = action.text
    if (!openQuickAdd()) pendingAdd = null
  }
  return action
}
