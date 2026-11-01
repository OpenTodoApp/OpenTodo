// App icon badge (OpenSpec change `app-icon-badge`): the number of today's open
// tasks on the installed app's icon, through the Badging API. Per device: a flag in
// localStorage (on by default), never synced. The count is the sidebar's Today
// count (every task Today lists, not the Today limit's slots), set on every local
// change and sync while the app runs, and cleared at zero.
//
// While the app is closed only a push can wake it: the app keeps the counts of the
// next days in the `meta` row BADGE_META, and the service worker (public/push-sw.js)
// sets the badge to the count of its day when a reminder push arrives. The row holds
// numbers and dates only, never task content.
import { useEffect } from 'react'
import { addDaysISO } from './dates'
import { db } from './db'
import { createStoredValue } from './deviceStorage'
import { resettable } from './moduleState'
import type { Task } from './types'
import { inToday } from './views'

export const BADGE_KEY = 'opentodo.appBadge'
/** The `meta` row the service worker reads: `{ dayStart, counts: { 'YYYY-MM-DD': n } }`. */
export const BADGE_META = 'badge:today'
/** How many days ahead, today included, the row covers. */
export const BADGE_DAYS = 7

export interface BadgeRow {
  /** The day start in minutes after midnight, so the worker finds the same logical day. */
  dayStart: number
  counts: Record<string, number>
}

interface BadgeNavigator {
  setAppBadge?: (n?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

function nav(): BadgeNavigator | null {
  return typeof navigator === 'undefined' ? null : (navigator as unknown as BadgeNavigator)
}

/** Whether this browser has the Badging API (installed apps on iOS 16.4+, Chromium). */
export function badgeSupported(n: BadgeNavigator | null = nav()): boolean {
  return !!n && typeof n.setAppBadge === 'function' && typeof n.clearAppBadge === 'function'
}

// Another tab turning it off applies here too (the storage event).
const enabled = createStoredValue<boolean>(BADGE_KEY, {
  parse: (raw) => raw !== 'off',
  serialize: (on) => (on ? null : 'off'),
}, { crossTab: true, server: true })

export const isBadgeEnabled = enabled.get
export const useBadgeEnabled = enabled.use

/** Turns the badge on or off for this device; off clears it at once. */
export function setBadgeEnabled(on: boolean): void {
  enabled.set(on)
  if (!on) void clearBadge()
}

/** Today's open tasks: what the sidebar's Today count shows. */
export function todayCount(openTasks: readonly Task[], today: string): number {
  let n = 0
  for (const task of openTasks) if (inToday(task, today)) n++
  return n
}

/**
 * The Today count of each of the next `days` days as the local data stands now:
 * a task due today and still open counts as overdue tomorrow.
 */
export function badgeCounts(openTasks: readonly Task[], today: string, days = BADGE_DAYS): Record<string, number> {
  const counts: Record<string, number> = {}
  for (let i = 0; i < days; i++) {
    const day = addDaysISO(today, i)
    counts[day] = todayCount(openTasks, day)
  }
  return counts
}

/** Shows `count` on the icon, or clears it at zero. Never throws (no permission, not installed). */
export async function showBadge(count: number, n: BadgeNavigator | null = nav()): Promise<void> {
  if (!badgeSupported(n)) return
  try {
    if (count > 0) await n!.setAppBadge!(count)
    else await n!.clearAppBadge!()
  } catch {
    // iOS refuses until notifications are allowed; nothing to show then.
  }
}

/** Clears the badge and forgets the counts the worker reads (turned off, signed out). */
export async function clearBadge(n: BadgeNavigator | null = nav()): Promise<void> {
  await showBadge(0, n)
  await db.meta.delete(BADGE_META).catch(() => undefined)
}

let lastRow = ''
resettable('appBadge', () => { lastRow = '' })

/** Stores the counts for the worker, only when they changed. */
async function storeCounts(row: BadgeRow): Promise<void> {
  const text = JSON.stringify(row)
  if (text === lastRow) return
  lastRow = text
  await db.meta.put({ key: BADGE_META, value: row }).catch(() => { lastRow = '' })
}

/**
 * Keeps the badge on the app icon current while the signed-in app runs. `zone`
 * only re-runs it when the viewer's time zone changes (zoned dues move days).
 */
export function useAppBadge(openTasks: readonly Task[], loaded: boolean, today: string, dayStart: number, zone: string): void {
  const on = useBadgeEnabled()
  const supported = badgeSupported()
  useEffect(() => {
    if (!supported || !on || !loaded) return
    const counts = badgeCounts(openTasks, today)
    void showBadge(counts[today] ?? 0)
    void storeCounts({ dayStart, counts })
  }, [supported, on, loaded, openTasks, today, dayStart, zone])
}
