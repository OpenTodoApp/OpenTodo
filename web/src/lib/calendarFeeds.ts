// Events of subscribed calendars on this device (OpenSpec change calendar-feeds,
// design D8). Server data, never ops: fetched for a window around what a calendar
// view shows (Day, Week, Plan, Month and Year, calendar-events-all-views), kept in
// Dexie for offline use, refreshed when stale, on reconnect and when the server says
// the calendars changed. A window wider than one request is fetched in pieces.
import { api } from './api'
import { addDaysISO, daysBetweenISO, logicalToday } from './dates'
import { db, getMeta, setMeta } from './db'
import type { CalendarEvent, CalendarSubscription } from './types'

const WINDOW_KEY = 'calendar.events.window'
const SHOW_KEY = 'calendar.showEvents'
/** A cache older than this is refreshed when a view asks for it. */
export const STALE_MS = 10 * 60 * 1000
/** Days fetched either side of the asked range. */
export const PAD_DAYS = 28
/** The server's bound on one request. */
export const MAX_DAYS = 92
/** The widest window a device fetches (a year, as the Year view shows, and a week). */
export const MAX_WINDOW_DAYS = 373

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

/**
 * The range to fetch: the asked range padded, within the server's bound; a range wider
 * than one request (stacked months, a year) is fetched as it is, up to MAX_WINDOW_DAYS.
 */
export function fetchRange(range: DayRange): DayRange {
  if (daysBetweenISO(range.from, range.to) + 1 > MAX_DAYS) {
    const last = addDaysISO(range.from, MAX_WINDOW_DAYS - 1)
    return { from: range.from, to: range.to < last ? range.to : last }
  }
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

/** A window as the requests that fetch it, each at most MAX_DAYS wide. */
export function requestRanges(win: DayRange): DayRange[] {
  const out: DayRange[] = []
  for (let from = win.from; from <= win.to; from = addDaysISO(from, MAX_DAYS)) {
    const last = addDaysISO(from, MAX_DAYS - 1)
    out.push({ from, to: last < win.to ? last : win.to })
  }
  return out
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
      // One request per piece, in order; an event in two pieces is kept once (by id).
      const events = new Map<string, CalendarEvent>()
      const subs = new Map<string, CalendarSubscription>()
      for (const piece of requestRanges(target)) {
        const res = await api.calendarEvents(piece.from, piece.to)
        for (const ev of res.events) events.set(ev.id, ev)
        for (const sub of res.subscriptions) subs.set(sub.id, sub)
      }
      await db.transaction('rw', [db.calendarEvents, db.calendarSubscriptions, db.meta], async () => {
        await db.calendarEvents.clear()
        await db.calendarSubscriptions.clear()
        await db.calendarEvents.bulkPut([...events.values()])
        await db.calendarSubscriptions.bulkPut([...subs.values()])
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

/**
 * After the user changed their subscriptions (Settings): refresh the cached window, or
 * today when the device has none yet, so Today learns about a first calendar (today-agenda D3).
 */
export async function refreshAfterChange(): Promise<boolean> {
  const today = logicalToday()
  return refreshEvents((await cachedWindow()) ? undefined : { from: today, to: today })
}

/** Make sure the cache holds a fresh copy of the range (the calendar views call this on navigation). */
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
