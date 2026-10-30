// @vitest-environment happy-dom
// Adding with the pointer (OpenSpec change calendar-clarity, design D2, GitHub issue
// 555; tasks 2.2 to 2.4): a double-click on an empty quarter hour of Day and Week or an
// empty part of a Month day opens the add dialog there; a right-click or a long press
// opens the add menu (Add task here…, New frame here…, New slot here…); `q` adds on the
// focused day; a double-click on a task still opens the task.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { click, key, render, type, waitFor } from '../ui/test-utils'
import { CalendarView } from './CalendarView'
import { PX_PER_MIN } from './calendar/grid'
import { ADD_HOLD_MS } from './calendar/addHere'
import { MonthView } from './MonthView'
import { resetPanel } from './panel'
import { openedTask, resetTaskPage } from './taskPage.testkit'

beforeEach(async () => {
  resetTaskPage()
  vi.useFakeTimers({ toFake: ['Date'] })
  // Wednesday 18 November 2026; the week runs Monday 16 to Sunday 22.
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
})

const column = (root: ParentNode, d: string) => root.querySelector<HTMLElement>(`[data-drop-day="${d}"]`)!
/** The pointer over `minutes` of a day column (happy-dom places every box at 0). */
const at = (minutes: number) => ({ bubbles: true, cancelable: true, clientX: 10, clientY: minutes * PX_PER_MIN + 1 })

async function dblclick(el: Element, init: MouseEventInit = { bubbles: true }) {
  await act(async () => { el.dispatchEvent(new MouseEvent('dblclick', init)) })
}
async function addThroughDialog(title: string) {
  await waitFor(() => document.querySelector('[role="dialog"] input') !== null, 'the add dialog')
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
  await type(input, title)
  await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  await waitFor(async () => (await db.tasks.toArray()).some((t) => t.title === title.replace(/ at 4pm$/, '')), 'the new task')
  return (await db.tasks.toArray()).find((t) => t.title === title.replace(/ at 4pm$/, ''))!
}
const menuItem = (name: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((b) => b.textContent?.includes(name))

describe('Day and Week', () => {
  it('a double-click on Tuesday 14:30 adds a task due then, drawn as a block at once', async () => {
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => !!column(r.container, '2026-11-17'), 'the grid')
    await dblclick(column(r.container, '2026-11-17'), at(14 * 60 + 30))
    const task = await addThroughDialog('Call the bank')
    expect(task.due).toEqual({ date: '2026-11-17', time: '14:30' })
    expect(task.estimate_minutes ?? null).toBeNull()
    await waitFor(() => !!column(r.container, '2026-11-17').querySelector(`[data-block="${task.id}"]`), 'the block')
    await r.unmount()
  })

  it('a double-click in the unscheduled lane adds a task with the date only', async () => {
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => !!r.container.querySelector('[data-drop-lane="2026-11-19"]'), 'the lane')
    await dblclick(r.container.querySelector('[data-drop-lane="2026-11-19"]')!)
    const task = await addThroughDialog('Groceries')
    expect(task.due).toEqual({ date: '2026-11-19' })
    await r.unmount()
  })

  it('a right-click opens the add menu there: Add task here…, New frame here… and New slot here…', async () => {
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => !!column(r.container, '2026-11-18'), 'the grid')
    await act(async () => { column(r.container, '2026-11-18').dispatchEvent(new MouseEvent('contextmenu', at(9 * 60))) })
    await waitFor(() => !!menuItem('Add task here'), 'the menu')
    expect(menuItem('New frame here')).toBeTruthy()
    expect(menuItem('New slot here')).toBeTruthy()
    await click(menuItem('Add task here')!)
    const task = await addThroughDialog('Standup notes')
    expect(task.due).toEqual({ date: '2026-11-18', time: '09:00' })

    // New slot here… creates a 30-minute slot from that quarter hour (calendar-slots).
    await act(async () => { column(r.container, '2026-11-20').dispatchEvent(new MouseEvent('contextmenu', at(16 * 60 + 15))) })
    await waitFor(() => !!menuItem('New slot here'), 'the menu again')
    await click(menuItem('New slot here')!)
    await waitFor(async () => (await db.slots.count()) === 1, 'the slot')
    const slot = (await db.slots.toArray())[0]
    expect([slot.date, slot.start]).toEqual(['2026-11-20', '16:15'])
    await r.unmount()
  })

  it('a long press on an empty slot opens the menu; on a task block it does not', async () => {
    const id = await createTask({ title: 'Block', due: { date: '2026-11-18', time: '10:00' }, estimate_minutes: 60 })
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => !!r.container.querySelector(`[data-block="${id}"]`), 'the block')
    const press = (el: Element, minutes: number) => act(async () => {
      el.dispatchEvent(new PointerEvent('pointerdown', { ...at(minutes), pointerType: 'touch', pointerId: 7, button: 0 }))
    })
    const t0 = performance.now()
    await press(r.container.querySelector(`[data-block="${id}"]`)!, 10 * 60 + 10)
    await waitFor(() => performance.now() - t0 > ADD_HOLD_MS + 100, 'longer than a long press')
    expect(menuItem('Add task here')).toBeUndefined()
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 }))

    await press(column(r.container, '2026-11-18'), 15 * 60)
    await waitFor(() => !!menuItem('Add task here'), 'the menu after a long press')
    await r.unmount()
  })

  it('q adds on the selected block\'s day without a time, and "at 4pm" sets 16:00', async () => {
    const id = await createTask({ title: 'Thursday thing', due: { date: '2026-11-19', time: '09:00' } })
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => !!r.container.querySelector(`[data-block="${id}"]`), 'the block')
    await click(r.container.querySelector(`[data-block="${id}"]`)!)
    await key(document.body, 'q')
    const task = await addThroughDialog('Meet Ana at 4pm')
    expect(task.due).toEqual({ date: '2026-11-19', time: '16:00' })
    await r.unmount()
  })

  it('a double-click on a block still opens the task and adds nothing', async () => {
    const id = await createTask({ title: 'Existing', due: { date: '2026-11-18', time: '11:00' } })
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => !!r.container.querySelector(`[data-block="${id}"]`), 'the block')
    await dblclick(r.container.querySelector(`[data-block="${id}"]`)!, at(11 * 60 + 5))
    expect(openedTask()).toBe(id)
    expect(document.querySelector('[role="dialog"] input')).toBeNull()
    await r.unmount()
  })
})

describe('Month', () => {
  const cell = (root: ParentNode, d: string) => root.querySelector<HTMLElement>(`[data-month-day="${d}"]`)!

  it('a double-click on an empty part of the 15th adds a task due on the 15th at once', async () => {
    const r = await render(<MonthView />)
    await waitFor(() => !!cell(r.container, '2026-11-15'), 'the grid')
    await dblclick(cell(r.container, '2026-11-15'))
    const task = await addThroughDialog('Dentist')
    expect(task.due).toEqual({ date: '2026-11-15' })
    await waitFor(() => cell(r.container, '2026-11-15').textContent!.includes('Dentist'), 'the row')
    await r.unmount()
  })

  it('a right-click opens the add menu without the grid\'s frame and slot items', async () => {
    const r = await render(<MonthView />)
    await waitFor(() => !!cell(r.container, '2026-11-24'), 'the grid')
    await act(async () => { cell(r.container, '2026-11-24').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })) })
    await waitFor(() => !!menuItem('Add task here'), 'the menu')
    expect(menuItem('New frame here')).toBeUndefined()
    await r.unmount()
  })

  it('a double-click on a task row opens the task and no add dialog; days show a hover surface under a fine pointer', async () => {
    const id = await createTask({ title: 'Row', due: { date: '2026-11-16' } })
    const r = await render(<MonthView />)
    await waitFor(() => !!r.container.querySelector(`[data-month-task="${id}"]`), 'the row')
    await dblclick(r.container.querySelector(`[data-month-task="${id}"]`)!)
    expect(openedTask()).toBe(id)
    expect(document.querySelector('[role="dialog"] input')).toBeNull()
    expect(cell(r.container, '2026-11-16').className).toContain('pointer-fine:hover:bg-hover')
    await r.unmount()
  })
})
