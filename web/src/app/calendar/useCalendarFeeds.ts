// Subscribed calendars in a calendar view (calendar-feeds D8): the device cache,
// refreshed for the range on screen, without the calendars hidden in this workspace
// (calendars-per-workspace), all hidden with the device's switch.
// Day, Week, the Plan (planner-view), Month and Year (calendar-events-all-views)
// read them through this hook.
import { useEffect, useMemo } from 'react'
import { ensureEventsFor, eventsStatus } from '../../lib/calendarFeeds'
import { useCachedEventsWindow, useShowEvents, useVisibleCalendarEvents } from '../../lib/liveData'

export function useCalendarFeeds(from: string, to: string) {
  useEffect(() => { void ensureEventsFor({ from, to }) }, [from, to])
  const eventsShown = useShowEvents()
  const { subs, subMap, events } = useVisibleCalendarEvents()
  const win = useCachedEventsWindow()
  const visibleEvents = useMemo(() => (eventsShown ? events : []), [eventsShown, events])
  const status = subs.length === 0 || !eventsShown ? null : eventsStatus(win, { from, to })
  return { eventsShown, subs, subMap, win, visibleEvents, status }
}
