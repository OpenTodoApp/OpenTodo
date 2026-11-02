// @vitest-environment happy-dom
// Subscribed calendars' events in every calendar view (OpenSpec change
// calendar-events-all-views, GitHub issue #733): the phone's Week agenda, the Month's
// cells and its phone day list, and the Year's marks; all follow the Calendars toggle
// and the enabled calendars, and stay read-only.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, setMeta } from '../lib/db'
import { setShowEvents } from '../lib/calendarFeeds'
import { createTask, resetDeviceId } from '../lib/ops'
import type { CalendarEvent, CalendarSubscription } from '../lib/types'
import { click, flush, minWidthPx, render, waitFor } from '../ui/test-utils'
import { CalendarView } from './CalendarView'
import { MonthView } from './MonthView'
import { resetPanel } from './panel'
import { resetTaskPage } from './taskPage.testkit'
import YearView from './YearView'

const work: CalendarSubscription = { id: 'sub1', name: 'Work', color: '#2563eb', enabled: true, lastSuccessAt: Date.now() }
const old: CalendarSubscription = { id: 'sub2', name: 'Old', color: '#16a34a', enabled: false, lastSuccessAt: Date.now() }
const ev = (id: string, summary: string, start: CalendarEvent['start'], end: CalendarEvent['end'], extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, subscriptionId: 'sub1', uid: id, summary, location: '', start, end, allDay: !start.time, free: false, ...extra })
const sync = ev('ev1', 'Team sync', { date: '2026-11-18', time: '10:00' }, { date: '2026-11-18', time: '11:00' }, { location: 'Room 4' })
const offsite = ev('ev2', 'Offsite', { date: '2026-11-19' }, { date: '2026-11-21' })
const hidden = ev('ev3', 'Old standup', { date: '2026-11-18', time: '09:00' }, { date: '2026-11-18', time: '09:15' }, { subscriptionId: 'sub2' })

async function seed(events: CalendarEvent[] = [sync, offsite, hidden]) {
  await db.calendarSubscriptions.bulkPut([work, old])
  await db.calendarEvents.bulkPut(events)
  await setMeta('calendar.events.window', { from: '2026-01-01', to: '2026-12-31', fetchedAt: Date.now() })
}

const original = window.matchMedia
function phone() {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('max-width: 39.99rem') ? true : minWidthPx(q) <= 390, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(async () => {
  resetTaskPage()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  window.matchMedia = original
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

describe('Week on a phone', () => {
  it('lists all-day events first and timed events among the timed tasks, read-only', async () => {
    phone()
    await seed()
    await createTask({ title: 'Early call', due: { date: '2026-11-18', time: '08:30' }, estimate_minutes: 30 })
    await createTask({ title: 'Late call', due: { date: '2026-11-18', time: '14:00' }, estimate_minutes: 30 })
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => r.container.querySelector('[data-agenda-day="2026-11-18"] [data-agenda-event="ev1"]') !== null && r.container.querySelectorAll('[data-agenda-day="2026-11-18"] [data-agenda-task]').length === 2)
    const day = r.container.querySelector('[data-agenda-day="2026-11-18"]')!
    const order = [...day.querySelectorAll('[data-agenda-task], [data-agenda-event]')].map((b) => b.textContent)
    expect(order[0]).toContain('Early call')
    expect(order[1]).toContain('Team sync')
    expect(order[1]).toMatch(/10:00/)
    expect(order[2]).toContain('Late call')
    // The disabled calendar's event is never shown.
    expect(r.container.querySelector('[data-agenda-event="ev3"]')).toBeNull()
    // The two-day all-day event shows on both days, saying "all day"; such a day is not empty.
    for (const d of ['2026-11-19', '2026-11-20']) {
      const row = r.container.querySelector(`[data-agenda-day="${d}"] [data-agenda-event="ev2"]`)
      expect(row?.textContent).toContain('all day')
      expect(r.container.querySelector(`[data-agenda-day="${d}"] [data-agenda-empty]`)).toBeNull()
    }
    expect(r.container.querySelector('[data-agenda-day="2026-11-21"] [data-agenda-event="ev2"]')).toBeNull()
    // Tapping opens the details; nothing is written.
    const before = await db.outbox.count()
    await click(day.querySelector('[data-agenda-event="ev1"]')!)
    await waitFor(() => document.querySelector('[data-event-details]') !== null)
    expect(document.querySelector('[data-event-details]')!.textContent).toContain('Room 4')
    expect(await db.outbox.count()).toBe(before)
    await r.unmount()
  })

  it('hides the events with the Calendars toggle', async () => {
    phone()
    await seed()
    await setShowEvents(false)
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => r.container.querySelector('[data-agenda-day="2026-11-18"]') !== null && r.container.querySelector('[data-calendars-toggle]') !== null)
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- it proves that nothing appears, and no event marks "nothing"
    await flush(30)
    expect(r.container.querySelector('[data-agenda-event]')).toBeNull()
    expect(r.container.querySelector('[data-agenda-day="2026-11-18"] [data-agenda-empty]')).not.toBeNull()
    await r.unmount()
  })
})

describe('Month', () => {
  it('shows events after the tasks of a cell, all-day first, inside "+N more"', async () => {
    await seed([sync, offsite, hidden, ev('ev4', 'Lunch', { date: '2026-11-18', time: '12:00' }, { date: '2026-11-18', time: '13:00' })])
    await createTask({ title: 'Write report', due: { date: '2026-11-18' } })
    await createTask({ title: 'Book flights', due: { date: '2026-11-18', time: '09:00' } })
    const r = await render(<MonthView />)
    const cell = () => r.container.querySelector('[data-month-day="2026-11-18"]')!
    await waitFor(() => r.container.querySelector('[data-month-day="2026-11-19"] [data-month-event="ev2"]') !== null && cell().querySelectorAll('[data-month-task]').length === 2)
    // Two tasks, then two events: three rows fit, so the second event is behind "+2 more".
    expect([...cell().querySelectorAll('[data-month-task], [data-month-event]')].map((b) => b.textContent)).toEqual([
      expect.stringContaining('Book flights'), expect.stringContaining('Write report'),
    ])
    expect(cell().querySelector('[data-month-more]')!.textContent).toBe('+2 more')
    await click(cell().querySelector('[data-month-more]')!)
    await waitFor(() => cell().querySelectorAll('[data-month-event]').length === 2)
    const events = [...cell().querySelectorAll('[data-month-event]')]
    expect(events.map((b) => b.getAttribute('data-month-event'))).toEqual(['ev1', 'ev4'])
    expect(events[0].textContent).toMatch(/10:00.*Team sync/)
    expect(cell().querySelector('[data-month-event="ev3"]')).toBeNull()
    // The cell's name counts the events apart from the tasks.
    expect(cell().querySelector('.sr-only')!.textContent).toContain('2 tasks, 2 events')
    // An all-day event shows on each day it covers, without a time.
    expect(r.container.querySelector('[data-month-day="2026-11-20"] [data-month-event="ev2"]')!.textContent).toBe('Offsite, Work')
    expect(r.container.querySelector('[data-month-day="2026-11-21"] [data-month-event]')).toBeNull()
    expect(r.container.querySelector('[data-calendars-toggle]')).not.toBeNull()
    await r.unmount()
  })

  it('fetches the shown weeks, and the Calendars toggle hides the events', async () => {
    await seed()
    const fetched: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { fetched.push(String(url)); return new Response('{}', { status: 404 }) }))
    await setMeta('calendar.events.window', { from: '2026-01-01', to: '2026-12-31', fetchedAt: 0 })
    const r = await render(<MonthView />)
    await waitFor(() => r.container.querySelector('[data-month-event="ev1"]') !== null)
    await waitFor(() => fetched.some((u) => u.includes('/api/v1/calendar-feeds/events')), 'the stale cache refreshed')
    await click(r.container.querySelector('[data-calendars-toggle]')!)
    await waitFor(() => r.container.querySelector('[data-month-event]') === null, 'events hidden')
    expect(r.container.querySelector('[data-calendars-toggle]')!.getAttribute('aria-pressed')).toBe('false')
    await r.unmount()
  })

  it('on a phone marks days with events and lists them under the grid for the focused day', async () => {
    phone()
    await seed()
    const r = await render(<MonthView />)
    await waitFor(() => r.container.querySelector('[data-month-day="2026-11-18"] [data-month-event-mark]') !== null)
    expect(r.container.querySelector('[data-month-day="2026-11-17"] [data-month-event-mark]')).toBeNull()
    await waitFor(() => r.container.querySelector('[data-month-day-list] [data-agenda-event="ev1"]') !== null)
    expect(r.container.querySelector('[data-month-day-list]')!.textContent).not.toContain('Nothing planned.')
    await click(r.container.querySelector('[data-month-day="2026-11-19"]')!)
    await waitFor(() => r.container.querySelector('[data-month-day-list] [data-agenda-event="ev2"]') !== null)
    expect(r.container.querySelector('[data-month-day-list] [data-agenda-event="ev2"]')!.textContent).toContain('all day')
    await r.unmount()
  })
})

describe('Year', () => {
  it('marks days with events apart from the density, names them and shows them in the tip', async () => {
    await seed()
    const r = await render(<YearView />)
    await waitFor(() => r.container.querySelector('[data-year-day="2026-11-18"][data-events]') !== null)
    const day = (d: string) => r.container.querySelector<HTMLElement>(`[data-year-day="${d}"]`)!
    expect(day('2026-11-18').getAttribute('data-events')).toBe('1')
    expect(day('2026-11-18').querySelector('[data-event-mark]')).not.toBeNull()
    // Events never count toward the density.
    expect(day('2026-11-18').getAttribute('data-density')).toBe('0')
    expect(day('2026-11-18').querySelector('.sr-only')!.textContent).toBe('November 18, 1 event')
    // The two-day all-day event marks both days; the disabled calendar's event marks nothing more.
    expect(day('2026-11-19').getAttribute('data-events')).toBe('1')
    expect(day('2026-11-20').getAttribute('data-events')).toBe('1')
    expect(day('2026-11-21').hasAttribute('data-events')).toBe(false)
    day('2026-11-18').focus()
    await waitFor(() => document.querySelector('[data-year-tip="2026-11-18"]') !== null)
    expect(document.querySelector('[data-year-tip="2026-11-18"]')!.textContent).toBe('1 event')
    await r.unmount()
  })

  it('shows no marks while the Calendars toggle hides events', async () => {
    await seed()
    await setShowEvents(false)
    const r = await render(<YearView />)
    await waitFor(() => r.container.querySelector('[data-calendars-toggle]') !== null)
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- it proves that nothing appears, and no event marks "nothing"
    await flush(30)
    expect(r.container.querySelector('[data-event-mark]')).toBeNull()
    await r.unmount()
  })
})
