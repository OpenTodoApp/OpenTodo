// Pure reminder time arithmetic (OpenSpec change `reminders`), shared by the data
// layer, the in-app watcher and the UI. No imports from the data layer so ops.ts
// can use it without a cycle.
import type { Due, Reminder, Task } from './types'

/** Due time assumed for a task that has a date but no time (local wall clock). */
export const DEFAULT_REMINDER_TIME = '09:00'

/** The instant a floating due date/time denotes in this device's time zone. */
export function dueInstant(due: Due): number {
  const [y, m, d] = due.date.split('-').map(Number)
  const [hh, mm] = (due.time ?? DEFAULT_REMINDER_TIME).split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime()
}

/** Firing instant of a relative reminder: due time plus offset, null without a due date. */
export function relativeFireAt(due: Due | null, offsetMinutes: number | null): number | null {
  if (!due) return null
  return dueInstant(due) + (offsetMinutes ?? 0) * 60_000
}

/** The firing that `delivered_at` acknowledges is the current one (not an earlier, snoozed or moved one). */
export function isDelivered(r: Pick<Reminder, 'delivered_at' | 'fire_at'>): boolean {
  return r.delivered_at !== null && r.fire_at !== null && r.delivered_at >= r.fire_at
}

/** Dismissed for the current firing. A dismissal older than fire_at belongs to an earlier firing. */
export function isDismissed(r: Pick<Reminder, 'dismissed_at' | 'fire_at'>): boolean {
  return r.dismissed_at !== null && r.fire_at !== null && r.dismissed_at >= r.fire_at
}

/**
 * Whether a reminder should be shown now: it has fired, is live, not dismissed for
 * this firing, and its task exists and is neither completed nor deleted.
 */
export function isDue(r: Reminder, task: Task | undefined, now: number): boolean {
  if (r.deleted_at || r.fire_at === null || r.fire_at > now) return false
  if (isDismissed(r)) return false
  return !!task && !task.completed_at && !task.deleted_at
}

export type SnoozeChoice = '10m' | '1h' | 'tomorrow'

/** The new firing instant for a snooze choice: +10 min, +1 h, or tomorrow at 09:00 local. */
export function snoozeUntil(choice: SnoozeChoice, now: number): number {
  if (choice === '10m') return now + 10 * 60_000
  if (choice === '1h') return now + 60 * 60_000
  const d = new Date(now)
  const [hh, mm] = DEFAULT_REMINDER_TIME.split(':').map(Number)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, hh, mm, 0, 0).getTime()
}

/** Presets offered in the detail panel, in minutes relative to the due time. */
export const RELATIVE_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 0, label: 'At due time' },
  { minutes: -10, label: '10 minutes before' },
  { minutes: -30, label: '30 minutes before' },
  { minutes: -60, label: '1 hour before' },
  { minutes: -1440, label: '1 day before' },
]

/** Human label of a relative offset ("30 minutes before", "2 hours after"). */
export function offsetLabel(minutes: number | null): string {
  const m = minutes ?? 0
  if (m === 0) return 'At due time'
  const abs = Math.abs(m)
  const unit = abs % 1440 === 0 ? [abs / 1440, 'day'] : abs % 60 === 0 ? [abs / 60, 'hour'] : [abs, 'minute']
  const [n, u] = unit as [number, string]
  return `${n} ${u}${n === 1 ? '' : 's'} ${m < 0 ? 'before' : 'after'}`
}
