// @vitest-environment happy-dom
// Projected occurrences in Day, Week, Month and Plan (OpenSpec change
// series-occurrences, design D3 to D6): the spec's scenarios on local rows.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { occurrenceId } from '../lib/ids'
import { createTask, resetDeviceId, updateTask } from '../lib/ops'
import type { Task } from '../lib/types'
import { click, flush, minWidthPx, render, waitFor } from '../ui/test-utils'
import { CALENDAR_PROJECTIONS_KEY } from './calendar/projections'
import { CalendarView } from './CalendarView'
import { MonthView } from './MonthView'
import { panelOccupant, panelTaskId, resetPanel, setTaskSplit } from './panel'
import { PlanView } from './PlanView'
import { TaskDetail } from './task-detail/TaskDetail'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // Monday 12 October 2026.
  vi.setSystemTime(new Date(2026, 9, 12, 9, 0))
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: false, weekStart: 1 })
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
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  resetPanel()
})

const projectedIn = (root: ParentNode, date: string) => [...root.querySelectorAll(`[data-drop-day="${date}"] [data-projected], [data-drop-lane="${date}"] [data-projected]`)]

function row(over: Partial<Task>): Task {
  return {
    id: 'x', title: 'Habit', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
    created_at: 1, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null,
    assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...over,
  } as Task
}

describe('Projected occurrences in the calendar', () => {
  it('Weekday study sessions: an ordinary block on Monday, dashed projected blocks Tuesday to Friday, nothing written', async () => {
    const id = await createTask({ title: 'Study', due: { date: '2026-10-12', time: '18:00' }, recurrence: 'every weekday', estimate_minutes: 60 })
    const before = await db.outbox.count()
    const r = await render(<CalendarView mode="week" date="2026-10-12" />)
    await waitFor(() => projectedIn(r.container, '2026-10-16').length === 1, 'Friday\'s projection')
    expect(r.container.querySelector(`[data-drop-day="2026-10-12"] [data-block="${id}"]`)).toBeTruthy()
    expect(projectedIn(r.container, '2026-10-12')).toHaveLength(0)
    for (const d of ['13', '14', '15', '16']) {
      const p = projectedIn(r.container, `2026-10-${d}`)
      expect(p).toHaveLength(1)
      expect(p[0].className).toContain('ui-block--projected')
      // At 18:00, as tall as the hour: the series' own block's place.
      expect((p[0] as HTMLElement).style.top).toBe((r.container.querySelector(`[data-block="${id}"]`) as HTMLElement).style.top)
      expect((p[0] as HTMLElement).style.height).toBe((r.container.querySelector(`[data-block="${id}"]`) as HTMLElement).style.height)
      expect(p[0].textContent).toContain('Study, repeating, projected')
    }
    // No projection on the weekend, and none is ever written.
    expect(projectedIn(r.container, '2026-10-17')).toHaveLength(0)
    expect(await db.outbox.count()).toBe(before)
    await r.unmount()
  })

  it('End condition: every day for 5 times with three done records draws one projection, tomorrow', async () => {
    const series = row({ id: 's5', title: 'Course', recurrence: 'every day for 5 times', due: { date: '2026-10-12', time: '08:00' } })
    const records = ['09', '10', '11'].map((d) => row({ id: occurrenceId('s5', `2026-10-${d}`), series_id: 's5', title: 'Course', due: { date: `2026-10-${d}` }, completed_at: 1 }))
    await db.tasks.bulkPut([series, ...records])
    const r = await render(<CalendarView mode="week" date="2026-10-12" />)
    await waitFor(() => projectedIn(r.container, '2026-10-13').length === 1, 'tomorrow\'s projection')
    expect(r.container.querySelectorAll('[data-projected]')).toHaveLength(1)
    await r.unmount()
  })

  it('a date-only series is a chip in the lane and its estimate joins the capacity with "45m repeating"', async () => {
    await createTask({ title: 'Weekly report', due: { date: '2026-10-12' }, recurrence: 'every monday', estimate_minutes: 45 })
    const r = await render(<CalendarView mode="week" date="2026-10-19" />)
    await waitFor(() => projectedIn(r.container, '2026-10-19').length === 1, 'next Monday\'s projection')
    expect(r.container.querySelector('[data-drop-lane="2026-10-19"] [data-projected]')).toBeTruthy()
    expect(r.container.querySelector('[data-day-header="2026-10-19"] [data-capacity]')!.textContent).toContain('45m / 8h')
    expect(r.container.querySelector('[data-day-header="2026-10-20"] [data-capacity]')!.textContent).toContain('0m / 8h')
    await r.unmount()
  })

  it('Switch off on this device: Day, Week and Month show the series once, the capacity drops it, Plan still projects', async () => {
    await createTask({ title: 'Weekly report', due: { date: '2026-10-12' }, recurrence: 'every monday', estimate_minutes: 45 })
    let r = await render(<CalendarView mode="week" date="2026-10-19" />)
    await waitFor(() => projectedIn(r.container, '2026-10-19').length === 1)
    await click(r.container.querySelector('[data-page-header] button[aria-label="More actions"]')!)
    await waitFor(() => document.querySelector('[data-projections-toggle="calendar"]') !== null, 'the menu item')
    const item = document.querySelector('[data-projections-toggle="calendar"]')!
    expect(item.getAttribute('aria-checked')).toBe('true')
    await click(item)
    await waitFor(() => r.container.querySelector('[data-projected]') === null, 'projections hidden')
    expect(localStorage.getItem(CALENDAR_PROJECTIONS_KEY)).toBe('0')
    expect(r.container.querySelector('[data-day-header="2026-10-19"] [data-capacity]')!.textContent).toContain('0m / 8h')
    await r.unmount()

    // A reload keeps the device's choice.
    r = await render(<CalendarView mode="week" date="2026-10-19" />)
    await waitFor(() => r.container.querySelector('[data-day-header="2026-10-19"]') !== null)
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- proves that nothing appears, and no event marks "nothing drawn"
    await flush(30)
    expect(r.container.querySelector('[data-projected]')).toBeNull()
    await r.unmount()
    r = await render(<MonthView date="2026-10-12" />)
    await waitFor(() => r.container.querySelector('[data-month-task]') !== null)
    expect(r.container.querySelector('[data-projected]')).toBeNull()
    await r.unmount()
    r = await render(<PlanView date="2026-10-12" />)
    await waitFor(() => r.container.querySelector('[data-plan-projected]') !== null, 'Plan keeps its projections')
    await r.unmount()
  })

  it('Open from the keyboard: Enter on a projected block opens the series with the projected date named; dragging writes nothing', async () => {
    const id = await createTask({ title: 'Study', due: { date: '2026-10-12', time: '18:00' }, recurrence: 'every weekday', estimate_minutes: 60 })
    const r = await render(<CalendarView mode="week" date="2026-10-12" />)
    await waitFor(() => projectedIn(r.container, '2026-10-15').length === 1)
    const block = projectedIn(r.container, '2026-10-15')[0] as HTMLButtonElement
    // Tab reaches it (a button in the reading order); j and k skip it: the keyboard order holds tasks only.
    expect(block.tagName).toBe('BUTTON')
    expect(block.tabIndex).toBe(0)
    const before = await db.outbox.count()
    block.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 10 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 300 }))
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: 300 }))
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- it proves that nothing is written, and no event marks "no write"
    await flush(30)
    expect(await db.outbox.count()).toBe(before)

    const done = setTaskSplit(true)
    block.focus()
    await click(block)
    await waitFor(() => panelTaskId() === id, 'the series in the panel')
    expect(panelOccupant()).toMatchObject({ kind: 'task', id })
    const detail = await render(<TaskDetail taskId={id} userId="u" projects={[]} labelMap={new Map()} onClose={() => {}} />)
    await waitFor(() => detail.container.querySelector('[data-projected-for]') !== null, 'the projected line')
    expect(detail.container.querySelector('[data-projected-for]')!.textContent).toBe('Projected for Thursday 15 October · next due Monday 12 October')
    await detail.unmount()
    done()
    await r.unmount()
  })

  it('Phone week: following days list the daily series as dimmed rows after their tasks, without overflow', async () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({
      matches: minWidthPx(q) <= 390, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    try {
      await createTask({ title: 'Stretch', due: { date: '2026-10-12', time: '07:00' }, recurrence: 'every day' })
      await createTask({ title: 'Dentist', due: { date: '2026-10-14', time: '10:00' } })
      const r = await render(<CalendarView mode="week" date="2026-10-12" />)
      await waitFor(() => r.container.querySelectorAll('[data-week-agenda] [data-projected]').length === 6, 'six projected rows')
      const wed = r.container.querySelector('[data-agenda-day="2026-10-14"]')!
      const items = [...wed.querySelectorAll('[data-agenda-task], [data-projected]')]
      expect(items.map((e) => (e.hasAttribute('data-projected') ? 'projected' : 'task'))).toEqual(['task', 'projected'])
      expect(items[1].querySelector('svg')).toBeTruthy()
      expect(r.container.querySelector('[data-agenda-day="2026-10-12"] [data-projected]')).toBeNull()
      // Rows wrap within their width: nothing sets a width wider than the agenda.
      for (const el of r.container.querySelectorAll<HTMLElement>('[data-week-agenda] [data-projected]')) expect(el.className).toContain('w-full')
      await r.unmount()
    } finally {
      window.matchMedia = original
    }
  })
})

describe('Projected occurrences in the Month', () => {
  it('A habit on the month: the 14th lists the habit, every later Monday, Wednesday and Friday of the grid a projected row', async () => {
    const id = await createTask({ title: 'Swim', due: { date: '2026-10-14' }, recurrence: 'every mon, wed, fri' })
    await updateTask(id, { habit: true })
    const r = await render(<MonthView date="2026-10-12" />)
    await waitFor(() => r.container.querySelector('[data-month-day="2026-11-08"]') !== null && r.container.querySelectorAll('[data-month-grid] [data-projected]').length > 0)
    expect(r.container.querySelector('[data-month-day="2026-10-14"] [data-month-task]')).toBeTruthy()
    const days = [...r.container.querySelectorAll('[data-month-grid] [data-projected]')].map((e) => e.closest('[data-month-day]')!.getAttribute('data-month-day'))
    expect(days).toEqual(['2026-10-16', '2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-04', '2026-11-06'])
    await r.unmount()
  })

  it('at 360 px the grid counts tasks only and the day list shows the projections under the tasks', async () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({
      matches: q.includes('max-width: 39.99rem') ? true : minWidthPx(q) <= 360, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    try {
      await createTask({ title: 'Stretch', due: { date: '2026-10-12' }, recurrence: 'every day' })
      const r = await render(<MonthView date="2026-10-12" />)
      await waitFor(() => r.container.querySelector('[data-month-count]') !== null)
      // One task on the 12th; the projections of the 13th on are not counted.
      expect([...r.container.querySelectorAll('[data-month-count]')].map((e) => e.textContent)).toEqual(['1'])
      await click(r.container.querySelector('[data-month-day="2026-10-13"]')!)
      await waitFor(() => r.container.querySelector('[data-month-day-list] [data-projected]') !== null, 'the day list\'s projection')
      expect(r.container.querySelector('[data-month-day-list] [data-projected]')!.textContent).toContain('Stretch')
      await r.unmount()
    } finally {
      window.matchMedia = original
    }
  })
})
