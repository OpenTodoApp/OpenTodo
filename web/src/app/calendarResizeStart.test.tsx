// @vitest-environment happy-dom
// A block's upper edge changes its start and keeps its end (GitHub issue 355,
// time-blocking "Place and resize blocks"): one change with Undo; dragging the middle
// moves the block and keeps its length; Alt+Shift+arrows are the keyboard twin.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { getTask } from '../lib/localData'
import { createTask, resetDeviceId } from '../lib/ops'
import { flush, key, render } from '../ui/test-utils'
import { useBulkToast } from './bulk/toastStore'
import { CalendarView } from './CalendarView'
import { PX_PER_MIN } from './calendar/grid'
import { resetPanel } from './panel'

const DAY = '2026-10-14'
const y = (minutes: number) => minutes * PX_PER_MIN

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 8, 0))
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
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean | Promise<boolean>, ms = 3000) {
  for (let t = 0; t < ms && !(await ok()); t += 20) await flush(20)
  expect(await ok()).toBe(true)
}

/** The day column starts at y 0; the block sits where its minutes put it. */
function layout(start: number, length: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const box = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON() {} }) as DOMRect
    if (this.hasAttribute('data-block')) return box(y(start), y(length))
    return box(0, y(24 * 60))
  })
  const column = () => document.querySelector<HTMLElement>(`[data-drop-day="${DAY}"]`)!
  document.elementFromPoint = () => column()
}

async function drag(el: Element, fromY: number, toY: number) {
  const init = { bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: 50 }
  await act(async () => { el.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientY: fromY })) })
  await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientY: fromY + (toY > fromY ? 6 : -6) })) })
  await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientY: toY })) })
  await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { ...init, clientY: toY })) })
}

function Toast() {
  const toast = useBulkToast()
  return <p data-test-toast>{toast?.label ?? ''}</p>
}

describe('the upper edge of a block', () => {
  it('dragging the upper edge up 30 minutes starts earlier and keeps the end, as one change with Undo', async () => {
    const id = await createTask({ title: 'Write the report', due: { date: DAY, time: '10:00' }, estimate_minutes: 60 })
    const r = await render(<><CalendarView mode="day" /><Toast /></>)
    await waitFor(() => r.container.querySelector(`[data-block="${id}"]`) !== null)
    layout(10 * 60, 60)
    const block = r.container.querySelector(`[data-block="${id}"]`)!
    expect(block.querySelector('[data-resize-start-handle]')).toBeTruthy()
    await drag(block, y(10 * 60) + 1, y(9 * 60 + 30))
    await waitFor(async () => (await getTask(id))?.due?.time === '09:30')
    const task = await getTask(id)
    expect(task?.due).toEqual({ date: DAY, time: '09:30' })
    expect(task?.estimate_minutes).toBe(90)
    expect(document.querySelector('[data-test-toast]')!.textContent).toBe('Rescheduled')
    await r.unmount()
  })

  it('dragging it down shortens from the top, never below one slot; an unestimated block starts from its 30 minutes', async () => {
    const id = await createTask({ title: 'Call', due: { date: DAY, time: '10:00' } })
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => r.container.querySelector(`[data-block="${id}"]`) !== null)
    layout(10 * 60, 30)
    await drag(r.container.querySelector(`[data-block="${id}"]`)!, y(10 * 60) + 1, y(11 * 60))
    await waitFor(async () => (await getTask(id))?.due?.time === '10:15')
    expect((await getTask(id))?.estimate_minutes).toBe(15)
    await r.unmount()
  })

  it('dragging the middle moves the block and keeps its length', async () => {
    const id = await createTask({ title: 'Write the report', due: { date: DAY, time: '10:00' }, estimate_minutes: 60 })
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => r.container.querySelector(`[data-block="${id}"]`) !== null)
    layout(10 * 60, 60)
    await drag(r.container.querySelector(`[data-block="${id}"]`)!, y(10 * 60 + 30), y(13 * 60 + 30))
    await waitFor(async () => (await getTask(id))?.due?.time === '13:00')
    expect((await getTask(id))?.estimate_minutes).toBe(60)
    await r.unmount()
  })

  it('Alt+Shift+Up starts the selected block 15 minutes earlier and keeps the end; Alt+Shift+Down later', async () => {
    const id = await createTask({ title: 'Write the report', due: { date: DAY, time: '10:00' }, estimate_minutes: 60 })
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => r.container.querySelector(`[data-block="${id}"]`) !== null)
    await key(document.body, 'ArrowDown') // nothing selected: selects the first task
    await key(document.body, 'ArrowUp', { altKey: true, shiftKey: true })
    await waitFor(async () => (await getTask(id))?.due?.time === '09:45')
    expect((await getTask(id))?.estimate_minutes).toBe(75)
    await key(document.body, 'ArrowDown', { altKey: true, shiftKey: true })
    await key(document.body, 'ArrowDown', { altKey: true, shiftKey: true })
    await waitFor(async () => (await getTask(id))?.due?.time === '10:15')
    expect((await getTask(id))?.estimate_minutes).toBe(45)
    await r.unmount()
  })
})
