// @vitest-environment happy-dom
// Spans in the calendar (OpenSpec change multi-day-tasks, tasks 3.1-3.4, 4.1-4.3, 5.2):
// one bar across Week, the day's piece in Day with its position and its due time, never
// a block on the grid; bars across Month's week rows; Plan's columns; capacity on the
// due day; moving and resizing by pointer and keyboard, each one change; viewers; the
// phone's Week agenda.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { getTask } from '../lib/localData'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { click, flush, key, render, waitFor } from '../ui/test-utils'
import { useBulkToast } from './bulk/toastStore'
import { CalendarView } from './CalendarView'
import { MonthView } from './MonthView'
import { PlanView } from './PlanView'
import { resetPanel } from './panel'

const originalMedia = window.matchMedia
function viewport(width: number) {
  window.matchMedia = ((media: string) => ({
    matches: [...media.matchAll(/(min|max)-width:\s*([\d.]+)(px|rem)/g)].every((m) => {
      const px = Number(m[2]) * (m[3] === 'rem' ? 16 : 1)
      return m[1] === 'min' ? width >= px : width <= px
    }),
    media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true,
  })) as typeof window.matchMedia
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // Sunday 1 November 2026; weeks start on Monday.
  vi.setSystemTime(new Date(2026, 10, 1, 12, 0))
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  viewport(1280)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.matchMedia = originalMedia
  resetPanel()
})

const bars = (root: ParentNode, id: string) => [...root.querySelectorAll<HTMLElement>(`[data-span-bar="${id}"]`)]
const piece = (el: HTMLElement) => el.closest<HTMLElement>('[data-span-piece]')!
const trip = (over: Record<string, unknown> = {}) => createTask({ title: 'Lisbon trip', start: '2026-11-03', due: { date: '2026-11-05' }, span: true, ...over })

function Toast() {
  const toast = useBulkToast()
  return <p data-test-toast>{toast?.label ?? ''}</p>
}

/** The element at a point is the day `date` names (the drag reads the day under the pointer). */
function pointAt(date: () => string) {
  document.elementFromPoint = () => document.querySelector(`[data-span-day="${date()}"], [data-month-day="${date()}"]`)
}
async function drag(el: Element, over: string) {
  let at = ''
  pointAt(() => at)
  const init = { bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 }
  await act(async () => { el.dispatchEvent(new PointerEvent('pointerdown', init)) })
  at = over
  await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: 30 })) })
  await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: 60 })) })
  await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: 60 })) })
}

describe('Spans in the calendar', () => {
  it('Week draws one bar across the days it covers in the task style, never in the lane or on the grid', async () => {
    const travel = await createProject({ name: 'Travel', color: 'blue' })
    const id = await trip({ project_id: travel })
    const chore = await createTask({ title: 'Chore', due: { date: '2026-11-04' }, project_id: travel })
    const r = await render(<CalendarView mode="week" date="2026-11-04" />)
    await waitFor(() => bars(r.container, id).length > 0, 'the bar')
    const [bar] = bars(r.container, id)
    expect(bars(r.container, id)).toHaveLength(1)
    expect(piece(bar).style.gridColumn).toBe('2 / span 3')
    expect(bar.className).toContain('ui-block')
    expect(bar.className).not.toContain('ui-block--event')
    // The project's hue, as its other tasks have.
    await waitFor(() => !!r.container.querySelector(`[data-lane-task="${chore}"]`), 'the lane task')
    expect(bar.getAttribute('data-hue')).toBe(r.container.querySelector(`[data-lane-task="${chore}"]`)!.getAttribute('data-hue'))
    expect(r.container.querySelector(`[data-lane-task="${id}"]`)).toBeNull()
    expect(r.container.querySelector(`[data-block="${id}"]`)).toBeNull()
    // The band sits between the day names and the all-day strip.
    const header = r.container.querySelector('[data-span-header]')!
    const order = [...header.querySelectorAll('[data-day-header], [data-span-band], [data-day-strip]')].map((e) => e.hasAttribute('data-span-band') ? 'band' : e.hasAttribute('data-day-header') ? 'head' : 'strip')
    expect(order.indexOf('band')).toBeGreaterThan(order.lastIndexOf('head'))
    expect(order.indexOf('band')).toBeLessThan(order.indexOf('strip'))
    await r.unmount()
  })

  it('a span past the shown week is squared off with a chevron on that side', async () => {
    const id = await createTask({ title: 'Festival', start: '2026-11-07', due: { date: '2026-11-10' }, span: true })
    const r = await render(<CalendarView mode="week" date="2026-11-04" />)
    await waitFor(() => bars(r.container, id).length > 0, 'the bar')
    const [bar] = bars(r.container, id)
    expect(bar.className).toContain('ui-span--after')
    expect(bar.className).not.toContain('ui-span--before')
    expect(piece(bar).querySelector('[data-span-handle="last"]')).toBeNull()
    expect(piece(bar).querySelector('[data-span-handle="first"]')).toBeTruthy()
    await r.unmount()
  })

  it('Day shows the piece of the day with its position and its due time, and no block', async () => {
    const id = await trip({ due: { date: '2026-11-05', time: '17:00' } })
    const r = await render(<CalendarView mode="day" date="2026-11-05" />)
    await waitFor(() => bars(r.container, id).length > 0, 'the piece')
    const [bar] = bars(r.container, id)
    expect(bar.querySelector('[data-span-position]')!.textContent).toBe('Day 3 of 3')
    expect(bar.querySelector('[data-span-until]')!.textContent).toBe('until 17:00')
    expect(r.container.querySelector(`[data-block="${id}"]`)).toBeNull()
    await r.unmount()
  })

  it('a task with a start and no flag is drawn on its due day only, as before', async () => {
    const id = await createTask({ title: 'Report', start: '2026-11-02', due: { date: '2026-11-06' } })
    const r = await render(<CalendarView mode="week" date="2026-11-04" />)
    await waitFor(() => r.container.querySelector(`[data-lane-task="${id}"]`) !== null, 'the lane task')
    expect(r.container.querySelector('[data-day-header="2026-11-06"]')).toBeTruthy()
    expect(r.container.querySelector('[data-drop-lane="2026-11-06"]')!.querySelector(`[data-lane-task="${id}"]`)).toBeTruthy()
    expect(bars(r.container, id)).toHaveLength(0)
    await r.unmount()
  })

  it('the estimate counts on the due day only', async () => {
    await trip({ estimate_minutes: 480 })
    const r = await render(<CalendarView mode="week" date="2026-11-04" />)
    await waitFor(() => /^8h/.test(r.container.querySelector('[data-day-header="2026-11-05"] [data-capacity]')?.textContent ?? ''), 'the capacity')
    expect(r.container.querySelector('[data-day-header="2026-11-05"] [data-capacity]')!.textContent).toMatch(/^8h \/ 8h/)
    expect(r.container.querySelector('[data-day-header="2026-11-03"] [data-capacity]')!.textContent).toMatch(/^0m \/ 8h/)
    await r.unmount()
  })

  it('Month draws a span across two week rows, ending and starting squared off', async () => {
    const id = await createTask({ title: 'Festival', start: '2026-11-07', due: { date: '2026-11-10' }, span: true })
    const r = await render(<MonthView date="2026-11-04" />)
    await waitFor(() => bars(r.container, id).length === 2, 'two bars')
    const [a, b] = bars(r.container, id)
    expect(piece(a).style.gridColumn).toBe('6 / span 2')
    expect(a.className).toContain('ui-span--after')
    expect(piece(b).style.gridColumn).toBe('1 / span 2')
    expect(b.className).toContain('ui-span--before')
    // Not listed again as a row of a cell.
    expect(r.container.querySelector(`[data-month-task="${id}"]`)).toBeNull()
    await r.unmount()
  })

  it('Month counts the bars toward "+N more"', async () => {
    await trip()
    for (let i = 0; i < 3; i++) await createTask({ title: `Errand ${i}`, due: { date: '2026-11-04' } })
    const r = await render(<MonthView date="2026-11-04" />)
    await waitFor(() => !!r.container.querySelector('[data-month-day="2026-11-04"] [data-month-more]'), 'the more control')
    const cell = r.container.querySelector('[data-month-day="2026-11-04"]')!
    // One lane of bars leaves room for one row and "+2 more".
    expect(cell.querySelectorAll('[data-month-task]')).toHaveLength(1)
    expect(cell.querySelector('[data-month-more]')!.textContent).toBe('+2 more')
    await r.unmount()
  })

  it('Plan lists a span in each covered column with its position', async () => {
    const id = await trip()
    const r = await render(<PlanView date="2026-11-02" />)
    await waitFor(() => r.container.querySelectorAll(`[data-plan-task="${id}"]`).length === 3, 'three rows')
    const texts = [...r.container.querySelectorAll(`[data-plan-task="${id}"] [data-span-position]`)].map((e) => e.textContent)
    expect(texts).toEqual(['Day 1 of 3', 'Day 2 of 3', 'Day 3 of 3'])
    await r.unmount()
  })
})

describe('Moving and resizing a span', () => {
  it('dragging the middle one day to the right moves start and due in one change; Undo puts back both', async () => {
    const id = await trip()
    const r = await render(<><CalendarView mode="week" date="2026-11-04" /><Toast /></>)
    await waitFor(() => bars(r.container, id).length > 0, 'the bar')
    // The press is on the bar's first day (no layout in the test: the leading column).
    await drag(bars(r.container, id)[0], '2026-11-04')
    await waitFor(async () => (await getTask(id))?.start === '2026-11-04', 'the move')
    expect(await getTask(id)).toMatchObject({ start: '2026-11-04', due: { date: '2026-11-06' }, span: true })
    await waitFor(() => document.querySelector('[data-test-toast]')!.textContent === 'Rescheduled', 'the Undo toast')
    const ops = (await db.outbox.toArray()).filter((o) => o.entityId === id && (o.field === 'start' || o.field === 'due')).slice(-2)
    expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
    await r.unmount()
  })

  it('dragging the leading end onto the last day shrinks the span to one day and keeps the flag', async () => {
    const id = await trip()
    const r = await render(<CalendarView mode="week" date="2026-11-04" />)
    await waitFor(() => bars(r.container, id).length > 0, 'the bar')
    await drag(piece(bars(r.container, id)[0]).querySelector('[data-span-handle="first"]')!, '2026-11-05')
    await waitFor(async () => (await getTask(id))?.start === '2026-11-05', 'the new start')
    expect(await getTask(id)).toMatchObject({ start: '2026-11-05', due: { date: '2026-11-05' }, span: true })
    await waitFor(() => bars(r.container, id).length === 0, 'no bar for one day')
    await r.unmount()
  })

  it('dragging the trailing end of a date-only Month row makes it a span from its day', async () => {
    const id = await createTask({ title: 'Conference', due: { date: '2026-11-03' } })
    const r = await render(<MonthView date="2026-11-04" />)
    await waitFor(() => !!r.container.querySelector(`[data-month-task="${id}"] [data-span-handle="extend"]`), 'the trailing end')
    await drag(r.container.querySelector(`[data-month-task="${id}"] [data-span-handle="extend"]`)!, '2026-11-04')
    await waitFor(async () => (await getTask(id))?.span === true, 'the span')
    expect(await getTask(id)).toMatchObject({ start: '2026-11-03', due: { date: '2026-11-04' }, span: true })
    await r.unmount()
  })

  it('Shift+Right lengthens a selected span; Left moves it whole; Alt+Shift+Right moves its first day', async () => {
    const id = await trip()
    const r = await render(<CalendarView mode="week" date="2026-11-04" />)
    await waitFor(() => bars(r.container, id).length > 0, 'the bar')
    await click(bars(r.container, id)[0])
    await key(document.body, 'ArrowRight', { shiftKey: true })
    await waitFor(async () => (await getTask(id))?.due?.date === '2026-11-06', 'the last day')
    expect((await getTask(id))!.start).toBe('2026-11-03')
    await key(document.body, 'ArrowLeft')
    await waitFor(async () => (await getTask(id))?.start === '2026-11-02', 'the move')
    expect((await getTask(id))!.due).toEqual({ date: '2026-11-05' })
    await key(document.body, 'ArrowRight', { shiftKey: true, altKey: true })
    await waitFor(async () => (await getTask(id))?.start === '2026-11-03', 'the first day')
    expect((await getTask(id))!.due).toEqual({ date: '2026-11-05' })
    await r.unmount()
  })

  it('Shift+Right on a date-only task selected in the Month makes it a two-day span', async () => {
    const id = await createTask({ title: 'Conference', due: { date: '2026-11-03' } })
    const r = await render(<MonthView date="2026-11-04" />)
    await waitFor(() => !!r.container.querySelector(`[data-month-task="${id}"]`), 'the row')
    await click(r.container.querySelector(`[data-month-task="${id}"]`)!)
    await key(document.body, 'ArrowRight', { shiftKey: true })
    await waitFor(async () => (await getTask(id))?.span === true, 'the span')
    expect(await getTask(id)).toMatchObject({ start: '2026-11-03', due: { date: '2026-11-04' }, span: true })
    await waitFor(() => bars(r.container, id).length === 1, 'the bar')
    await r.unmount()
  })

  it('a viewer sees the bar without ends, and the keys do not move it', async () => {
    await db.projects.put({ id: 'shared', name: 'Shared', color: null, parent_id: null, position: 1, archived: false, deleted_at: null, _clock: {} } as never)
    await db.memberships.put({ projectId: 'shared', role: 'viewer', ownerId: 'someone', members: [] })
    const id = await trip({ project_id: 'shared' })
    const r = await render(<CalendarView mode="week" date="2026-11-04" />)
    await waitFor(() => bars(r.container, id).length > 0, 'the bar')
    expect(piece(bars(r.container, id)[0]).querySelector('[data-span-handle]')).toBeNull()
    expect(bars(r.container, id)[0].textContent).toContain('read-only')
    await click(bars(r.container, id)[0])
    await key(document.body, 'ArrowRight', { shiftKey: true })
    await key(document.body, 'ArrowRight')
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- nothing may be written, and a refused move shows no signal to wait for
    await flush(50)
    expect(await getTask(id)).toMatchObject({ start: '2026-11-03', due: { date: '2026-11-05' } })
    await r.unmount()
  })
})

describe('Spans on narrow screens', () => {
  it('the Week agenda at 390 px lists a span under each covered day with its position, and offers no ends', async () => {
    viewport(390)
    const id = await trip()
    const r = await render(<CalendarView mode="week" date="2026-11-04" />)
    await waitFor(() => !!r.container.querySelector('[data-week-agenda]') && r.container.querySelectorAll(`[data-agenda-task="${id}"]`).length === 3, 'three rows')
    const texts = ['2026-11-03', '2026-11-04', '2026-11-05'].map((d) => r.container.querySelector(`[data-agenda-day="${d}"] [data-agenda-task="${id}"] [data-span-position]`)?.textContent)
    expect(texts).toEqual(['Day 1 of 3', 'Day 2 of 3', 'Day 3 of 3'])
    expect(r.container.querySelector('[data-span-handle]')).toBeNull()
    await r.unmount()
  })

  it('the Month at 390 px counts a span on each covered day and lists it with its range for the focused day', async () => {
    viewport(390)
    const id = await trip()
    const r = await render(<MonthView date="2026-11-04" />)
    await waitFor(() => !!r.container.querySelector('[data-month-day="2026-11-03"] [data-month-count]'), 'the counts')
    for (const d of ['2026-11-03', '2026-11-04', '2026-11-05']) expect(r.container.querySelector(`[data-month-day="${d}"] [data-month-count]`)!.textContent).toBe('1')
    expect(r.container.querySelector('[data-month-day="2026-11-06"] [data-month-count]')).toBeNull()
    await waitFor(() => !!r.container.querySelector(`[data-month-day-list] [data-month-task="${id}"]`), 'the focused list')
    expect(r.container.querySelector(`[data-month-day-list] [data-month-task="${id}"] [data-span-range]`)!.textContent).toMatch(/3\s?–\s?5/)
    expect(r.container.querySelector('[data-span-bar]')).toBeNull()
    await r.unmount()
  })
})
