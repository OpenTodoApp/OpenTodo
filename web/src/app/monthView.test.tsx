// @vitest-environment happy-dom
// The Month view (OpenSpec change month-and-timeline-views, tasks 1.2 and 2.1-2.3):
// the route and range switch, a crowded cell, the capacity marker, keyboard moves
// that keep the time, viewers who cannot move, q on a focused day, j j Enter, axe.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { click, flush, key, render, type } from '../ui/test-utils'
import { addMonthsISO, MonthView } from './MonthView'
import { resetPanel } from './panel'
import { openedTask, resetTaskPage } from './taskPage.testkit'
import { parseRoute, routePath } from './router'

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
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const cell = (root: ParentNode, d: string) => root.querySelector<HTMLElement>(`[data-month-day="${d}"]`)!

describe('month route', () => {
  it('parses and prints /month with an optional date, and clamps month steps', () => {
    expect(parseRoute('/month/2026-11-18')).toEqual({ view: 'month', date: '2026-11-18' })
    expect(parseRoute('/month')).toEqual({ view: 'month' })
    expect(routePath({ view: 'month', date: '2026-11-18' })).toBe('/month/2026-11-18')
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsISO('2026-11-18', -1)).toBe('2026-10-18')
  })

  it('keeps the date when switching range, and is remembered for /calendar', async () => {
    const r = await render(<MonthView date="2026-11-18" />)
    await flush(30)
    expect(localStorage.getItem('ot.calendar.mode')).toBe('month')
    expect(parseRoute('/calendar')).toEqual({ view: 'month' })
    const sw = r.container.querySelector('[role="group"][aria-label="Calendar range"]')!
    expect(sw.querySelector('[aria-pressed="true"]')!.textContent).toBe('Month')
    await click([...sw.querySelectorAll('button')].find((b) => b.textContent === 'Day')!)
    expect(location.pathname).toBe('/day/2026-11-18')
    await r.unmount()
  })
})

describe('month grid', () => {
  it('shows three rows and "+N more" for a crowded day, and the capacity marker', async () => {
    for (let i = 0; i < 7; i++) await createTask({ title: `Task ${i}`, due: { date: '2026-11-12' }, estimate_minutes: i < 3 ? 180 : undefined })
    const r = await render(<MonthView />)
    await waitFor(() => cell(r.container, '2026-11-12').querySelectorAll('[data-month-task]').length === 2)
    const c = cell(r.container, '2026-11-12')
    expect(c.querySelector('[data-month-more]')!.textContent).toBe('+5 more')
    expect(c.querySelector('[data-capacity]')!.textContent).toBe('9h / 8h')
    expect(c.querySelector('[data-capacity]')!.hasAttribute('data-over')).toBe(true)
    await click(c.querySelector('[data-month-more]')!)
    await waitFor(() => cell(r.container, '2026-11-12').querySelectorAll('[data-month-task]').length === 7)
    // Six weeks of seven days covering the month; today is marked.
    const rows = [...r.container.querySelectorAll('[role="row"]')].slice(1)
    expect(rows.map((w) => w.querySelectorAll('[role="gridcell"]').length)).toEqual([7, 7, 7, 7, 7, 7])
    expect(rows[0].querySelector('[data-month-day="2026-11-01"]')).toBeTruthy()
    expect(cell(r.container, '2026-11-18').getAttribute('aria-current')).toBe('date')

    const axe = (await import('axe-core')).default
    const res = await axe.run(r.container, { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await r.unmount()
  })

  it('moves the selected task a week with Down, keeping its time, and follows it into the next month', async () => {
    const id = await createTask({ title: 'Review', due: { date: '2026-11-26', time: '14:30' } })
    const r = await render(<MonthView />)
    await waitFor(() => r.container.querySelector(`[data-month-task="${id}"]`) !== null)
    await click(r.container.querySelector(`[data-month-task="${id}"]`)!)
    await key(document.body, 'ArrowDown')
    await waitFor(() => location.pathname === '/month/2026-12-03')
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-12-03', time: '14:30' })
    await r.unmount()
  })

  it('fills rows in the project hue and dims the ones of days before today (surfaces-v2)', async () => {
    const old = await createTask({ title: 'Old', due: { date: '2026-11-10' } })
    const soon = await createTask({ title: 'Soon', due: { date: '2026-11-20' } })
    const r = await render(<MonthView />)
    await waitFor(() => r.container.querySelector(`[data-month-task="${soon}"]`) !== null)
    expect(r.container.querySelector(`[data-month-task="${old}"]`)!.className).toContain('ui-block--past')
    const row = r.container.querySelector(`[data-month-task="${soon}"]`)!
    expect(row.className).toContain('ui-block')
    expect(row.className).not.toContain('ui-block--past')
    await r.unmount()
  })

  it('dropping a task on another day keeps its time', async () => {
    const id = await createTask({ title: 'Call', due: { date: '2026-11-17', time: '14:30' } })
    const r = await render(<MonthView />)
    await waitFor(() => r.container.querySelector(`[data-month-task="${id}"]`) !== null)
    const target = cell(r.container, '2026-11-19')
    document.elementFromPoint = () => target
    const row = r.container.querySelector(`[data-month-task="${id}"]`)!
    await act(async () => {
      row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 }))
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 120 }))
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 120 }))
    })
    await waitFor(() => cell(r.container, '2026-11-19').querySelector(`[data-month-task="${id}"]`) !== null)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-11-19', time: '14:30' })
    await r.unmount()
  })

  it('does not move tasks of a project the user only views', async () => {
    await db.projects.put({ id: 'shared', name: 'Shared', color: null, parent_id: null, position: 1, archived: false, deleted_at: null, _clock: {} } as never)
    await db.memberships.put({ projectId: 'shared', role: 'viewer', ownerId: 'someone', members: [] })
    const id = await createTask({ title: 'Theirs', due: { date: '2026-11-20' }, project_id: 'shared' })
    const r = await render(<MonthView />)
    await waitFor(() => r.container.querySelector(`[data-month-task="${id}"]`) !== null)
    expect(r.container.querySelector(`[data-month-task="${id}"]`)!.textContent).toContain('read-only')
    await click(r.container.querySelector(`[data-month-task="${id}"]`)!)
    await key(document.body, 'ArrowRight')
    await flush(50)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-11-20' })
    await r.unmount()
  })

  it('q adds a task due on the focused day, and j j Enter opens the second task', async () => {
    await createTask({ title: 'First', due: { date: '2026-11-02' } })
    const second = await createTask({ title: 'Second', due: { date: '2026-11-05' } })
    const r = await render(<MonthView />)
    await waitFor(() => r.container.querySelectorAll('[data-month-task]').length === 2)
    // Focus moves from today (18th) to the 15th with the arrows.
    for (let i = 0; i < 3; i++) await key(document.body, 'ArrowLeft')
    expect(cell(r.container, '2026-11-15').getAttribute('aria-selected')).toBe('true')
    await key(document.body, 'q')
    await waitFor(() => document.querySelector('[role="dialog"] input') !== null)
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    await type(input, 'Dentist')
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => cell(r.container, '2026-11-15').textContent!.includes('Dentist'))
    const added = (await db.tasks.toArray()).find((t) => t.title === 'Dentist')!
    expect(added.due).toEqual({ date: '2026-11-15' })

    await key(document.body, 'j')
    await key(document.body, 'j')
    await key(document.body, 'Enter')
    expect(openedTask()).toBe(second)
    await r.unmount()
  })
})
