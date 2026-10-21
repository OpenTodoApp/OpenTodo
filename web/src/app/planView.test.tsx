// @vitest-environment happy-dom
// The calendar's Plan mode (OpenSpec change planner-view, tasks 2.1 and 3.2-4.1):
// route and range switch, two rows of seven columns, events and projections in the
// columns and the capacity bar, drag and keyboard moves that keep the time, viewers
// who cannot move, read-only projections, the keyboard model, the per-device span,
// the phone agenda, axe.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GRID_PREFS_META_KEY } from '../lib/calendar'
import { db, setMeta } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { click, flush, key, render, type } from '../ui/test-utils'
import { CalendarRangeSwitch } from './CalendarRange'
import { panelTaskId, resetPanel } from './panel'
import { PlanView } from './PlanView'
import { parseRoute, routePath } from './router'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // Monday 12 October 2026.
  vi.setSystemTime(new Date(2026, 9, 12, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  history.replaceState(null, '', '/plan')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetPanel()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean | Promise<boolean>, ms = 3000) {
  for (let t = 0; t < ms && !(await ok()); t += 20) await flush(20)
  expect(await ok()).toBe(true)
}
const day = (root: ParentNode, d: string) => root.querySelector<HTMLElement>(`[data-plan-day="${d}"]`)!
const row = (root: ParentNode, id: string) => root.querySelector<HTMLElement>(`[data-plan-task="${id}"]`)!
const plan = (detail: 'calm' | 'detailed' = 'calm', date?: string) => render(<PlanView date={date} detail={detail} />)

async function drag(el: Element, target: Element) {
  document.elementFromPoint = () => target
  await act(async () => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 }))
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 120 }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 120 }))
  })
}

describe('plan route and mode', () => {
  it('parses and prints /plan with an optional start date', () => {
    expect(parseRoute('/plan/2026-10-19')).toEqual({ view: 'plan', date: '2026-10-19' })
    expect(parseRoute('/plan')).toEqual({ view: 'plan' })
    expect(routePath({ view: 'plan', date: '2026-10-19' })).toBe('/plan/2026-10-19')
    expect(routePath({ view: 'plan' })).toBe('/plan')
  })

  it('is reached with g then Shift+C, a chord no other entry binds (g Shift+P is All projects)', async () => {
    const { SHORTCUTS } = await import('../lib/shortcuts')
    expect(SHORTCUTS.find((s) => s.id === 'go.plan')!.keys).toEqual(['g Shift+C'])
    expect(SHORTCUTS.filter((s) => s.keys.includes('g Shift+C')).map((s) => s.id)).toEqual(['go.plan'])
    expect(SHORTCUTS.find((s) => s.id === 'go.projects')!.keys).toEqual(['g Shift+P'])
    expect(SHORTCUTS.find((s) => s.id === 'go.triage')!.keys).toEqual(['g p'])
  })

  it('Range switch keeps the date, and /calendar opens the Plan after it was used last', async () => {
    const r = await plan('calm', '2026-11-05')
    await flush(30)
    expect(localStorage.getItem('ot.calendar.mode')).toBe('plan')
    expect(parseRoute('/calendar')).toEqual({ view: 'plan' })
    const sw = r.container.querySelector('[role="group"][aria-label="Calendar range"]')!
    expect(sw.querySelector('[aria-pressed="true"]')!.textContent).toBe('Plan')
    await click([...sw.querySelectorAll('button')].find((b) => b.textContent === 'Day')!)
    expect(location.pathname).toBe('/day/2026-11-05')
    await r.unmount()
    const w = await render(<CalendarRangeSwitch mode="week" date="2026-11-18" />)
    await click([...w.container.querySelectorAll('button')].find((b) => b.textContent === 'Plan')!)
    expect(location.pathname).toBe('/plan/2026-11-18')
    await w.unmount()
  })
})

describe('plan columns', () => {
  it('Fourteen days on a desktop: two rows of seven, today first, no horizontal scroller', async () => {
    await createTask({ title: 'Ship it', due: { date: '2026-10-14' }, estimate_minutes: 90, priority: 1 })
    const r = await plan()
    await waitFor(() => r.container.querySelector('[data-plan-task]') !== null)
    const rows = [...r.container.querySelectorAll('[data-plan-grid] > [role="row"]')].slice(1)
    expect(rows.map((w) => w.querySelectorAll('[role="gridcell"]').length)).toEqual([7, 7])
    expect(rows[0].querySelector('[role="gridcell"]')!.getAttribute('data-plan-day')).toBe('2026-10-12')
    expect(day(r.container, '2026-10-12').getAttribute('aria-current')).toBe('date')
    expect(r.container.querySelector('[data-plan-grid]')!.className).not.toMatch(/overflow-x|overflow-auto/)
    expect(r.container.querySelector('h1')!.textContent).toContain('Next 14 days')
    expect(day(r.container, '2026-10-14').querySelector('[data-capacity]')!.textContent).toBe('1h 30m / 8h')
    const axe = (await import('axe-core')).default
    for (const theme of ['light', 'dark']) {
      document.documentElement.dataset.theme = theme
      const res = await axe.run(r.container, { rules: { 'color-contrast': { enabled: false } } })
      expect(res.violations.map((v) => v.id)).toEqual([])
    }
    delete document.documentElement.dataset.theme
    await r.unmount()
  })

  it('Order within a column, with time, estimate and priority in Calm and Detailed rows', async () => {
    const d = '2026-10-13'
    await createTask({ title: 'Late', due: { date: d, time: '14:00' } })
    await createTask({ title: 'Early', due: { date: d, time: '09:00' }, estimate_minutes: 30 })
    await createTask({ title: 'Urgent', due: { date: d }, priority: 1 })
    await createTask({ title: 'Someday-ish', due: { date: d }, priority: 3 })
    let r = await plan('calm')
    await waitFor(() => day(r.container, d).querySelectorAll('[data-plan-task]').length === 4)
    const titles = () => [...day(r.container, d).querySelectorAll('[data-plan-task]')].map((b) => b.querySelector('.truncate')!.textContent)
    expect(titles()).toEqual(['Early', 'Late', 'Urgent', 'Someday-ish'])
    const p3 = () => day(r.container, d).querySelector('[data-priority="3"] [data-priority-dot]')!
    expect(p3().className).toContain('border-input')
    expect(day(r.container, d).querySelector('[data-estimate]')!.textContent).toBe('30m')
    await r.unmount()
    r = await plan('detailed')
    await waitFor(() => day(r.container, d).querySelectorAll('[data-plan-task]').length === 4)
    expect(p3().className).toContain('bg-p3')
    await r.unmount()
  })

  it('Zoned due on the viewer\'s day', async () => {
    const id = await createTask({ title: 'Call Tokyo', due: { date: '2026-10-14', time: '02:00', tz: 'Asia/Tokyo' } })
    const r = await plan()
    await waitFor(() => r.container.querySelector(`[data-plan-task="${id}"]`) !== null)
    // The tests run in UTC: 02:00 in Tokyo on the 14th is 17:00 on the 13th.
    expect(row(day(r.container, '2026-10-13'), id).querySelector('[data-plan-time]')!.textContent).toBe('17:00')
    await r.unmount()
  })

  it('Weekly report: the series on its day and two dimmed projections that count in their columns', async () => {
    await setMeta(GRID_PREFS_META_KEY, { planDays: 21 })
    const id = await createTask({ title: 'Weekly report', due: { date: '2026-10-12' }, recurrence: 'every monday', estimate_minutes: 45 })
    const r = await plan()
    await waitFor(() => r.container.querySelectorAll('[data-plan-projected]').length === 2)
    expect(row(day(r.container, '2026-10-12'), id)).toBeTruthy()
    for (const d of ['2026-10-19', '2026-10-26']) {
      const p = day(r.container, d).querySelector('[data-plan-projected]')!
      expect(p.textContent).toContain('projected')
      expect(p.className).toContain('text-faint')
      expect(p.querySelector('button')).toBeNull()
      expect(day(r.container, d).querySelector('[data-capacity]')!.textContent).toBe('45m / 8h')
    }
    expect(r.container.querySelectorAll('[data-plan-grid] > [role="row"]')).toHaveLength(4)
    await r.unmount()
  })
})

describe('events in the plan', () => {
  const sub = { id: 'sub1', name: 'Work', color: '#2563eb', enabled: true, lastSuccessAt: Date.now() }
  const sync = { id: 'ev1', subscriptionId: 'sub1', uid: 'u1', summary: 'Team sync', location: 'Room 4', start: { date: '2026-10-13', time: '10:00' }, end: { date: '2026-10-13', time: '11:00' }, allDay: false, free: false }

  async function seed(fetchedAt = Date.now()) {
    await db.calendarSubscriptions.put(sub)
    await db.calendarEvents.bulkPut([sync])
    await setMeta('calendar.events.window', { from: '2026-09-01', to: '2026-11-30', fetchedAt })
  }

  it('Meeting listed with the tasks and counted in the bar; Read with the keyboard', async () => {
    await seed()
    await createTask({ title: 'One', due: { date: '2026-10-13' }, estimate_minutes: 30 })
    await createTask({ title: 'Two', due: { date: '2026-10-13' } })
    const r = await plan()
    await waitFor(() => day(r.container, '2026-10-13').querySelector('[data-plan-event="ev1"]') !== null && day(r.container, '2026-10-13').querySelectorAll('[data-plan-task]').length === 2)
    const cell = day(r.container, '2026-10-13')
    const ev = cell.querySelector<HTMLButtonElement>('[data-plan-event="ev1"]')!
    // Named by its visible content, in reading order (WCAG 2.5.3 Label in Name).
    expect(ev.hasAttribute('aria-label')).toBe(false)
    expect(ev.textContent!.startsWith('10:00Team sync1h')).toBe(true)
    // Above the task rows.
    expect(ev.compareDocumentPosition(cell.querySelector('[data-plan-task]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(cell.querySelector('[data-capacity]')!.textContent).toBe('1h 30m / 8h')
    expect(cell.querySelector('[data-segment="events"]')).toBeTruthy()
    // Reachable with Tab, read-only: a drag writes nothing; Enter opens the details, Escape closes them.
    expect(ev.tabIndex).toBe(0)
    const before = await db.outbox.count()
    await drag(ev, day(r.container, '2026-10-15'))
    await flush(30)
    expect(await db.outbox.count()).toBe(before)
    ev.focus()
    await click(ev)
    await waitFor(() => document.querySelector('[data-event-details]') !== null)
    expect(document.querySelector('[data-event-details]')!.textContent).toContain('Room 4')
    await key(document.activeElement ?? document.body, 'Escape')
    await waitFor(() => document.querySelector('[data-event-details]') === null)

    // Calendars hidden: no rows, no event minutes.
    await click(r.container.querySelector('[data-calendars-toggle]')!)
    await waitFor(() => day(r.container, '2026-10-13').querySelector('[data-plan-event]') === null)
    expect(day(r.container, '2026-10-13').querySelector('[data-capacity]')!.textContent).toBe('30m / 8h')
    await r.unmount()
  })

  it('Open offline: the events fetched last time and "Calendars as of"', async () => {
    await seed(Date.now() - 60 * 60 * 1000)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const r = await plan()
    await waitFor(() => r.container.querySelector('[data-calendars-status]') !== null)
    expect(r.container.querySelector('[data-calendars-status]')!.textContent).toBe('Calendars as of 11:00')
    expect(r.container.querySelector('[data-plan-event="ev1"]')).toBeTruthy()
    await r.unmount()
  })
})

describe('rescheduling in the plan', () => {
  it('Drag keeps the time', async () => {
    const id = await createTask({ title: 'Call', due: { date: '2026-10-13', time: '14:30' } })
    const r = await plan()
    await waitFor(() => r.container.querySelector(`[data-plan-task="${id}"]`) !== null)
    await drag(row(r.container, id), day(r.container, '2026-10-22'))
    await waitFor(() => day(r.container, '2026-10-22').querySelector(`[data-plan-task="${id}"]`) !== null)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-22', time: '14:30' })
    await r.unmount()
  })

  it('Move a week offline: one due operation queued', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const id = await createTask({ title: 'Review', due: { date: '2026-10-14', time: '09:00' } })
    const r = await plan()
    await waitFor(() => r.container.querySelector(`[data-plan-task="${id}"]`) !== null)
    const before = await db.outbox.count()
    await click(row(r.container, id))
    await key(document.body, 'ArrowDown')
    await waitFor(async () => (await db.tasks.get(id))!.due?.date === '2026-10-21')
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-21', time: '09:00' })
    expect(await db.outbox.count()).toBe(before + 1)
    await waitFor(() => day(r.container, '2026-10-21').querySelector(`[data-plan-task="${id}"]`) !== null)
    await r.unmount()
  })

  it('Click selects: focus moving to the day keeps the task selected, and Right moves it a day', async () => {
    const id = await createTask({ title: 'Call the bank', due: { date: '2026-10-15', time: '11:00' } })
    const r = await plan()
    await waitFor(() => r.container.querySelector(`[data-plan-task="${id}"]`) !== null)
    // A real browser focuses the button on click; the grid then moves focus to the task's day.
    await act(async () => { row(r.container, id).focus() })
    await click(row(r.container, id))
    await waitFor(() => document.activeElement === day(r.container, '2026-10-15'))
    expect(row(r.container, id).getAttribute('aria-pressed')).toBe('true')
    await key(document.body, 'ArrowRight')
    await waitFor(async () => (await db.tasks.get(id))!.due?.date === '2026-10-16')
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-16', time: '11:00' })
    await r.unmount()
  })

  it('Viewer of a shared project: shown read-only, not dragged or moved', async () => {
    await db.projects.put({ id: 'shared', name: 'Shared', color: null, parent_id: null, position: 1, archived: false, deleted_at: null, _clock: {} } as never)
    await db.memberships.put({ projectId: 'shared', role: 'viewer', ownerId: 'someone', members: [] })
    const id = await createTask({ title: 'Theirs', due: { date: '2026-10-15' }, project_id: 'shared' })
    const r = await plan()
    await waitFor(() => r.container.querySelector(`[data-plan-task="${id}"]`) !== null)
    expect(row(r.container, id).textContent).toContain('read-only')
    expect(row(r.container, id).className).not.toContain('cursor-grab')
    await drag(row(r.container, id), day(r.container, '2026-10-16'))
    await click(row(r.container, id))
    await key(document.body, 'ArrowRight')
    await flush(50)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-15' })
    await r.unmount()
  })

  it('Moved past the span: the span moves a week with the task still selected', async () => {
    const id = await createTask({ title: 'Edge', due: { date: '2026-10-25' } })
    const r = await plan()
    await waitFor(() => r.container.querySelector(`[data-plan-task="${id}"]`) !== null)
    await click(row(r.container, id))
    await key(document.body, 'ArrowRight')
    await waitFor(() => location.pathname === '/plan/2026-10-19')
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-26' })
    await r.unmount()
    // The route renders the new span; the moved task is shown on the 26th.
    const again = await plan('calm', '2026-10-19')
    await waitFor(() => day(again.container, '2026-10-26')?.querySelector(`[data-plan-task="${id}"]`) !== null)
    await again.unmount()
  })

  it('Projection is read-only: no drag, j and k skip it', async () => {
    await setMeta(GRID_PREFS_META_KEY, { planDays: 21 })
    const series = await createTask({ title: 'Weekly report', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    const other = await createTask({ title: 'After', due: { date: '2026-10-27' } })
    const r = await plan()
    await waitFor(() => r.container.querySelectorAll('[data-plan-projected]').length === 2)
    const before = await db.outbox.count()
    await drag(r.container.querySelector('[data-plan-projected]')!, day(r.container, '2026-10-20'))
    await flush(30)
    expect(await db.outbox.count()).toBe(before)
    await key(document.body, 'j')
    expect(row(r.container, series).getAttribute('aria-pressed')).toBe('true')
    await key(document.body, 'j')
    expect(row(r.container, other).getAttribute('aria-pressed')).toBe('true')
    await r.unmount()
  })

  it('Projection follows the series: one due edit, projections from the new date', async () => {
    await setMeta(GRID_PREFS_META_KEY, { planDays: 21 })
    const id = await createTask({ title: 'Weekly report', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    const r = await plan()
    await waitFor(() => r.container.querySelectorAll('[data-plan-projected]').length === 2)
    const before = await db.outbox.count()
    await drag(row(r.container, id), day(r.container, '2026-10-13'))
    await waitFor(() => day(r.container, '2026-10-13').querySelector(`[data-plan-task="${id}"]`) !== null)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-13' })
    expect(await db.outbox.count()).toBe(before + 1)
    expect([...r.container.querySelectorAll('[data-plan-projected]')].map((p) => p.closest('[data-plan-day]')!.getAttribute('data-plan-day'))).toEqual(['2026-10-19', '2026-10-26'])
    await r.unmount()
  })

  it('Not reordered by hand: Alt+Up and a drop on its own column queue nothing', async () => {
    const a = await createTask({ title: 'A', due: { date: '2026-10-14' } })
    await createTask({ title: 'B', due: { date: '2026-10-14' } })
    const r = await plan()
    await waitFor(() => day(r.container, '2026-10-14').querySelectorAll('[data-plan-task]').length === 2)
    const before = await db.outbox.count()
    await drag(row(r.container, a), day(r.container, '2026-10-14'))
    await click(row(r.container, a))
    await key(document.body, 'ArrowUp', { altKey: true })
    await flush(50)
    expect(await db.outbox.count()).toBe(before)
    expect((await db.tasks.get(a))!.due).toEqual({ date: '2026-10-14' })
    await r.unmount()
  })
})

describe('keyboard in the plan', () => {
  it('Add on a day, then Select and open', async () => {
    await createTask({ title: 'First', due: { date: '2026-10-13' } })
    const second = await createTask({ title: 'Second', due: { date: '2026-10-16' } })
    const r = await plan()
    await waitFor(() => r.container.querySelectorAll('[data-plan-task]').length === 2)
    for (let i = 0; i < 3; i++) await key(document.body, 'ArrowRight')
    expect(day(r.container, '2026-10-15').getAttribute('aria-selected')).toBe('true')
    await key(document.body, 'q')
    await waitFor(() => document.querySelector('[role="dialog"] input') !== null)
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    await type(input, 'Dentist')
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => day(r.container, '2026-10-15').textContent!.includes('Dentist'))
    expect((await db.tasks.toArray()).find((t) => t.title === 'Dentist')!.due).toEqual({ date: '2026-10-15' })

    await key(document.body, 'j')
    await key(document.body, 'j')
    await key(document.body, 'j')
    await key(document.body, 'Enter')
    expect(panelTaskId()).toBe(second)
    await r.unmount()
  })

  it('Week back with [, and t brings the span back to today', async () => {
    const r = await plan()
    await flush(30)
    await key(document.body, '[')
    expect(location.pathname).toBe('/plan/2026-10-05')
    await key(document.body, 't')
    expect(location.pathname).toBe('/plan')
    await key(document.body, ']')
    expect(location.pathname).toBe('/plan/2026-10-19')
    await r.unmount()
  })

  it('Completing a task: the row leaves and the day\'s total drops', async () => {
    const id = await createTask({ title: 'Done soon', due: { date: '2026-10-13' }, estimate_minutes: 60 })
    await createTask({ title: 'Stays', due: { date: '2026-10-13' }, estimate_minutes: 30 })
    const r = await plan()
    await waitFor(() => day(r.container, '2026-10-13').querySelector('[data-capacity]')!.textContent === '1h 30m / 8h')
    await click(row(r.container, id))
    await key(document.body, 'c')
    await waitFor(() => r.container.querySelector(`[data-plan-task="${id}"]`) === null)
    expect(day(r.container, '2026-10-13').querySelector('[data-capacity]')!.textContent).toBe('30m / 8h')
    expect((await db.tasks.get(id))!.completed_at).toBeTruthy()
    await r.unmount()
  })
})

describe('span and phone', () => {
  it('Span kept on this device: 21 days from the menu, read back from the meta row', async () => {
    let r = await plan()
    await waitFor(() => r.container.querySelectorAll('[role="gridcell"]').length === 14)
    await click(r.container.querySelector('[data-page-header] button[aria-label="More actions"]')!)
    await flush(30)
    const item = [...document.querySelectorAll('[role="menuitemradio"], [role="menuitemcheckbox"], [role="menuitem"]')].find((e) => e.textContent?.includes('21 days'))!
    await click(item)
    await waitFor(() => r.container.querySelectorAll('[role="gridcell"]').length === 21)
    await r.unmount()
    r = await plan()
    await waitFor(() => r.container.querySelectorAll('[role="gridcell"]').length === 21)
    expect(r.container.querySelector('h1')!.textContent).toContain('Next 21 days')
    await r.unmount()
  })

  describe('below 640 px', () => {
    const original = window.matchMedia
    afterEach(() => { window.matchMedia = original })
    const phone = () => {
      window.matchMedia = ((q: string) => ({
        matches: Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? 0) <= 390, media: q, onchange: null,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
      })) as typeof window.matchMedia
    }

    it('Plan on a phone: every day listed, projected rows dimmed, no grid; Open a task from the agenda', async () => {
      phone()
      await createTask({ title: 'Weekly report', due: { date: '2026-10-12' }, recurrence: 'every monday', estimate_minutes: 45 })
      const id = await createTask({ title: 'Groceries', due: { date: '2026-10-14' } })
      const r = await plan()
      await waitFor(() => r.container.querySelector('[data-plan-agenda]') !== null && r.container.querySelector(`[data-plan-task="${id}"]`) !== null)
      expect(r.container.querySelector('[role="grid"]')).toBeNull()
      expect(r.container.querySelectorAll('[data-agenda-day]')).toHaveLength(14)
      const projected = r.container.querySelector('[data-agenda-day="2026-10-19"] [data-plan-projected]')!
      expect(projected.className).toContain('text-faint')
      expect(r.container.querySelector('[data-agenda-day="2026-10-19"] [data-capacity]')!.textContent).toBe('45m / 8h')
      await click(row(r.container, id))
      expect(panelTaskId()).toBeNull()
      await click(row(r.container, id))
      expect(panelTaskId()).toBe(id)
      const axe = (await import('axe-core')).default
      const res = await axe.run(r.container, { rules: { 'color-contrast': { enabled: false } } })
      expect(res.violations.map((v) => v.id)).toEqual([])
      await r.unmount()
    })
  })
})
