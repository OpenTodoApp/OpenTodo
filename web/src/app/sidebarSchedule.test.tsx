// @vitest-environment happy-dom
// The day's schedule at the bottom of the sidebar (OpenSpec change sidebar-schedule,
// issue 536): closed by default and remembered, then the time now and what is still
// ahead today (timed tasks and events in start order, the current one marked), a task
// opening in the side panel, an event's details, and the rest linked to the calendar.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, setMeta, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createTask, resetDeviceId } from '../lib/ops'
import type { CalendarEvent, CalendarSubscription, Task } from '../lib/types'
import { click, render, waitFor } from '../ui/test-utils'
import { SCHEDULE_ROWS, scheduleAhead, SidebarSchedule } from './calendar/SidebarSchedule'
import { resetTodayAgendaFetch } from './calendar/TodayAgenda'
import { resetPanel, usePanelTaskId } from './panel'
import { navigate, parseRoute } from './router'

const fetchMock = vi.fn(async () => new Response('{"error":{"code":"feeds_disabled","message":"off"}}', { status: 404 }))
let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 22, 10, 5))
  useDatabase(`sidebar-schedule-${Date.now()}-${n++}`)
  resetDeviceId()
  resetTodayAgendaFetch()
  localStorage.clear()
  vi.stubGlobal('fetch', fetchMock)
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  navigate({ view: 'inbox' })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
})

const work: CalendarSubscription = { id: 'work', name: 'Work', color: '#2563eb', enabled: true, lastSuccessAt: Date.now() }
const ev = (id: string, summary: string, start: string, end: string): CalendarEvent => ({
  id, subscriptionId: 'work', uid: id, summary, location: '', allDay: false, free: false,
  start: { date: '2026-10-22', time: start }, end: { date: '2026-10-22', time: end },
})

const body = () => document.querySelector('[data-schedule-body]')
const heading = () => document.querySelector<HTMLButtonElement>('[data-sidebar-schedule] button[aria-expanded]')!
const rows = () => [...document.querySelectorAll<HTMLElement>('[data-schedule-task], [data-schedule-event]')]

function PanelProbe() {
  return <span data-probe={usePanelTaskId() ?? ''} />
}

describe('scheduleAhead', () => {
  const task = (id: string, time: string, estimate: number | null = 30) => ({ id, due: { date: '2026-10-22', time }, estimate_minutes: estimate }) as Task
  it('keeps what has not ended, in start order, tasks before events on a tie', () => {
    const items = scheduleAhead([task('done', '08:00'), task('now', '10:00'), task('nap', '13:00')], [{ id: 'event:a', start: 13 * 60, end: 14 * 60, event: ev('a', 'A', '13:00', '14:00') }], 10 * 60 + 5)
    expect(items.map((i) => i.id)).toEqual(['now', 'nap', 'event:a'])
  })
})

describe('the schedule', () => {
  it('is closed by default, opens on its heading and remembers it on the device', async () => {
    const r = await render(<SidebarSchedule />)
    expect(heading().getAttribute('aria-expanded')).toBe('false')
    expect(body()).toBeNull()
    await click(heading())
    expect(body()).not.toBeNull()
    expect(localStorage.getItem('ot.sidebar.group.schedule')).toBe('1')
    await r.unmount()
    const again = await render(<SidebarSchedule />)
    expect(body()).not.toBeNull()
    await again.unmount()
  })

  it('shows the time and what is ahead today: timed tasks and events in order, the current one marked', async () => {
    localStorage.setItem('ot.sidebar.group.schedule', '1')
    await db.calendarSubscriptions.put(work)
    await db.calendarEvents.bulkPut([ev('standup', 'Standup', '09:00', '09:15'), ev('lunch', 'Lunch', '12:00', '13:00')])
    await setMeta('calendar.events.window', { from: '2026-09-24', to: '2026-11-19', fetchedAt: Date.now() })
    await createTask({ title: 'Breakfast', due: { date: '2026-10-22', time: '08:00' }, estimate_minutes: 30 })
    await createTask({ title: 'Write', due: { date: '2026-10-22', time: '10:00' }, estimate_minutes: 60 })
    await createTask({ title: 'Nap', due: { date: '2026-10-22', time: '14:00' }, estimate_minutes: 20 })
    await createTask({ title: 'No time', due: { date: '2026-10-22' } })
    await createTask({ title: 'Tomorrow', due: { date: '2026-10-23', time: '09:00' } })
    const r = await render(<SidebarSchedule />)
    await waitFor(() => rows().length === 3, 'three rows ahead')
    expect(document.querySelector('[data-schedule-now]')!.textContent).toBe('Now 10:05')
    expect(rows().map((x) => x.textContent)).toEqual(['10:00Write, Now', '12:00Lunch, Work', '14:00Nap'])
    expect(rows()[0].hasAttribute('data-current')).toBe(true)
    expect(document.querySelector('[data-schedule-calendar]')!.textContent).toBe('Open the calendar')
    await r.unmount()
  })

  it('opens a task in the side panel, an event in its details, and the calendar from the link', async () => {
    localStorage.setItem('ot.sidebar.group.schedule', '1')
    await db.calendarSubscriptions.put(work)
    await db.calendarEvents.put(ev('lunch', 'Lunch', '12:00', '13:00'))
    await setMeta('calendar.events.window', { from: '2026-09-24', to: '2026-11-19', fetchedAt: Date.now() })
    const id = await createTask({ title: 'Write', due: { date: '2026-10-22', time: '11:00' } })
    const r = await render(<><SidebarSchedule /><PanelProbe /></>)
    await waitFor(() => rows().length === 2, 'two rows')
    await click(document.querySelector<HTMLElement>('[data-schedule-task]')!)
    await waitFor(() => document.querySelector('[data-probe]')!.getAttribute('data-probe') === id || parseRoute(location.pathname).view === 'task', 'the task open')
    await click(document.querySelector<HTMLElement>('[data-schedule-event]')!)
    await waitFor(() => !!document.querySelector('[role="dialog"]'), 'the event details')
    await click(document.querySelector<HTMLElement>('[data-schedule-calendar]')!)
    expect(parseRoute(location.pathname).view).toBe('day')
    await r.unmount()
  })

  it(`lists ${SCHEDULE_ROWS} items and counts the rest; says so when nothing is left today`, async () => {
    localStorage.setItem('ot.sidebar.group.schedule', '1')
    const r = await render(<SidebarSchedule />)
    await waitFor(() => !!document.querySelector('[data-schedule-empty]'), 'the empty line')
    expect(document.querySelector('[data-schedule-empty]')!.textContent).toBe('Nothing else scheduled today.')
    for (let h = 11; h < 11 + SCHEDULE_ROWS + 2; h++) await createTask({ title: `Task ${h}`, due: { date: '2026-10-22', time: `${h}:00` } })
    await waitFor(() => document.querySelector('[data-schedule-calendar]')!.textContent === '2 more today', 'the rest counted')
    expect(rows()).toHaveLength(SCHEDULE_ROWS)
    await r.unmount()
  })
})
