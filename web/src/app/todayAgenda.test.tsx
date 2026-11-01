// @vitest-environment happy-dom
// Today's agenda of calendar events (OpenSpec change today-agenda, task 2.5): the
// synced option in Today's menu, offered only once a subscription is known, and the
// block it shows: all-day chips first, timed events in start order, free events as an
// outline, ended ones dimmed, the calendar's details popover, nothing on a quiet day.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshAfterChange, setShowEvents } from '../lib/calendarFeeds'
import { db, setMeta, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createTask, resetDeviceId } from '../lib/ops'
import type { CalendarEvent, CalendarSubscription } from '../lib/types'
import { setTodayEventsShown, todayEventsShown } from '../lib/userPrefs'
import { click, flush, key, render, waitFor } from '../ui/test-utils'
import { resetTodayAgendaFetch } from './calendar/TodayAgenda'
import { resetPanel } from './panel'
import { navigate } from './router'
import { TaskListView } from './TaskListView'

// The server's answers: both switches are plain reads (off by default), the events route is 404 while they are off.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const fetchMock = vi.fn(async (url: unknown) =>
  String(url).includes('/api/v1/settings/') ? json({ enabled: false }) : json({ error: { code: 'feeds_disabled', message: 'off' } }, 404))
const eventCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/calendar-feeds/events'))
const switchCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/settings/calendar-feeds'))
let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 22, 10, 0))
  useDatabase(`today-agenda-${Date.now()}-${n++}`)
  resetDeviceId()
  resetTodayAgendaFetch()
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

const work: CalendarSubscription = { id: 'work', name: 'Work', color: '#2563eb', enabled: true, lastSuccessAt: Date.now() }
const family: CalendarSubscription = { id: 'family', name: 'Family', color: '#16a34a', enabled: false, lastSuccessAt: Date.now() }
const ev = (id: string, summary: string, start: string, end: string, more: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, subscriptionId: 'work', uid: id, summary, location: '', allDay: false, free: false,
  start: { date: '2026-10-22', time: start }, end: { date: '2026-10-22', time: end }, ...more,
})
const conference: CalendarEvent = { ...ev('conf', 'Conference', '', ''), allDay: true, start: { date: '2026-10-21' }, end: { date: '2026-10-24' } }
const standup = ev('standup', 'Standup', '09:00', '09:15')
const focus = ev('focus', 'Focus time', '14:00', '16:00', { free: true, location: 'Room 2' })
const review = ev('review', 'Design review', '11:00', '12:00')
const school = ev('school', 'School play', '17:00', '18:00', { subscriptionId: 'family' })

async function seed(events: CalendarEvent[], fetchedAt = Date.now()) {
  await db.calendarSubscriptions.bulkPut([work, family])
  await db.calendarEvents.bulkPut(events)
  await setMeta('calendar.events.window', { from: '2026-09-24', to: '2026-11-19', fetchedAt })
}

const agenda = () => document.querySelector('[data-today-agenda]')
const menu = () => document.querySelector<HTMLButtonElement>('[data-page-header] button[aria-label="More actions"]')!
const toggle = () => document.querySelector<HTMLElement>('[data-today-events-toggle]')

async function openToday() {
  await createTask({ title: 'Write the report', due: { date: '2026-10-22' } })
  navigate({ view: 'today' })
  const r = await render(<TaskListView route={{ view: 'today' }} />)
  await waitFor(() => !!r.container.querySelector('[data-task-id]'))
  return r
}

describe('the option', () => {
  it('is off by default; Show calendar events writes one user_prefs op and shows the agenda before the list', async () => {
    await seed([standup])
    const r = await openToday()
    expect(agenda()).toBeNull()
    await click(menu())
    await waitFor(() => !!toggle())
    expect(toggle()!.textContent).toContain('Show calendar events')
    // The option is read by now (the menu offers to show), and the agenda is still away.
    expect(agenda()).toBeNull()
    await click(toggle()!)
    await waitFor(() => !!agenda())
    expect((await db.outbox.toArray()).filter((o) => o.entity === 'user_prefs').map((o) => [o.field, o.value])).toEqual([['today_events', 'shown']])
    // Content of the list: after the quick add, before the first task.
    const first = r.container.querySelector('[data-task-id]')!
    expect(agenda()!.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(agenda()!.closest('[data-page-header]')).toBeNull()
    await flush()
    await click(menu())
    await waitFor(() => toggle()?.textContent?.includes('Hide calendar events') === true)
    await click(toggle()!)
    await waitFor(() => !agenda())
    await r.unmount()
  })

  it('is not offered without a subscription (feeds off), and Today looks at the switches at most once in ten minutes', async () => {
    await setTodayEventsShown(true)
    let r = await openToday()
    await waitFor(() => switchCalls().length === 1)
    await click(menu())
    await waitFor(() => !!document.querySelector('[data-briefing-toggle]'))
    expect(toggle()).toBeNull()
    expect(agenda()).toBeNull()
    await r.unmount()
    r = await openToday()
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- a request not made leaves no signal; give a wrong second request time to go out
    await flush(10)
    expect(switchCalls()).toHaveLength(1)
    expect(eventCalls()).toHaveLength(0)
    await r.unmount()
  })

  it('asks nothing of the server while the option is off and no calendar is known', async () => {
    const r = await openToday()
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- a request not made leaves no signal; give a wrong request time to go out
    await flush(10)
    expect(eventCalls()).toHaveLength(0)
    await r.unmount()
  })

  it('learns about a first calendar added in Settings, without a calendar view opened before', async () => {
    fetchMock.mockImplementation(async (url: unknown) =>
      String(url).includes('/settings/calendar-feeds') ? json({ enabled: true }) : json({ events: [standup], subscriptions: [work] }))
    expect(await refreshAfterChange()).toBe(true)
    expect(String((eventCalls()[0] as unknown[])[0])).toContain('from=2026-09-24&to=2026-11-19')
    const r = await openToday()
    await click(menu())
    await waitFor(() => toggle()?.textContent?.includes('Show calendar events') === true)
    await r.unmount()
  })

  it('an unknown stored value reads as off', () => {
    expect(todayEventsShown(null)).toBe(false)
    expect(todayEventsShown({ today_events: '' })).toBe(false)
    expect(todayEventsShown({ today_events: 'compact' })).toBe(false)
    expect(todayEventsShown({ today_events: 'shown' })).toBe(true)
  })
})

describe('the agenda', () => {
  it('lists all-day events first, then timed ones in start order; free is an outline, ended is dimmed', async () => {
    await seed([focus, review, standup, conference, school])
    await setTodayEventsShown(true)
    const r = await openToday()
    await waitFor(() => !!agenda())
    expect(agenda()!.getAttribute('aria-label')).toBe('Calendar events today')
    const ids = [...agenda()!.querySelectorAll('[data-agenda-event]')].map((e) => e.getAttribute('data-agenda-event'))
    // The disabled "Family" calendar never shows.
    expect(ids).toEqual(['conf', 'standup', 'review', 'focus'])
    expect(agenda()!.querySelector('[data-agenda-all-day] [data-agenda-event="conf"]')!.textContent).toContain('Conference')
    const row = (id: string) => agenda()!.querySelector<HTMLButtonElement>(`[data-agenda-event="${id}"]`)!
    expect(row('standup').textContent).toBe('09:00–09:15Standup, Work, Ended')
    expect(row('standup').hasAttribute('data-past')).toBe(true)
    expect(row('standup').className).toContain('ui-event-past')
    expect(row('review').hasAttribute('data-past')).toBe(false)
    expect(row('focus').hasAttribute('data-free')).toBe(true)
    expect(row('focus').className).toContain('border-dashed')
    expect(row('focus').className).not.toContain('ui-block--event')
    expect(row('focus').textContent).toBe('14:00–16:00Focus timeRoom 2, Work, Shown as free')
    expect(row('review').className).toContain('ui-block--event')
    await r.unmount()
  })

  it('opens the calendar\'s details popover and Escape closes it; nothing is written', async () => {
    await seed([review])
    await setTodayEventsShown(true)
    const r = await openToday()
    await waitFor(() => !!agenda())
    const before = await db.outbox.count()
    const button = agenda()!.querySelector<HTMLButtonElement>('[data-agenda-event="review"]')!
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    button.focus()
    await click(button)
    await waitFor(() => !!document.querySelector('[data-event-details]'))
    expect(document.querySelector('[data-event-details]')!.textContent).toContain('Work')
    await key(document.activeElement ?? document.body, 'Escape')
    await waitFor(() => !document.querySelector('[data-event-details]'))
    expect(await db.outbox.count()).toBe(before)

    const axe = (await import('axe-core')).default
    const res = await axe.run(agenda()!, { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await r.unmount()
  })

  it('shows nothing on a day without events', async () => {
    await seed([{ ...review, id: 'tomorrow', start: { date: '2026-10-23', time: '11:00' }, end: { date: '2026-10-23', time: '12:00' } }])
    await setTodayEventsShown(true)
    const r = await openToday()
    await click(menu())
    await waitFor(() => toggle()?.textContent?.includes('Hide calendar events') === true, 'the option read as on')
    expect(agenda()).toBeNull()
    await r.unmount()
  })

  it('ignores the grid\'s per-device Calendars toggle', async () => {
    await seed([review])
    await setShowEvents(false)
    await setTodayEventsShown(true)
    const r = await openToday()
    await waitFor(() => !!agenda())
    await r.unmount()
  })

  it('says how old the cached events are while offline', async () => {
    await seed([review], new Date(2026, 9, 22, 7, 40).getTime())
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await setTodayEventsShown(true)
    const r = await openToday()
    await waitFor(() => !!agenda()?.querySelector('[data-calendars-status]'))
    expect(agenda()!.querySelector('[data-calendars-status]')!.textContent).toBe('Calendars as of 07:40')
    await r.unmount()
  })
})
