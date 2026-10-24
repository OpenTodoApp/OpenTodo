// @vitest-environment happy-dom
// Calendar is one destination (OpenSpec change ux-overhaul, time-blocking "Day
// and Week calendar views"): it remembers Day or Week per device, renders through
// the page template, and its planning list lives in the shell's panel slot.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCalendarMode } from '../lib/calendarMode'
import { db, setMeta } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { click, flush, key, render, minWidthPx } from '../ui/test-utils'
import { CalendarView } from './CalendarView'
import { panelOccupant, resetPanel } from './panel'
import { PanelHost } from './PanelHost'
import { parseRoute } from './router'

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
  resetPanel()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

describe('one Calendar destination', () => {
  it('remembers Day or Week for /calendar and renders the range controls in the page header', async () => {
    const r = await render(<CalendarView mode="week" />)
    await flush(50)
    expect(localStorage.getItem('ot.calendar.mode')).toBe('week')
    expect(readCalendarMode()).toBe('week')
    expect(parseRoute('/calendar')).toEqual({ view: 'week' })
    expect(r.container.querySelector('[data-calendar-page="week"]')).toBeTruthy()

    const header = r.container.querySelector('[data-page-header]')!
    expect(header).toBeTruthy()
    expect(r.container.querySelectorAll('h1')).toHaveLength(1)
    expect(header.querySelector('[role="group"][aria-label="Range"]')).toBeTruthy()
    expect(header.querySelector('[role="group"][aria-label="Calendar range"] [aria-pressed="true"]')?.textContent).toBe('Week')
    expect(header.querySelector('[data-help-screen="calendar"]')).toBeTruthy()

    await r.rerender(<CalendarView mode="day" />)
    await flush(20)
    expect(readCalendarMode()).toBe('day')
    expect(parseRoute('/calendar')).toEqual({ view: 'day' })
    await r.unmount()
  })

  it('Plan from a list opens the planning list in the panel slot, with a menu for its source', async () => {
    await createTask({ title: 'Renew passport' })
    const home = await createProject({ name: 'Home' })
    await createTask({ title: 'Paint the fence', project_id: home })
    const r = await render(<><CalendarView mode="day" /><PanelHost /></>)
    await flush(50)
    expect(document.querySelector('[data-panel-frame]')).toBeNull()

    await click(r.container.querySelector('[data-page-header] button[aria-label="More actions"]')!)
    await flush(30)
    const plan = [...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent?.includes('Plan from a list'))!
    expect(plan).toBeTruthy()
    await click(plan)
    await flush(30)
    expect(panelOccupant()).toMatchObject({ kind: 'custom', key: 'calendar-plan' })
    await waitFor(() => document.querySelector('[data-panel-frame="calendar-plan"] [data-tray-task]') !== null)
    const frame = document.querySelector('[data-panel-frame="calendar-plan"]')!
    // Inbox is the default source; the picker is a design-system menu.
    expect([...frame.querySelectorAll('[data-tray-task]')].map((b) => b.textContent)).toEqual(['Renew passport'])
    const source = frame.querySelector('button[aria-label="Plan from"]')!
    expect(source.textContent).toContain('Inbox')
    await click(source)
    await flush(30)
    await click([...document.querySelectorAll('[role="menuitemcheckbox"]')].find((e) => e.textContent?.trim() === 'Home')!)
    await waitFor(() => [...frame.querySelectorAll('[data-tray-task]')].map((b) => b.textContent).join() === 'Paint the fence')
    expect(localStorage.getItem('opentodo.calendar.tray')).toBe(`project:${home}`)

    // Escape empties the slot; the menu item reads "Plan from a list" again.
    await key(document.body, 'Escape')
    await waitFor(() => panelOccupant() === null)
    expect(document.querySelector('[data-panel-frame]')).toBeNull()
    await r.unmount()
  })
})

// Subscribed calendars in Day and Week (OpenSpec change calendar-feeds, tasks 6.2
// and 6.3): events share lanes and the overlap marker with task blocks, never count
// toward capacity, are read-only, and hide with a per-device toolbar toggle.
describe('calendar events', () => {
  const sub = { id: 'sub1', name: 'Work', color: '#2563eb', enabled: true, lastSuccessAt: Date.now() }
  const sync = { id: 'ev1', subscriptionId: 'sub1', uid: 'u1', summary: 'Team sync', location: 'Room 4', start: { date: '2026-10-14', time: '10:00' }, end: { date: '2026-10-14', time: '11:00' }, allDay: false, free: false }
  const offsite = { id: 'ev2', subscriptionId: 'sub1', uid: 'u2', summary: 'Offsite', location: '', start: { date: '2026-10-14' }, end: { date: '2026-10-16' }, allDay: true, free: false }

  async function seed(fetchedAt = Date.now(), window = { from: '2026-09-01', to: '2026-11-30' }) {
    await db.calendarSubscriptions.put(sub)
    await db.calendarEvents.bulkPut([sync, offsite])
    await setMeta('calendar.events.window', { ...window, fetchedAt })
  }

  it('lays out an event next to a task with the overlap marker, without counting it', async () => {
    await seed()
    await createTask({ title: 'Call Ana', due: { date: '2026-10-14', time: '10:30' }, estimate_minutes: 30 })
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => r.container.querySelector('[data-event="ev1"]') !== null && r.container.querySelector('[data-block]') !== null)
    const ev = r.container.querySelector('[data-event="ev1"]')!
    expect(ev.hasAttribute('data-overlap')).toBe(true)
    expect(r.container.querySelector('[data-block]')!.hasAttribute('data-overlap')).toBe(true)
    expect(ev.getAttribute('aria-label')).toBe('Team sync, 10:00 to 11:00, Room 4, Work')
    expect(r.container.querySelector('[data-capacity]')!.textContent).toContain('30m / 8h')
    // The all-day strip shows the two-day event on this day.
    expect(r.container.querySelector('[data-all-day="2026-10-14"] [data-event-chip="ev2"]')?.textContent).toBe('Offsite')
    await r.unmount()
  })

  it('is read-only: dragging writes nothing, Tab reaches it and Enter opens the details', async () => {
    await seed()
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => r.container.querySelector('[data-event="ev1"]') !== null)
    const before = await db.outbox.count()
    const ev = r.container.querySelector<HTMLButtonElement>('[data-event="ev1"]')!
    ev.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 10 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 200 }))
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: 200 }))
    await flush(30)
    expect(await db.outbox.count()).toBe(before)
    expect(ev.tabIndex).toBe(0)
    ev.focus()
    await click(ev)
    await waitFor(() => document.querySelector('[data-event-details]') !== null)
    expect(document.querySelector('[data-event-details]')!.textContent).toContain('Room 4')
    await key(document.activeElement ?? document.body, 'Escape')
    await waitFor(() => document.querySelector('[data-event-details]') === null)

    const axe = (await import('axe-core')).default
    for (const theme of ['light', 'dark']) {
      document.documentElement.dataset.theme = theme
      const res = await axe.run(r.container, { rules: { 'color-contrast': { enabled: false } } })
      expect(res.violations.map((v) => v.id)).toEqual([])
    }
    delete document.documentElement.dataset.theme
    await r.unmount()
  })

  it('the Calendars toggle hides events on this device and survives a reload of the view', async () => {
    await seed()
    let r = await render(<CalendarView mode="day" />)
    await waitFor(() => r.container.querySelector('[data-event="ev1"]') !== null)
    const toggle = r.container.querySelector('[data-calendars-toggle]')!
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    await click(toggle)
    await waitFor(() => r.container.querySelector('[data-event="ev1"]') === null)
    expect(r.container.querySelector('[data-event-chip]')).toBeNull()
    await r.unmount()
    r = await render(<CalendarView mode="day" />)
    await waitFor(() => r.container.querySelector('[data-calendars-toggle]')?.getAttribute('aria-pressed') === 'false')
    expect(r.container.querySelector('[data-event="ev1"]')).toBeNull()
    await r.unmount()
  })

  it('says how old the cache is, and when days are outside it offline', async () => {
    await seed(Date.now() - 60 * 60 * 1000)
    let r = await render(<CalendarView mode="day" />)
    await waitFor(() => r.container.querySelector('[data-calendars-status]') !== null)
    expect(r.container.querySelector('[data-calendars-status]')!.textContent).toBe('Calendars as of 11:00')
    expect(r.container.querySelector('[data-event="ev1"]')).toBeTruthy()
    await r.unmount()

    await setMeta('calendar.events.window', { from: '2026-12-01', to: '2026-12-31', fetchedAt: Date.now() })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    r = await render(<CalendarView mode="day" />)
    await waitFor(() => r.container.querySelector('[data-calendars-status]') !== null)
    expect(r.container.querySelector('[data-calendars-status]')!.textContent).toBe('Calendars unavailable offline for these days')
    vi.restoreAllMocks()
    await r.unmount()
  })
})

describe('Week on a phone (ux-overhaul, time-blocking "Week on a phone")', () => {
  const original = window.matchMedia
  afterEach(() => { window.matchMedia = original })
  it('lists the days vertically with their tasks and renders no seven-column grid below 640 px', async () => {
    window.matchMedia = ((q: string) => ({
      matches: minWidthPx(q) <= 390, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    await createTask({ title: 'Timed one', due: { date: '2026-10-15', time: '09:30' }, estimate_minutes: 30 })
    await createTask({ title: 'Loose one', due: { date: '2026-10-15' } })
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => !!r.container.querySelector('[data-week-agenda]') && r.container.querySelectorAll('[data-agenda-task]').length === 2)
    expect(r.container.querySelectorAll('[data-agenda-day]')).toHaveLength(7)
    expect(r.container.querySelector('[data-drop-day]')).toBeNull()
    const rows = [...r.container.querySelectorAll('[data-agenda-day="2026-10-15"] [data-agenda-task]')].map((b) => b.textContent)
    expect(rows[0]).toContain('all day')
    expect(rows[0]).toContain('Loose one')
    expect(rows[1]).toContain('Timed one')
    expect(rows[1]).toMatch(/9:30|09:30/)
    // Tapping selects, Enter opens the task as its page.
    const timed = r.container.querySelector<HTMLButtonElement>('[data-agenda-day="2026-10-15"] [data-agenda-task]:last-child')!
    await click(timed)
    expect(timed.className).toContain('ring-accent')
    await key(timed, 'Enter')
    await waitFor(() => location.pathname.startsWith('/task/'))
    await r.unmount()
  })
})

describe('surfaces (surfaces-v2, time-blocking "Filled blocks")', () => {
  it('dims blocks and lane rows of days before today, and a past block still moves with the arrows', async () => {
    const past = await createTask({ title: 'Yesterday call', due: { date: '2026-10-13', time: '10:00' }, estimate_minutes: 30 })
    const now = await createTask({ title: 'Today call', due: { date: '2026-10-14', time: '10:00' }, estimate_minutes: 30 })
    const loose = await createTask({ title: 'Yesterday loose', due: { date: '2026-10-13' } })
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => r.container.querySelector(`[data-block="${past}"]`) !== null && r.container.querySelector(`[data-lane-task="${loose}"]`) !== null)
    const block = r.container.querySelector<HTMLElement>(`[data-block="${past}"]`)!
    expect(block.className).toContain('ui-block')
    expect(block.className).toContain('ui-block--past')
    expect(r.container.querySelector(`[data-block="${now}"]`)!.className).not.toContain('ui-block--past')
    expect(r.container.querySelector(`[data-lane-task="${loose}"]`)!.className).toContain('ui-block--past')
    // Dimmed is not disabled: the selected past block moves fifteen minutes with Down.
    await click(block)
    await key(document.body, 'ArrowDown')
    for (let i = 0; i < 50 && (await db.tasks.get(past))!.due?.time !== '10:15'; i++) await flush(20)
    expect((await db.tasks.get(past))!.due).toEqual({ date: '2026-10-13', time: '10:15' })
    await r.unmount()
  })

  it('shows three all-day events then "+2"; expanding shows all five, survives a reload and leaves other days alone', async () => {
    await db.calendarSubscriptions.put({ id: 'sub1', name: 'Work', color: '#2563eb', enabled: true, lastSuccessAt: Date.now() })
    const allDay = (i: number, date: string) => ({ id: `ad${date}${i}`, subscriptionId: 'sub1', uid: `u${date}${i}`, summary: `Holiday ${i}`, location: '', start: { date }, end: { date: date === '2026-10-15' ? '2026-10-16' : '2026-10-17' }, allDay: true, free: false })
    await db.calendarEvents.bulkPut([...[0, 1, 2, 3, 4].map((i) => allDay(i, '2026-10-15')), ...[0, 1, 2, 3].map((i) => allDay(i, '2026-10-16'))])
    await setMeta('calendar.events.window', { from: '2026-09-01', to: '2026-11-30', fetchedAt: Date.now() })
    const chips = (root: ParentNode, d: string) => root.querySelectorAll(`[data-all-day="${d}"] [data-event-chip]`).length
    let r = await render(<CalendarView mode="week" />)
    await waitFor(() => chips(r.container, '2026-10-15') === 3)
    expect(r.container.querySelector('[data-all-day-more="2026-10-15"]')!.textContent).toBe('+2')
    await click(r.container.querySelector('[data-all-day-more="2026-10-15"]')!)
    await waitFor(() => chips(r.container, '2026-10-15') === 5)
    expect(r.container.querySelector('[data-all-day-more="2026-10-15"]')!.getAttribute('aria-expanded')).toBe('true')
    // The sixteenth keeps its own cap.
    expect(chips(r.container, '2026-10-16')).toBe(3)
    await r.unmount()
    r = await render(<CalendarView mode="week" />)
    await waitFor(() => chips(r.container, '2026-10-15') === 5)
    expect(chips(r.container, '2026-10-16')).toBe(3)
    await r.unmount()
  })

  it('the Week draws one now line, in today\'s column', async () => {
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => r.container.querySelector('[data-now-line]') !== null)
    const lines = r.container.querySelectorAll('[data-now-line]')
    expect(lines).toHaveLength(1)
    expect(lines[0].closest('[data-drop-day]')!.getAttribute('data-drop-day')).toBe('2026-10-14')
    await r.unmount()
  })
})
