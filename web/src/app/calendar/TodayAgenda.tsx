// Today's agenda of calendar events (OpenSpec change today-agenda): the day's events
// from subscribed calendars, read from the device cache Day and Week fill, shown before
// Today's list when the account turned it on (D1, D5). Read-only: every event opens the
// calendar's details popover (D6). The per-device "Calendars" toggle of the grid does
// not apply here; disabled subscriptions never show (D4).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { allDayEvents, eventBlocks, formatTime as toHHMM, type EventBlock } from '../../lib/calendar'
import { cachedWindow, covers, eventsStatus, refreshEvents, STALE_MS, type DayRange } from '../../lib/calendarFeeds'
import { formatTime as formatWallTime } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { useCachedEventsWindow, useCalendarEvents, useCalendarSubscriptions } from '../../lib/liveData'
import { useUserPrefsRow } from '../../lib/localData'
import { useOnline } from '../../lib/online'
import type { CalendarEvent, CalendarSubscription } from '../../lib/types'
import { todayEventsShown } from '../../lib/userPrefs'
import { hueFor, Popover } from '../../ui'
import { EventDetails } from '../CalendarEvents'
import { CalendarStatus } from './CalendarStatus'
import { useNowMinutes } from './useNowMinutes'
import { resettable } from '../../lib/moduleState'

/** When Today's last fetch failed on this device (D3): no new attempt from Today for STALE_MS. */
let lastMiss = 0

/** Tests start without a remembered failure. */
export function resetTodayAgendaFetch(): void {
  lastMiss = 0
}
resettable('todayAgenda', resetTodayAgendaFetch)

/** Make sure the cache holds a fresh copy of today, at most one failed attempt per STALE_MS (D3). */
async function askForToday(range: DayRange): Promise<void> {
  if (Date.now() - lastMiss < STALE_MS) return
  const win = await cachedWindow()
  if (covers(win, range) && Date.now() - win!.fetchedAt < STALE_MS) return
  if (!(await refreshEvents(range))) lastMiss = Date.now()
}

export interface TodayCalendar {
  /** The device knows a subscribed calendar: the condition of the grid's Calendars toggle (D3). */
  available: boolean
  allDay: CalendarEvent[]
  timed: EventBlock[]
  subMap: Map<string, CalendarSubscription>
  status: ReturnType<typeof eventsStatus> | null
  fetchedAt?: number
}

/**
 * Today's events of enabled subscriptions. While `active` (Today is open) it asks for a fresh
 * copy when the option is on or the device knows a subscription (D3), so a server without
 * calendar feeds sees no request from a device that never had one.
 */
export function useTodayCalendar(active: boolean, shown: boolean, today: string, zone?: string): TodayCalendar {
  const events = useCalendarEvents()
  const subs = useCalendarSubscriptions()
  const win = useCachedEventsWindow()
  const ask = active && (shown || subs.length > 0)
  useEffect(() => {
    if (ask) void askForToday({ from: today, to: today })
  }, [ask, today])
  return useMemo(() => {
    const subMap = new Map(subs.map((s) => [s.id, s]))
    const enabled = events.filter((e) => subMap.get(e.subscriptionId)?.enabled !== false)
    return {
      available: subs.length > 0,
      allDay: allDayEvents(enabled, today),
      timed: eventBlocks(enabled, today, zone),
      subMap,
      status: subs.length === 0 ? null : eventsStatus(win, { from: today, to: today }),
      fetchedAt: win?.fetchedAt,
    }
  }, [events, subs, win, today, zone])
}

/**
 * Today's agenda for TaskListView: the calendar data and the menu item's state, undefined
 * while not offered (not Today, or no subscription known, D3), else whether the account turned it on (D1).
 */
export function useTodayAgenda(active: boolean, today: string, zone?: string): { cal: TodayCalendar; toggle: boolean | undefined } {
  const shown = todayEventsShown(useUserPrefsRow())
  const cal = useTodayCalendar(active, shown, today, zone)
  return { cal, toggle: active && cal.available ? shown : undefined }
}

/** One event as a button that toggles the calendar's details popover. */
function AgendaEvent({ ev, sub, zone, className, data, children, extra }: {
  ev: CalendarEvent
  sub?: CalendarSubscription
  zone?: string
  className: string
  data: Record<string, string | boolean | undefined>
  children: ReactNode
  /** Hidden text after the visible content (WCAG 2.5.3 Label in Name). */
  extra: (string | false | undefined)[]
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const rest = extra.filter(Boolean).join(', ')
  return (
    <>
      <button ref={ref} type="button" aria-haspopup="dialog" aria-expanded={open} data-hue={hueFor(sub?.color)} {...data}
        onClick={() => setOpen((o) => !o)}
        className={`${className} min-w-0 text-left focus-visible:outline-2 focus-visible:outline-focus`}>
        {children}
        {rest && <span className="sr-only">{`, ${rest}`}</span>}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} label={ev.summary || t('Event')} width="sm:w-72" className="p-3" align="start">
        <EventDetails ev={ev} sub={sub} zone={zone} />
      </Popover>
    </>
  )
}

/** The calendar's shapes (calendar-feeds "Events drawn in Day and Week"): a hatched event block, or a dashed outline when free. */
function shape(free: boolean, past: boolean): string {
  if (free) return `rounded-chip border border-dashed ${past ? 'ui-event-past' : 'border-hue-solid text-hue'}`
  return `ui-block ui-block--row ui-block--event${past ? ' ui-event-past' : ''}`
}

/**
 * The agenda block (D6): all-day chips, then timed rows in start order, then the
 * freshness line (D7). Nothing at all on a day without events.
 */
export function TodayAgenda({ cal, zone, online }: { cal: TodayCalendar; zone?: string; online?: boolean }) {
  const now = useNowMinutes()
  const deviceOnline = useOnline()
  if (cal.allDay.length === 0 && cal.timed.length === 0) return null
  return (
    <section aria-label={t('Calendar events today')} className="mb-3 space-y-1.5" data-today-agenda>
      {cal.allDay.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" data-agenda-all-day>
          {cal.allDay.map((ev) => {
            const sub = cal.subMap.get(ev.subscriptionId)
            return (
              <li key={ev.id} className="min-w-0 max-w-full">
                <AgendaEvent ev={ev} sub={sub} zone={zone} data={{ 'data-agenda-event': ev.id, 'data-free': ev.free || undefined }}
                  className={`flex max-w-full items-center gap-1 px-2 py-0.5 text-meta ${shape(ev.free, false)}`}
                  extra={[t('All day'), sub?.name, ev.free && t('Shown as free')]}>
                  {!ev.free && <span aria-hidden className="ui-block-dot" />}
                  <span className="truncate">{ev.summary || t('Busy')}</span>
                </AgendaEvent>
              </li>
            )
          })}
        </ul>
      )}
      {cal.timed.length > 0 && (
        <ul className="space-y-1" data-agenda-timed>
          {cal.timed.map((b) => {
            const ev = b.event
            const sub = cal.subMap.get(ev.subscriptionId)
            const past = b.end <= now
            return (
              <li key={b.id}>
                <AgendaEvent ev={ev} sub={sub} zone={zone} data={{ 'data-agenda-event': ev.id, 'data-free': ev.free || undefined, 'data-past': past || undefined }}
                  className={`flex w-full items-center gap-2 px-2 py-1 text-meta ${shape(ev.free, past)}`}
                  extra={[sub?.name, ev.free && t('Shown as free'), past && t('Ended')]}>
                  {!ev.free && <span aria-hidden className="ui-block-dot" />}
                  <span className="shrink-0 whitespace-nowrap tabular-nums">{formatWallTime(toHHMM(b.start))}–{formatWallTime(toHHMM(b.end))}</span>
                  <span className="min-w-0 truncate font-medium">{ev.summary || t('Busy')}</span>
                  {ev.location && <span className="min-w-0 flex-1 truncate text-hint">{ev.location}</span>}
                </AgendaEvent>
              </li>
            )
          })}
        </ul>
      )}
      <div className="empty:hidden"><CalendarStatus status={cal.status} online={online ?? deviceOnline} fetchedAt={cal.fetchedAt} /></div>
    </section>
  )
}
