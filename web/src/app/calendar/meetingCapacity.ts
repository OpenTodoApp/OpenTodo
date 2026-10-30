// Meetings in a day's capacity (OpenSpec change meeting-aware-capacity): which busy
// event minutes Day, Week and Month add to a day's load. Only with the device's
// "Count meetings in capacity" on, a calendar known and the Calendars toggle showing
// events, so what is counted is always what is drawn (design D4).
import { eventMinutes } from '../../lib/calendar'
import { covers, type EventsWindow } from '../../lib/calendarFeeds'
import type { CalendarEvent } from '../../lib/types'

export interface DayMeetings {
  /** Busy event minutes of the day, overlaps counted once. */
  minutes: number
  /** Offline and outside the device's event cache: nothing known, counted as 0. */
  unavailable: boolean
}

/** Counted meetings per date, or null when meetings do not count on this device. */
export function meetingsByDay(dates: readonly string[], events: readonly CalendarEvent[], opts: {
  count: boolean
  eventsShown: boolean
  subscriptions: number
  win: EventsWindow | null
  online: boolean
  zone?: string
}): Map<string, DayMeetings> | null {
  if (!opts.count || !opts.eventsShown || opts.subscriptions === 0) return null
  return new Map(dates.map((d) => [d, {
    minutes: eventMinutes(events, d, opts.zone),
    unavailable: !opts.online && !covers(opts.win, { from: d, to: d }),
  }]))
}
