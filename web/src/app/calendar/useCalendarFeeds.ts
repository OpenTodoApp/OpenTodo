// Subscribed calendars in a calendar view (calendar-feeds D8): the device cache,
// refreshed for the range on screen, hidden with the toolbar toggle (per device).
// Day, Week, the Plan (planner-view) and Month (its capacity, meeting-aware-capacity)
// read them through this hook.
import { useEffect, useMemo } from 'react'
import { ensureEventsFor, eventsStatus } from '../../lib/calendarFeeds'
import { useCachedEventsWindow, useCalendarEvents, useCalendarSubscriptions, useShowEvents } from '../../lib/liveData'

/** `fetch` false reads the cache only (Month, unless it counts meetings). */
export function useCalendarFeeds(from: string, to: string, fetch = true) {
  useEffect(() => { if (fetch) void ensureEventsFor({ from, to }) }, [from, to, fetch])
  const eventsShown = useShowEvents()
  const events = useCalendarEvents()
  const subs = useCalendarSubscriptions()
  const win = useCachedEventsWindow()
  const subMap = useMemo(() => new Map(subs.map((s) => [s.id, s])), [subs])
  const visibleEvents = useMemo(() => (eventsShown ? events.filter((e) => subMap.get(e.subscriptionId)?.enabled !== false) : []), [eventsShown, events, subMap])
  const status = subs.length === 0 || !eventsShown ? null : eventsStatus(win, { from, to })
  return { eventsShown, subs, subMap, win, visibleEvents, status }
}
