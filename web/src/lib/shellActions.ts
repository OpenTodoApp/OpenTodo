// Addresses a native shell opens the app at (OpenSpec change native-shells, design
// D4 and D6): `/?reminder=<id>&action=snooze|dismiss` from a notification's buttons,
// written as the same reminder operations the push worker writes, and `/?add=<text>`
// from the quick-add widget, which prefills quick add without saving anything.
import { dismissReminder, snoozeReminder } from './reminders'

export type ShellUrlAction =
  | { kind: 'reminder'; id: string; action: 'snooze' | 'dismiss' }
  | { kind: 'add'; text: string }
  | null

/** Reads the action a shell put in the address, or null. */
export function shellUrlAction(search: string): ShellUrlAction {
  const p = new URLSearchParams(search)
  const id = p.get('reminder')
  const action = p.get('action')
  if (id && (action === 'snooze' || action === 'dismiss')) return { kind: 'reminder', id, action }
  const add = p.get('add')
  if (add != null && add.trim()) return { kind: 'add', text: add.slice(0, 500) }
  return null
}

/** Writes a notification button's reminder operation: Snooze 10 min or Dismiss, as `push-sw.js` does. */
export async function applyReminderAction(id: string, action: 'snooze' | 'dismiss', now = Date.now()): Promise<void> {
  if (action === 'snooze') await snoozeReminder(id, '10m', now)
  else await dismissReminder(id, now)
}

let pendingAdd: string | null = null

/** Text the quick-add widget asked to prefill; read once by the quick-add sheet. */
export function takeQuickAddPrefill(): string | null {
  const text = pendingAdd
  pendingAdd = null
  return text
}

/** Handles the shell's address action, if any, and removes it from the address. Returns what it did. */
export async function handleShellUrl(openQuickAdd: () => boolean, loc: Location = location, hist: History = history): Promise<ShellUrlAction> {
  const action = shellUrlAction(loc.search)
  if (!action) return null
  const p = new URLSearchParams(loc.search)
  for (const k of ['reminder', 'action', 'add']) p.delete(k)
  const query = p.toString()
  hist.replaceState(hist.state, '', `${loc.pathname}${query ? `?${query}` : ''}${loc.hash}`)
  if (action.kind === 'reminder') await applyReminderAction(action.id, action.action)
  else {
    pendingAdd = action.text
    if (!openQuickAdd()) pendingAdd = null
  }
  return action
}
