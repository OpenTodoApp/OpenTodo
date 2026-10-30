// @vitest-environment happy-dom
// Slots on the Day and Week grid (OpenSpec change calendar-slots, tasks 3.1 to 3.6):
// one block with a checklist and "+n", keyboard rows, a drop that adds, a row
// dragged out, Shift+Enter in a placement, the phone agenda row and the list row's
// time column.
import 'fake-indexeddb/auto'
import { act, useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { getTask } from '../lib/localData'
import { createTask, resetDeviceId } from '../lib/ops'
import { createSlot } from '../lib/slots'
import { click, key, minWidthPx, render, visibleText, waitFor } from '../ui/test-utils'
import { CalendarView } from './CalendarView'
import { closePanelIfStale, resetPanel } from './panel'
import { navigate, useRoute } from './router'
import { TaskRow } from './TaskRow'

const DAY = '2026-10-14' // a Wednesday

function Calendar() {
  const route = useRoute()
  useEffect(() => { closePanelIfStale(location.pathname) }, [route])
  if (route.view === 'day' || route.view === 'week') return <CalendarView mode={route.view} date={route.date} />
  return <p>elsewhere</p>
}

const original = window.matchMedia
const fromPoint = document.elementFromPoint
function viewport(px: number) {
  window.matchMedia = ((q: string) => ({
    matches: minWidthPx(q) <= px, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 8, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  viewport(1280)
  navigate({ view: 'day' }, { replace: true })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.matchMedia = original
  document.elementFromPoint = fromPoint
  resetPanel()
  navigate({ view: 'inbox' }, { replace: true })
})

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)]

/** A slot holding `n` tasks of 5 minutes on DAY. */
async function slotWith(n: number, over: { start?: string; minutes?: number; title?: string } = {}) {
  const ids: string[] = []
  for (let i = 0; i < n; i++) ids.push(await createTask({ title: `Small ${i + 1}`, due: { date: DAY }, estimate_minutes: 5 }))
  const { id } = await createSlot({ date: DAY, start: over.start ?? '16:00', minutes: over.minutes ?? 180, title: over.title ?? 'Admin' })
  await db.slots.update(id, { task_ids: ids })
  return { id, ids }
}

describe('a slot on the grid', () => {
  it('"Ten small tasks, one block": one block, the rows that fit and +n; no blocks or lane rows for the ten', async () => {
    const { id, ids } = await slotWith(10)
    const r = await render(<Calendar />)
    await waitFor(() => q('[data-slot-count]')?.textContent === '0 of 10 done', 'the slot')
    const block = q(`[data-slot="${id}"]`)!
    expect(q(`[data-slot-name="${id}"]`)!.textContent).toContain('Admin')
    expect(q('[data-slot-count]')!.textContent).toBe('0 of 10 done')
    // 180 minutes are 144 px: five 24 px rows under the title, so four rows and "+6".
    expect(qa('[data-slot-row]')).toHaveLength(4)
    expect(q('[data-slot-more]')!.textContent).toBe('+6')
    expect(block.className).toContain('ui-block')
    for (const tid of ids) {
      expect(q(`[data-block="${tid}"]`)).toBeNull()
      expect(q(`[data-lane-task="${tid}"]`)).toBeNull()
    }
    // Capacity counts the slot once: 180 minutes, not the tasks' 50.
    expect(q(`[data-day-header="${DAY}"]`)!.textContent).toContain('3h')
    await click(q('[data-slot-more]')!)
    await waitFor(() => qa('[data-slot-details-row]').length === 10, 'the popover lists all ten')
    await r.unmount()
  })

  it('"Complete from the grid with the keyboard": arrows move between rows, Space completes, Enter opens', async () => {
    const { ids } = await slotWith(10)
    const r = await render(<Calendar />)
    await waitFor(() => qa('[data-slot-row]').length === 4, 'rows')
    const first = q('[data-slot-row]')!
    expect(first.tabIndex).toBe(0)
    first.focus()
    await key(first, 'ArrowDown')
    expect(document.activeElement).toBe(qa('[data-slot-row]')[1])
    await key(document.activeElement!, ' ')
    await waitFor(async () => !!(await getTask(ids[1]))?.completed_at, 'completed')
    await waitFor(() => q('[data-slot-count]')!.textContent === '1 of 10 done', 'count')
    await r.unmount()
  })

  it('"Drop a small task": dragged from a block onto the slot, it is dated without a time and listed', async () => {
    const { id } = await slotWith(1)
    const t = await createTask({ title: 'Reply to Marco', due: { date: DAY, time: '10:00' }, estimate_minutes: 5 })
    const r = await render(<Calendar />)
    await waitFor(() => !!q(`[data-block="${t}"]`) && !!q(`[data-slot="${id}"]`), 'block and slot')
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { top: 0, bottom: 1152, height: 1152, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON() {} } as DOMRect
    })
    document.elementFromPoint = () => q(`[data-slot="${id}"]`)
    const block = q(`[data-block="${t}"]`)!
    const init = { bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: 50 }
    await act(async () => { block.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientY: 500 })) })
    await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientY: 520 })) })
    await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientY: 800 })) })
    await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { ...init, clientY: 800 })) })
    await waitFor(async () => (await db.slots.get(id))!.task_ids.includes(t), 'listed')
    expect((await getTask(t))!.due).toEqual({ date: DAY })
    await waitFor(() => !q(`[data-block="${t}"]`) && !!q(`[data-slot-row="${t}"]`), 'drawn in the slot')
    await r.unmount()
  })

  it('"Take one task out": a row dropped on 14:00 gets that time and leaves the slot', async () => {
    const { id, ids } = await slotWith(2)
    const r = await render(<Calendar />)
    await waitFor(() => qa('[data-slot-row]').length === 2, 'rows')
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { top: 0, bottom: 1152, height: 1152, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON() {} } as DOMRect
    })
    document.elementFromPoint = () => q(`[data-drop-day="${DAY}"]`)
    const row = q(`[data-slot-row="${ids[0]}"]`)!
    const init = { bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: 50 }
    await act(async () => { row.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientY: 780 })) })
    await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientY: 790 })) })
    await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientY: 14 * 60 * 0.8 + 2 })) })
    await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { ...init, clientY: 14 * 60 * 0.8 + 2 })) })
    await waitFor(async () => (await getTask(ids[0]))?.due?.time === '14:00', 'timed')
    expect((await db.slots.get(id))!.task_ids).toEqual([ids[1]])
    await r.unmount()
  })

  it('"Keyboard placement into a slot": p over the slot shows the hint, Shift+Enter adds the task', async () => {
    const { id } = await slotWith(1, { start: '16:00', minutes: 45 })
    const t = await createTask({ title: 'Pay invoice', due: { date: DAY, time: '16:15' } })
    const r = await render(<Calendar />)
    await waitFor(() => !!q(`[data-block="${t}"]`), 'block')
    await click(q(`[data-block="${t}"]`)!)
    await key(document.body, 'p')
    await waitFor(() => !!q('[data-placing-slot]'), 'the hint')
    expect(q('[data-placing-slot]')!.textContent).toContain('Shift+Enter: add to Admin')
    await key(document.body, 'Enter', { shiftKey: true })
    await waitFor(async () => (await db.slots.get(id))!.task_ids.includes(t), 'added')
    expect((await getTask(t))!.due).toEqual({ date: DAY })
    await r.unmount()
  })

  it('New slot in the overflow menu: today at the next free quarter hour, its title open for editing', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 10, 7))
    const r = await render(<Calendar />)
    await waitFor(() => !!q('[data-drop-day]'), 'the day')
    const more = q<HTMLButtonElement>('[data-page-header] [aria-label="More"]') ?? qa('[data-page-header] button').find((b) => b.getAttribute('aria-haspopup') === 'menu')!
    await click(more)
    await waitFor(() => !!q('[data-new-slot]'), 'the item')
    await click(q('[data-new-slot]')!)
    await waitFor(async () => (await db.slots.count()) === 1, 'created')
    const [s] = await db.slots.toArray()
    expect(s).toMatchObject({ date: DAY, start: '10:15', minutes: 30 })
    await waitFor(() => !!q('[data-slot-title]'), 'the title field')
    await r.unmount()
  })
})

describe('phone and lists', () => {
  it('"Phone agenda": one row with times and count that expands to the checklist', async () => {
    viewport(390)
    navigate({ view: 'week' }, { replace: true })
    const { id } = await slotWith(3, { start: '16:00', minutes: 45 })
    const r = await render(<Calendar />)
    await waitFor(() => !!q(`[data-agenda-slot="${id}"]`)?.textContent?.includes('0 of 3'), 'the agenda row')
    const row = q(`[data-agenda-slot="${id}"] button`)!
    expect(visibleText(row)).toContain('Admin · 16:00–16:45 · 0 of 3')
    expect(qa('[data-agenda-slot-task]')).toHaveLength(0)
    await click(row)
    await waitFor(() => qa('[data-agenda-slot-task]').length === 3, 'expanded')
    await r.unmount()
  })

  it('"Today in calendar order": a slotted task shows the slot start with the stack icon', async () => {
    const { ids } = await slotWith(1, { start: '16:00', minutes: 45 })
    const task = (await db.tasks.get(ids[0]))!
    const r = await render(<ul><TaskRow task={task} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} timeColumn /></ul>)
    await waitFor(() => !!r.container.querySelector('[data-row-slot]'), 'the slot time')
    const cell = r.container.querySelector('[data-row-time]')!
    expect(visibleText(cell)).toBe('16:00')
    expect(cell.querySelector('svg')).not.toBeNull()
    await r.unmount()
  })
})
