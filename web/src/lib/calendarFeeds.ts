// Events of subscribed calendars on this device (OpenSpec change calendar-feeds,
// design D8). Server data, never ops: fetched for a window around what Day and
// Week show, kept in Dexie for offline use, refreshed when stale, on reconnect
// and when the server says the calendars changed.
import { api } from './api'
import { addDaysISO, daysBetweenISO } from './dates'
import { db, getMeta, setMeta } from './db'

const WINDOW_KEY = 'calendar.events.window'
const SHOW_KEY = 'calendar.showEvents'
/** A cache older than this is refreshed when a view asks for it. */
export const STALE_MS = 10 * 60 * 1000
/** Days fetched either side of the asked range. */
export const PAD_DAYS = 28
/** The server's bound on one request. */
export const MAX_DAYS = 92

export interface EventsWindow {
  from: string
  to: string
  fetchedAt: number
}

export interface DayRange {
  from: string
  to: string
}

export function cachedWindow(): Promise<EventsWindow | null> {
  return getMeta<EventsWindow | null>(WINDOW_KEY, null)
}

/** True when the cached window holds every day of the range. */
export function covers(win: EventsWindow | null, range: DayRange): boolean {
  return !!win && win.from <= range.from && win.to >= range.to
}

/** The range to fetch: the asked range padded, within the server's bound. */
export function fetchRange(range: DayRange): DayRange {
  let from = addDaysISO(range.from, -PAD_DAYS)
  let to = addDaysISO(range.to, PAD_DAYS)
  if (daysBetweenISO(from, to) + 1 > MAX_DAYS) {
    const extra = Math.max(0, MAX_DAYS - (daysBetweenISO(range.from, range.to) + 1))
    from = addDaysISO(range.from, -Math.floor(extra / 2))
    to = addDaysISO(range.to, Math.ceil(extra / 2))
    if (daysBetweenISO(from, to) + 1 > MAX_DAYS) to = addDaysISO(from, MAX_DAYS - 1)
  }
  return { from, to }
}

let inflight: Promise<boolean> | null = null

/**
 * Fetch events for a range (padded) and replace the cache. Without a range, the
 * cached window is refreshed. Failures (offline, an older server, the feature
 * off) keep the cache and resolve false.
 */
export async function refreshEvents(range?: DayRange): Promise<boolean> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const win = await cachedWindow()
      const target = range ? fetchRange(range) : win ? { from: win.from, to: win.to } : null
      if (!target) return false
      const res = await api.calendarEvents(target.from, target.to)
      await db.transaction('rw', [db.calendarEvents, db.calendarSubscriptions, db.meta], async () => {
        await db.calendarEvents.clear()
        await db.calendarSubscriptions.clear()
        await db.calendarEvents.bulkPut(res.events)
        await db.calendarSubscriptions.bulkPut(res.subscriptions)
        await setMeta(WINDOW_KEY, { from: target.from, to: target.to, fetchedAt: Date.now() } satisfies EventsWindow)
      })
      return true
    } catch {
      return false
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** Make sure the cache holds a fresh copy of the range (Day and Week call this on navigation). */
export async function ensureEventsFor(range: DayRange, now = Date.now()): Promise<void> {
  const win = await cachedWindow()
  if (covers(win, range) && now - win!.fetchedAt < STALE_MS) return
  await refreshEvents(range)
}

/** How the cached events relate to what is on screen, for the toolbar's status text. */
export function eventsStatus(win: EventsWindow | null, range: DayRange, now = Date.now()): 'fresh' | 'stale' | 'missing' {
  if (!covers(win, range)) return 'missing'
  return now - win!.fetchedAt < STALE_MS ? 'fresh' : 'stale'
}

/** The "Calendars" toggle (per device, on by default). */
export function showEvents(): Promise<boolean> {
  return getMeta<boolean>(SHOW_KEY, true)
}

export function setShowEvents(on: boolean): Promise<void> {
  return setMeta(SHOW_KEY, on)
}
