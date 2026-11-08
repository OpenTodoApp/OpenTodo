// @vitest-environment happy-dom
// Upcoming's calendar events (today-agenda): the synced option beside Show repeating
// occurrences, one read-only agenda per day above that day's tasks, outside the count.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setShowEvents } from '../lib/calendarFeeds'
import { db, setMeta, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createTask, resetDeviceId } from '../lib/ops'
import type { CalendarEvent, CalendarSubscription } from '../lib/types'
import { setUpcomingEventsShown, upcomingEventsShown } from '../lib/userPrefs'
import { click, flush, key, render, waitFor } from '../ui/test-utils'
import { resetUpcomingAgendaFetch } from './calendar/UpcomingAgenda'
import { resetPanel } from './panel'
import { navigate } from './router'
import { TaskListView } from './TaskListView'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const fetchMock = vi.fn(async (url: unknown) =>
  String(url).includes('/api/v1/settings/') ? json({ enabled: false }) : json({ error: { code: 'feeds_disabled', message: 'off' } }, 404))
const eventCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/calendar-feeds/events'))
const switchCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/settings/calendar-feeds'))

const TOMORROW = '2026-10-23'
const work: CalendarSubscription = { id: 'work', name: 'Work', color: '#2563eb', enabled: true, lastSuccessAt: Date.now() }
const family: CalendarSubscription = { id: 'family', name: 'Family', color: '#16a34a', enabled: false, lastSuccessAt: Date.now() }
const ev = (id: string, summary: string, date: string, start: string, end: string, more: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, subscriptionId: 'work', uid: id, summary, location: '', allDay: false, free: false,
  start: { date, time: start }, end: { date, time: end }, ...more,
})

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 22, 10, 0))
  useDatabase(`upcoming-agenda-${Date.now()}-${n++}`)
  resetDeviceId()
  resetUpcomingAgendaFetch()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetPanel()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
})

async function seed(events: CalendarEvent[], fetchedAt = Date.now()) {
  await db.calendarSubscriptions.bulkPut([work, family])
  await db.calendarEvents.bulkPut(events)
  await setMeta('calendar.events.window', { from: '2026-09-24', to: '2026-11-19', fetchedAt })
}

const menu = () => document.querySelector<HTMLButtonElement>('[data-page-header] button[aria-label="More actions"]')!
const toggle = () => document.querySelector<HTMLElement>('[data-upcoming-events-toggle]')
const day = (date: string) => document.querySelector<HTMLElement>(`[data-group="${date}"]`)

async function openUpcoming() {
  navigate({ view: 'upcoming' })
  const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
  await waitFor(() => !!r.container.querySelector('[data-task-id]'))
  return r
}

describe('the option', () => {
  it('is off by default; Show calendar events writes one user_prefs op and lists the day above its task', async () => {
    await seed([ev('standup', 'Standup', TOMORROW, '09:00', '09:15')])
    await createTask({ title: 'Write the report', due: { date: TOMORROW } })
    const r = await openUpcoming()
    expect(r.container.querySelector('[data-upcoming-events]')).toBeNull()
    await click(menu())
    await waitFor(() => !!toggle())
    expect(toggle()!.textContent).toContain('Show calendar events')
    await click(toggle()!)
    await waitFor(() => !!day(TOMORROW)?.querySelector('[data-upcoming-events]'))
    expect((await db.outbox.toArray()).filter((o) => o.entity === 'user_prefs').map((o) => [o.field, o.value])).toEqual([['upcoming_events', 'shown']])
    const block = day(TOMORROW)!.querySelector('[data-upcoming-events]')!
    const task = day(TOMORROW)!.querySelector('[data-task-id]')!
    expect(block.compareDocumentPosition(task) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(day(TOMORROW)!.querySelector('[data-group-count]')!.textContent).toContain('1')
    expect(day(TOMORROW)!.querySelector('[data-group-count]')!.textContent).not.toContain('2')
    await r.unmount()
  })

  it('is not offered without a subscription, and asks nothing while the option is off', async () => {
    await createTask({ title: 'Write the report', due: { date: TOMORROW } })
    const r = await openUpcoming()
    await click(menu())
    await waitFor(() => !!document.querySelector('[data-briefing-toggle]'))
    expect(toggle()).toBeNull()
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- a request not made leaves no signal; give a wrong request time to go out
    await flush(10)
    expect(switchCalls()).toHaveLength(0)
    expect(eventCalls()).toHaveLength(0)
    await r.unmount()
  })

  it('asks the switches at most once in ten minutes while the option is on and nothing is cached', async () => {
    await db.calendarSubscriptions.bulkPut([work])
    await setUpcomingEventsShown(true)
    await createTask({ title: 'Write the report', due: { date: TOMORROW } })
    let r = await openUpcoming()
    await waitFor(() => switchCalls().length === 1)
    expect(eventCalls()).toHaveLength(0)
    await r.unmount()
    r = await openUpcoming()
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- a request not made leaves no signal; give a wrong second request time to go out
    await flush(10)
    expect(switchCalls()).toHaveLength(1)
    await r.unmount()
  })

  it('an unknown stored value reads as off', () => {
    expect(upcomingEventsShown(null)).toBe(false)
    expect(upcomingEventsShown({ upcoming_events: '' })).toBe(false)
    expect(upcomingEventsShown({ upcoming_events: 'compact' })).toBe(false)
    expect(upcomingEventsShown({ upcoming_events: 'shown' })).toBe(true)
  })
})

describe('the days', () => {
  const conference: CalendarEvent = {
    ...ev('conf', 'Conference', TOMORROW, '', ''), allDay: true,
    start: { date: '2026-10-22' }, end: { date: '2026-10-25' },
  }

  it('lists all-day events first, then timed ones; a disabled calendar stays out; the count is the tasks', async () => {
    const school = ev('school', 'School play', TOMORROW, '17:00', '18:00', { subscriptionId: 'family' })
    const focus = ev('focus', 'Focus time', TOMORROW, '14:00', '16:00', { free: true, location: 'Room 2' })
    await seed([focus, ev('standup', 'Standup', TOMORROW, '09:00', '09:15'), conference, school])
    await setUpcomingEventsShown(true)
    await createTask({ title: 'Write the report', due: { date: TOMORROW } })
    const r = await openUpcoming()
    await waitFor(() => !!day(TOMORROW)?.querySelector('[data-agenda-event="conf"]'))
    const block = day(TOMORROW)!.querySelector('[data-upcoming-events]')!
    expect(block.getAttribute('aria-label')).toBe('Calendar events')
    const ids = [...block.querySelectorAll('[data-agenda-event]')].map((e) => e.getAttribute('data-agenda-event'))
    expect(ids).toEqual(['conf', 'standup', 'focus'])
    expect(block.querySelector('[data-agenda-event="focus"]')!.textContent).toContain('Room 2')
    expect(block.querySelector('[data-agenda-event="focus"]')!.className).toContain('border-dashed')
    expect(day(TOMORROW)!.querySelector('[data-group-count]')!.textContent).toContain('1')
    await r.unmount()
  })

  it('gives a heading to a day that has only a meeting, between two planned days', async () => {
    await seed([ev('sync', 'Sync', '2026-10-24', '11:00', '12:00')])
    await setUpcomingEventsShown(true)
    await createTask({ title: 'Thursday', due: { date: TOMORROW } })
    await createTask({ title: 'Saturday', due: { date: '2026-10-25' } })
    const r = await openUpcoming()
    await waitFor(() => !!day('2026-10-24')?.querySelector('[data-agenda-event="sync"]'))
    expect(day('2026-10-24')!.querySelector('[data-task-id]')).toBeNull()
    expect(day('2026-10-24')!.querySelector('[data-group-count]')).toBeNull()
    await r.unmount()
  })

  it('keeps the meeting when the Upcoming filter matches no task', async () => {
    await seed([ev('standup', 'Standup', TOMORROW, '09:00', '09:15')])
    await setUpcomingEventsShown(true)
    await setMeta('upcoming.filter', 'p1')
    await createTask({ title: 'Write the report', due: { date: TOMORROW } })
    navigate({ view: 'upcoming' })
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => !!day(TOMORROW)?.querySelector('[data-agenda-event="standup"]'))
    expect(r.container.querySelector('[data-task-id]')).toBeNull()
    await r.unmount()
  })

  it('hides events while this device\'s Calendars toggle is off', async () => {
    await seed([ev('standup', 'Standup', TOMORROW, '09:00', '09:15')])
    await setShowEvents(false)
    await setUpcomingEventsShown(true)
    await createTask({ title: 'Write the report', due: { date: TOMORROW } })
    const r = await openUpcoming()
    await flush()
    expect(r.container.querySelector('[data-upcoming-events]')).toBeNull()
    await r.unmount()
  })

  it('opens the details popover and writes nothing', async () => {
    await seed([ev('review', 'Design review', TOMORROW, '11:00', '12:00')])
    await setUpcomingEventsShown(true)
    await createTask({ title: 'Write the report', due: { date: TOMORROW } })
    const r = await openUpcoming()
    await waitFor(() => !!day(TOMORROW)?.querySelector('[data-agenda-event="review"]'))
    const before = await db.outbox.count()
    const button = day(TOMORROW)!.querySelector<HTMLButtonElement>('[data-agenda-event="review"]')!
    await click(button)
    await waitFor(() => !!document.querySelector('[data-event-details]'))
    expect(document.querySelector('[data-event-details]')!.textContent).toContain('Work')
    await key(document.activeElement ?? document.body, 'Escape')
    await waitFor(() => !document.querySelector('[data-event-details]'))
    expect(await db.outbox.count()).toBe(before)
    await r.unmount()
  })

  it('says how old the cached events are while offline', async () => {
    await seed([ev('review', 'Design review', TOMORROW, '11:00', '12:00')], new Date(2026, 9, 22, 7, 40).getTime())
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await setUpcomingEventsShown(true)
    await createTask({ title: 'Write the report', due: { date: TOMORROW } })
    const r = await openUpcoming()
    await waitFor(() => !!document.querySelector('[data-calendars-status]'))
    expect(document.querySelector('[data-calendars-status]')!.textContent).toBe('Calendars as of 07:40')
    await r.unmount()
  })
})
