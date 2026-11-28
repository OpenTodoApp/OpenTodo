// App icon badge (OpenSpec changes `app-icon-badge`, `badge-overdue`): the number of
// today's open tasks on the installed app's icon, through the Badging API. Per device:
// what it counts, in localStorage (Today by default, Earlier or Off; stored `overdue` for
// Earlier), never synced. Today is the sidebar's Today count (every task Today lists, not
// the Today limit's slots); Earlier is Today's Earlier group (overdueInToday). Set on every local change and sync while the app
// runs, and cleared at zero.
//
// While the app is closed only a push can wake it: the app keeps the counts of the
// next days in the `meta` row BADGE_META, and the service worker (src/push-sw.js)
// sets the badge to the count of its day when a reminder push arrives. The row holds
// numbers and dates only, never task content.
import { useEffect, useRef } from 'react'
import { addDaysISO } from './dates'
import { db } from './db'
import { createStoredValue } from './deviceStorage'
import { resettable } from './moduleState'
import { assignedToSomeoneElse } from './dayLists'
import type { Task } from './types'
import { Derived, type TaskChange } from './taskDelta'
import { inToday, overdueInToday } from './views'

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

/** What the badge counts on this device: Today's open tasks, only its overdue ones, or nothing. */
export type BadgeMode = 'today' | 'overdue' | 'off'
export const BADGE_MODES: readonly BadgeMode[] = ['today', 'overdue', 'off']

// Another tab changing it applies here too (the storage event). The stored values
// of the on/off switch before badge-overdue read the same: nothing is Today, `off` Off.
const mode = createStoredValue<BadgeMode>(BADGE_KEY, {
  parse: (raw) => (raw === 'off' || raw === 'overdue' ? raw : 'today'),
  serialize: (m) => (m === 'today' ? null : m),
}, { crossTab: true, server: 'today' })

export const useBadgeMode = mode.use

/** Sets what the badge counts on this device; Off clears it at once. */
export function setBadgeMode(m: BadgeMode): void {
  mode.set(m)
  if (m === 'off') void clearBadge()
}

/** Whether `task` counts on `day`: Today lists it (and, for Overdue, in its Overdue group). */
function counts(task: Task, day: string, me: string | null | undefined, m: BadgeMode): boolean {
  return inToday(task, day) && !assignedToSomeoneElse(task, me) && (m !== 'overdue' || overdueInToday(task, day))
}

/** Today's open tasks: what the sidebar's Today count shows, or Today's Overdue group. Tasks assigned to someone other than `me` are not counted, as Today does not list them. */
export function todayCount(openTasks: readonly Task[], today: string, me?: string | null, m: BadgeMode = 'today'): number {
  let n = 0
  for (const task of openTasks) if (counts(task, today, me, m)) n++
  return n
}

/**
 * The Today count of each of the next `days` days as the local data stands now:
 * a task due today and still open counts as overdue tomorrow.
 */
export function badgeCounts(openTasks: readonly Task[], today: string, days = BADGE_DAYS, me?: string | null, m: BadgeMode = 'today'): Record<string, number> {
  const out: Record<string, number> = {}
  for (let i = 0; i < days; i++) {
    const day = addDaysISO(today, i)
    out[day] = todayCount(openTasks, day, me, m)
  }
  return out
}

/** badgeCounts after `changes` to the open tasks (incremental-list-updates D2): plus and minus per changed row and day. */
export function patchBadgeCounts(prev: Record<string, number>, changes: readonly TaskChange[], _open: readonly Task[], today: string, days = BADGE_DAYS, me?: string | null, m: BadgeMode = 'today'): Record<string, number> {
  const out = { ...prev }
  for (let i = 0; i < days; i++) {
    const day = addDaysISO(today, i)
    for (const c of changes) {
      if (c.before && counts(c.before, day, me, m)) out[day]--
      if (c.after && counts(c.after, day, me, m)) out[day]++
    }
  }
  return out
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
export function useAppBadge(openTasks: readonly Task[], loaded: boolean, today: string, dayStart: number, zone: string, me?: string | null): void {
  const m = useBadgeMode()
  const supported = badgeSupported()
  // Counted from the rows each write changed (incremental-list-updates D2); a zone or mode change counts again.
  const countsOf = useRef(new Derived<Record<string, number>, [string, number, string | null, BadgeMode, string]>(
    (open, today, days, me, m) => badgeCounts(open, today, days, me, m),
    (prev, changes, open, today, days, me, m) => patchBadgeCounts(prev, changes, open, today, days, me, m),
  )).current
  useEffect(() => {
    if (!supported || m === 'off' || !loaded) return
    const counts = countsOf.get(openTasks, today, BADGE_DAYS, me ?? null, m, zone)
    void showBadge(counts[today] ?? 0)
    void storeCounts({ dayStart, counts })
  }, [supported, m, loaded, openTasks, today, dayStart, zone, me, countsOf])
}
