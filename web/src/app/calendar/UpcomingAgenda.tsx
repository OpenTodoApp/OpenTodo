// Upcoming's calendar events (today-agenda): the same read-only agenda as Today, one
// per day, above that day's tasks. Off until the account turns it on. The device's
// Calendars toggle hides them; a disabled subscription never shows. The list's
// filters do not apply, and events are not tasks, so they stay out of the day's count.
import { useEffect, useMemo, type ReactNode } from 'react'
import { allDayEvents, eventBlocks, type EventBlock } from '../../lib/calendar'
import { cachedWindow, covers, eventsStatus, refreshEvents, STALE_MS, type DayRange } from '../../lib/calendarFeeds'
import { addDaysISO, formatDateHeading, type ResolvedDateTime } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { useCachedEventsWindow, useCalendarEvents, useCalendarSubscriptions, useShowEvents } from '../../lib/liveData'
import { useUserPrefsRow } from '../../lib/localData'
import type { ListGroup } from '../../lib/listGroups'
import { resettable } from '../../lib/moduleState'
import { useOnline } from '../../lib/online'
import type { CalendarEvent, CalendarSubscription } from '../../lib/types'
import { upcomingEventsShown } from '../../lib/userPrefs'
import { AgendaEvents } from './TodayAgenda'
import { CalendarStatus } from './CalendarStatus'

/** How far ahead Upcoming asks for events: one server request, the days after today. */
export const UPCOMING_EVENT_DAYS = 92

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/** When Upcoming's last fetch failed on this device: no new attempt for STALE_MS. */
let lastMiss = 0

/** Tests start without a remembered failure. */
export function resetUpcomingAgendaFetch(): void {
  lastMiss = 0
}
resettable('upcomingAgenda', resetUpcomingAgendaFetch)

async function askForUpcoming(range: DayRange): Promise<void> {
  if (Date.now() - lastMiss < STALE_MS) return
  const win = await cachedWindow()
  if (covers(win, range) && Date.now() - win!.fetchedAt < STALE_MS) return
  if (!(await refreshEvents(range))) lastMiss = Date.now()
}

/** The days Upcoming shows events for: the day after today through the last listed day, at most UPCOMING_EVENT_DAYS ahead. */
export function upcomingEventsRange(today: string, through: string | null): DayRange | null {
  if (!through || through <= today) return null
  const from = addDaysISO(today, 1)
  const cap = addDaysISO(today, UPCOMING_EVENT_DAYS)
  const to = through < cap ? through : cap
  return to < from ? null : { from, to }
}

export interface DayEvents {
  allDay: CalendarEvent[]
  timed: EventBlock[]
}

/**
 * Day headings for events on days Upcoming is not already listing. Days after today
 * only; Today's own groups (Start with Today) stay where they are.
 */
export function groupsWithEventDays(groups: readonly ListGroup[], eventDates: readonly string[], today: string, resolved: ResolvedDateTime): ListGroup[] {
  const have = new Set(groups.map((g) => g.key))
  const extra: ListGroup[] = []
  for (const date of eventDates) {
    if (!DATE_KEY.test(date) || date <= today || have.has(date)) continue
    extra.push({ key: date, heading: formatDateHeading(date, today, resolved), rows: [] })
  }
  if (extra.length === 0) return groups as ListGroup[]
  const lead: ListGroup[] = []
  const days: ListGroup[] = []
  for (const g of groups) (DATE_KEY.test(g.key) ? days : lead).push(g)
  days.push(...extra)
  days.sort((a, b) => (a.key < b.key ? -1 : 1))
  return [...lead, ...days]
}

export interface UpcomingAgendaState {
  /** Undefined when the item is not offered; else whether the account turned it on. */
  toggle: boolean | undefined
  days: Map<string, DayEvents>
  subMap: Map<string, CalendarSubscription>
  status: ReturnType<typeof eventsStatus> | null
  fetchedAt?: number
  hasEvents: boolean
}

/**
 * Upcoming's events of enabled subscriptions, while the account turned the option on
 * and this device's Calendars toggle is on. A fresh copy is asked for only then.
 */
export function useUpcomingAgenda(active: boolean, today: string, through: string | null, zone?: string): UpcomingAgendaState {
  const shown = upcomingEventsShown(useUserPrefsRow())
  const events = useCalendarEvents()
  const subs = useCalendarSubscriptions()
  const win = useCachedEventsWindow()
  const grid = useShowEvents()
  const range = useMemo(() => (active ? upcomingEventsRange(today, through) : null), [active, today, through])
  const ask = active && shown && subs.length > 0 && range !== null
  const from = range?.from
  const to = range?.to
  useEffect(() => {
    if (ask && from && to) void askForUpcoming({ from, to })
  }, [ask, from, to])
  return useMemo(() => {
    const subMap = new Map(subs.map((s) => [s.id, s]))
    const days = new Map<string, DayEvents>()
    if (shown && grid && range) {
      const enabled = events.filter((e) => subMap.get(e.subscriptionId)?.enabled !== false)
      for (let date = range.from; date <= range.to; date = addDaysISO(date, 1)) {
        const allDay = allDayEvents(enabled, date)
        const timed = eventBlocks(enabled, date, zone)
        if (allDay.length > 0 || timed.length > 0) days.set(date, { allDay, timed })
      }
    }
    return {
      toggle: active && subs.length > 0 ? shown : undefined,
      days,
      subMap,
      status: !range || subs.length === 0 ? null : eventsStatus(win, range),
      fetchedAt: win?.fetchedAt,
      hasEvents: days.size > 0,
    }
  }, [active, shown, grid, range, events, subs, win, zone])
}

/** One day's agenda, above that day's tasks. Nothing when the day has no events. */
export function UpcomingDayEvents({ day, subMap, zone }: { day: DayEvents; subMap: Map<string, CalendarSubscription>; zone?: string }) {
  if (day.allDay.length === 0 && day.timed.length === 0) return null
  return (
    <section aria-label={t('Calendar events')} className="mb-2 space-y-1.5" data-upcoming-events>
      <AgendaEvents allDay={day.allDay} timed={day.timed} subMap={subMap} zone={zone} />
    </section>
  )
}

/**
 * Upcoming's groups with event-only days inserted, and the per-day agenda, for the list.
 * One hook so the page component stays a wiring of the pieces it already had.
 */
export function useUpcomingList(active: boolean, taskGroups: readonly ListGroup[], today: string, through: string | null, zone: string | undefined, resolved: ResolvedDateTime): {
  groups: ListGroup[]
  eventsFor?: (key: string) => ReactNode
  hasEvents: boolean
  toggle: boolean | undefined
  status: ReturnType<typeof eventsStatus> | null
  fetchedAt?: number
} {
  const cal = useUpcomingAgenda(active, today, through, zone)
  const groups = useMemo(
    () => (cal.toggle ? groupsWithEventDays(taskGroups, [...cal.days.keys()], today, resolved) : taskGroups as ListGroup[]),
    [cal.toggle, cal.days, taskGroups, today, resolved],
  )
  const eventsFor = useMemo(() => {
    if (!cal.toggle) return undefined
    const { days, subMap } = cal
    return (key: string) => {
      const day = days.get(key)
      return day ? <UpcomingDayEvents day={day} subMap={subMap} zone={zone} /> : null
    }
  }, [cal, zone])
  return { groups, eventsFor, hasEvents: cal.hasEvents, toggle: cal.toggle, status: cal.status, fetchedAt: cal.fetchedAt }
}

/** The freshness line, once, when the cached events are stale or the device is offline. */
export function UpcomingEventsNote({ status, fetchedAt }: { status: ReturnType<typeof eventsStatus> | null; fetchedAt?: number }) {
  const online = useOnline()
  return (
    <div className="mb-3 empty:hidden">
      <CalendarStatus status={status} online={online} fetchedAt={fetchedAt} />
    </div>
  )
}
