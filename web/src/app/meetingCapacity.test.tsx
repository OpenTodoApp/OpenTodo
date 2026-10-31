// @vitest-environment happy-dom
// Meetings in the day's capacity (OpenSpec change meeting-aware-capacity, tasks 2.2 to
// 2.4): with "Count meetings in capacity" on, Day, Week and Month add the busy event
// minutes they draw, say "Over with meetings" in the warning tone, count nothing while
// the Calendars toggle hides events, and the Settings row exists only with a calendar.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GRID_PREFS_META_KEY } from '../lib/calendar'
import { db, getMeta, setMeta } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import type { CalendarEvent } from '../lib/types'
import { click, render, waitFor } from '../ui/test-utils'
import { CalendarSettingsSection } from './CalendarSettings'
import { CalendarView } from './CalendarView'
import { MonthView } from './MonthView'
import { resetPanel } from './panel'

const DAY = '2026-10-14'
const sub = { id: 'sub1', name: 'Work', color: '#2563eb', enabled: true, lastSuccessAt: 0 }
const ev = (id: string, date: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, subscriptionId: 'sub1', uid: id, summary: id, location: '', start: { date, time: start }, end: { date, time: end }, allDay: false, free: false, ...extra,
})

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetPanel()
})

async function seed(events: CalendarEvent[], { count = true, window = { from: '2026-09-01', to: '2026-11-30' } } = {}) {
  await db.calendarSubscriptions.put(sub)
  await db.calendarEvents.bulkPut(events)
  await setMeta('calendar.events.window', { ...window, fetchedAt: Date.now() })
  await setMeta(GRID_PREFS_META_KEY, { startHour: 6, endHour: 22, dayLength: 480, planDays: 14, countEvents: count })
}

const capacity = (root: ParentNode) => root.querySelector<HTMLElement>(`[data-day-header="${DAY}"] [data-capacity]`)

async function tooltipOf(el: HTMLElement): Promise<string> {
  el.focus()
  await waitFor(() => !!document.querySelector('[data-tooltip]'), 'the capacity tooltip')
  return document.querySelector('[data-tooltip]')!.textContent ?? ''
}

describe('Day and Week', () => {
  const meetings = [
    ev('standup', DAY, '09:00', '10:30'),
    ev('review', DAY, '14:00', '15:00'),
    ev('focus', DAY, '16:00', '18:00', { free: true }),
    { ...ev('offsite', DAY, '', ''), allDay: true, start: { date: DAY }, end: { date: '2026-10-15' } },
  ]

  it('adds busy, timed meetings to the line and names both parts in the tooltip', async () => {
    await seed(meetings)
    await createTask({ title: 'Write report', due: { date: DAY }, estimate_minutes: 195 })
    await createTask({ title: 'Call Ana', due: { date: DAY, time: '11:00' }, estimate_minutes: 60 })
    await createTask({ title: 'Water plants', due: { date: DAY } })
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => capacity(r.container)?.textContent?.startsWith('6h 45m / 8h') ?? false, 'tasks and meetings summed')
    const line = capacity(r.container)!
    expect(line.hasAttribute('data-over')).toBe(false)
    expect(line.hasAttribute('data-over-meetings')).toBe(false)
    expect(line.className).toContain('text-muted')
    expect(await tooltipOf(line)).toBe('4h 15m of tasks, 2h 30m in meetings · 1 task without estimate')
    await r.unmount()
  })

  it('over only with meetings is the warning tone and is said, over by tasks stays danger', async () => {
    await seed([ev('a', DAY, '09:00', '12:00')])
    const id = await createTask({ title: 'Deep work', due: { date: DAY }, estimate_minutes: 360 })
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => capacity(r.container)?.hasAttribute('data-over-meetings') ?? false, 'over with meetings')
    const line = capacity(r.container)!
    expect(line.textContent).toContain('9h / 8h')
    expect(line.textContent).toContain('over with meetings')
    expect(line.className).toContain('text-on-warning-soft')
    expect(line.hasAttribute('data-over')).toBe(false)
    expect(await tooltipOf(line)).toBe('Over with meetings. 6h of tasks, 3h in meetings')
    line.blur()

    await db.tasks.update(id, { estimate_minutes: 540 })
    await waitFor(() => capacity(r.container)?.hasAttribute('data-over') ?? false, 'over by tasks')
    expect(capacity(r.container)!.textContent).toContain('12h / 8h')
    expect(capacity(r.container)!.textContent).toContain('over capacity')
    expect(capacity(r.container)!.className).toContain('text-danger')
    await r.unmount()
  })

  it('counts nothing while the option is off or the Calendars toggle hides events', async () => {
    await seed([ev('a', DAY, '09:00', '12:00')], { count: false })
    await createTask({ title: 'Deep work', due: { date: DAY }, estimate_minutes: 360 })
    let r = await render(<CalendarView mode="day" />)
    await waitFor(() => r.container.querySelector('[data-event="a"]') !== null, 'the event drawn')
    await waitFor(() => capacity(r.container)?.textContent?.startsWith('6h / 8h') ?? false, 'tasks only')
    await r.unmount()

    await seed([ev('a', DAY, '09:00', '12:00')])
    await setMeta('calendar.showEvents', false)
    r = await render(<CalendarView mode="day" />)
    await waitFor(() => r.container.querySelector('[data-calendars-toggle]')?.getAttribute('aria-pressed') === 'false', 'calendars hidden')
    await waitFor(() => capacity(r.container)?.textContent?.startsWith('6h / 8h') ?? false, 'tasks only, calendars hidden')
    expect(await tooltipOf(capacity(r.container)!)).toBe('Planned estimates against a 8h day')
    await r.unmount()
  })

  it('offline outside the cache: no event minutes, and the tooltip says so', async () => {
    await seed([], { window: { from: '2026-12-01', to: '2026-12-31' } })
    await createTask({ title: 'Deep work', due: { date: DAY }, estimate_minutes: 60 })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => r.container.querySelector('[data-calendars-status]') !== null, 'the offline status')
    await waitFor(() => capacity(r.container)?.textContent?.startsWith('1h / 8h') ?? false, 'the task counted')
    expect(await tooltipOf(capacity(r.container)!)).toBe('1h of tasks · Calendars unavailable offline for this day')
    await r.unmount()
  })
})

describe('Month', () => {
  const cell = (root: ParentNode, d: string) => root.querySelector<HTMLElement>(`[data-month-day="${d}"]`)!

  it('shows a meeting-only day, and over with meetings in the warning tone', async () => {
    await seed([ev('a', '2026-10-12', '09:00', '12:00'), ev('b', '2026-10-15', '13:00', '16:00')])
    await createTask({ title: 'Deep work', due: { date: '2026-10-15' }, estimate_minutes: 360 })
    const r = await render(<MonthView date={DAY} />)
    await waitFor(() => cell(r.container, '2026-10-12')?.querySelector('[data-capacity]') !== null, 'the meeting-only day')
    expect(cell(r.container, '2026-10-12').querySelector('[data-capacity]')!.textContent).toBe('3h / 8h')
    const over = cell(r.container, '2026-10-15')
    await waitFor(() => over.querySelector('[data-over-meetings]') !== null, 'over with meetings')
    expect(over.querySelector('[data-capacity]')!.textContent).toBe('9h / 8h')
    expect(over.querySelector('.sr-only')!.textContent).toContain('over with meetings')
    // A day with neither keeps no line.
    expect(cell(r.container, '2026-10-13').querySelector('[data-capacity]')).toBeNull()
    await r.unmount()
  })

  it('with the option off, a meeting-only day has no line', async () => {
    await seed([ev('a', '2026-10-12', '09:00', '12:00')], { count: false })
    await createTask({ title: 'Estimated', due: { date: '2026-10-13' }, estimate_minutes: 60 })
    const r = await render(<MonthView date={DAY} />)
    await waitFor(() => cell(r.container, '2026-10-13')?.querySelector('[data-capacity]') !== null, 'the estimated day')
    expect(cell(r.container, '2026-10-12').querySelector('[data-capacity]')).toBeNull()
    await r.unmount()
  })
})

describe('Settings › Calendar', () => {
  it('offers the option only with a calendar, and toggling writes device meta, never an op', async () => {
    let r = await render(<CalendarSettingsSection />)
    await waitFor(() => r.container.querySelector('#day-length') !== null, 'the section')
    expect(r.container.querySelector('[data-count-events-switch]')).toBeNull()
    await r.unmount()

    await db.calendarSubscriptions.put(sub)
    r = await render(<CalendarSettingsSection />)
    await waitFor(() => r.container.querySelector('[data-count-events-switch]') !== null, 'the row')
    const sw = r.container.querySelector<HTMLButtonElement>('[data-count-events-switch] [role="switch"]')!
    expect(sw.getAttribute('aria-checked')).toBe('false')
    const outbox = await db.outbox.count()
    await click(sw)
    await waitFor(async () => (await getMeta<{ countEvents?: boolean } | null>(GRID_PREFS_META_KEY, null))?.countEvents === true, 'stored on the device')
    expect(await db.outbox.count()).toBe(outbox)
    await waitFor(() => sw.getAttribute('aria-checked') === 'true', 'the switch on')
    await r.unmount()
  })
})
