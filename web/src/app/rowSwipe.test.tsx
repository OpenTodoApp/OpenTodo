// @vitest-environment happy-dom
// Swipe actions on a touch list (OpenSpec change phone-v2, design D3, D4, D8): right
// completes with Undo, left opens the Schedule sheet, short pulls and diagonal moves
// do nothing, a selection turns swipes off, the one-time cue, and a long press selects.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createTask, resetDeviceId } from '../lib/ops'
import { flush, key, render } from '../ui/test-utils'
import type { User } from '../lib/types'
import { navigate } from './router'
import { Shell } from './Shell'
import { hideBulkToast } from './bulk/toastStore'
import { UndoToast } from './bulk/UndoToast'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'
import { TaskRow } from './TaskRow'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const original = window.matchMedia
let reduce = false
let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  useDatabase(`swipe-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
  reduce = false
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  // A phone: 390 px, a coarse pointer.
  window.matchMedia = ((q: string) => ({
    matches: /pointer:\s*fine/.test(q) ? false : /pointer:\s*coarse/.test(q) ? true : /prefers-reduced-motion/.test(q) ? reduce : Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? 0) <= 390,
    media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  window.matchMedia = original
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  hideBulkToast()
  resetPanel()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
async function inbox(...titles: string[]) {
  const ids: string[] = []
  for (const t of titles) ids.push(await createTask({ title: t }))
  const r = await render(<><TaskListView route={{ view: 'inbox' }} /><UndoToast /></>)
  mounted.push(r)
  await waitFor(() => document.body.textContent!.includes(titles[titles.length - 1]))
  return ids
}
const row = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!
/** A touch swipe on a row: the press, the moves, the release, `ms` apart. */
async function swipe(el: HTMLElement, xs: number[], { y = 0, ms = 120 } = {}) {
  let now = 0
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
  await act(async () => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, pointerType: 'touch', clientX: 50, clientY: 50 })) })
  for (const x of xs) {
    now += ms
    await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 3, pointerType: 'touch', clientX: 50 + x, clientY: 50 + y })) })
  }
  await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, pointerType: 'touch', clientX: 50 + xs[xs.length - 1], clientY: 50 + y })) })
  clock.mockRestore()
  await flush(150)
}

describe('swipe actions on a touch list', () => {
  it('swipe right completes the task and offers Undo; offline the op waits in the outbox', async () => {
    const [id] = await inbox('Water plants')
    expect(row(id).hasAttribute('data-swipeable')).toBe(true)
    expect(row(id).className).toContain('touch-pan-y')
    await swipe(row(id), [20, 60, 110])
    await waitFor(() => !!document.querySelector('[data-bulk-toast] [data-toast-undo]'))
    expect((await db.tasks.get(id))!.completed_at).not.toBeNull()
    expect(await db.outbox.count()).toBeGreaterThan(0)
  })

  it('a short pull springs back and changes nothing; a flick past 64 px commits', async () => {
    const [a, b] = await inbox('Short', 'Flick')
    await swipe(row(a), [20, 50], { ms: 400 })
    expect((await db.tasks.get(a))!.completed_at).toBeNull()
    await swipe(row(b), [20, 80], { ms: 20 })
    await waitFor(() => !!document.querySelector('[data-bulk-toast]'))
    expect((await db.tasks.get(b))!.completed_at).not.toBeNull()
  })

  it('swipe left opens the Schedule sheet; Tomorrow sets the date', async () => {
    const [id] = await inbox('Call the bank')
    await swipe(row(id), [-20, -60, -110])
    await waitFor(() => !!document.querySelector('[data-testid="row-schedule-sheet"]'))
    expect([...document.querySelectorAll('[data-schedule-choice]')].map((b) => b.textContent)).toEqual(['Today', 'Tomorrow', 'Next week', 'Pick a day…', 'Someday'])
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-schedule-choice="tomorrow"]')!.click() })
    await waitFor(() => !document.querySelector('[data-testid="row-schedule-sheet"]'))
    await flush(50)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-15' })
  })

  it('a diagonal move scrolls: the row does not move and nothing fires', async () => {
    const [id] = await inbox('Read')
    await swipe(row(id), [10, 60, 120], { y: 30 })
    expect(document.querySelector('[data-swipe-edge]')).toBeNull()
    expect((await db.tasks.get(id))!.completed_at).toBeNull()
  })

  it('a long press ticks the row, shows the checkboxes and the bar; swipes are then off', async () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    const [id] = await inbox('Hold me', 'Other')
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    await act(async () => { row(id).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 4, pointerType: 'touch', clientX: 20, clientY: 20 })) })
    await act(async () => { vi.advanceTimersByTime(400) })
    await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 4, pointerType: 'touch', clientX: 20, clientY: 20 })) })
    // The swallowed click's guard ends on a timer; let it run before real timers come back.
    await act(async () => { vi.advanceTimersByTime(10) })
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date'] })
    await waitFor(() => row(id).hasAttribute('data-ticked'))
    expect(vibrate).toHaveBeenCalledWith(10)
    expect(document.querySelectorAll('[data-tick]').length).toBe(2)
    expect(document.querySelector('[data-selection-bar]')).toBeTruthy()
    expect(row(id).hasAttribute('data-swipeable')).toBe(false)
  })

  it('the one-time cue: shown once per device, the toast names the gesture and its menu twin', async () => {
    await inbox('First')
    await waitFor(() => !!document.querySelector('[data-bulk-toast]'))
    expect(document.querySelector('[data-bulk-toast]')!.textContent).toContain('Swipe right to complete, left to schedule. Also in a task\'s menu.')
    expect(localStorage.getItem('opentodo.swipe-cue')).toBe('1')
    for (const r of mounted.splice(0)) await r.unmount()
    hideBulkToast()
    await inbox('Second')
    await flush(100)
    expect(document.querySelector('[data-bulk-toast]')).toBeNull()
  })
})

describe('the swipes\' twins and touch selection', () => {
  it('on touch, one task\'s menu starts with Complete and Schedule…, acting as the swipes do', async () => {
    const [id] = await inbox('Menu task')
    await key(document.body, 'j')
    await key(document.body, '.')
    const items = () => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
    await waitFor(() => items().some((m) => m.textContent?.startsWith('Schedule…')))
    expect(items()[0].textContent).toMatch(/^Complete/)
    expect(items()[1].textContent).toMatch(/^Schedule…/)
    await act(async () => { items().find((m) => !m.closest('[inert]') && m.textContent?.startsWith('Schedule…'))!.click() })
    await waitFor(() => !!document.querySelector('[data-testid="row-schedule-sheet"]'))
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-schedule-choice="today"]')!.click() })
    await flush(50)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-14' })
    await key(document.body, '.')
    await waitFor(() => items().length > 0)
    await act(async () => { items()[0].click() })
    await waitFor(() => !!document.querySelector('[data-bulk-toast] [data-toast-undo]'))
    expect((await db.tasks.get(id))!.completed_at).not.toBeNull()
  })

  it('Select tasks in the bar\'s menu shows every checkbox without a tick; Done hides them and keeps the ticks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    await createTask({ title: 'One' })
    await createTask({ title: 'Two' })
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    mounted.push(r)
    await waitFor(() => !!document.querySelector('[data-phone-bar] [data-inbox-menu]'))
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-phone-bar] [data-inbox-menu]')!.click() })
    await waitFor(() => !!document.querySelector('[data-phone-item="select"]'))
    await act(async () => { document.querySelector<HTMLElement>('[data-phone-item="select"]')!.click() })
    await waitFor(() => document.querySelectorAll('[data-tick]').length === 2)
    expect(document.querySelectorAll('[data-ticked]')).toHaveLength(0)
    await act(async () => { document.querySelector<HTMLInputElement>('[data-tick]')!.click() })
    await waitFor(() => document.querySelectorAll('[data-ticked]').length === 1)
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-select-done]')!.click() })
    // Only the ticked row keeps its box; the others go back to the completion circle.
    await waitFor(() => [...document.querySelectorAll('[data-tick]')].filter((i) => i.closest('label')!.className.includes('inline-flex')).length === 1)
    expect(document.querySelectorAll('[data-ticked]')).toHaveLength(1)
    expect(document.querySelector('[data-selection-bar]')).toBeTruthy()
  })
})

describe('rows that never swipe', () => {
  it('a viewer\'s row and a card take no swipe', async () => {
    const id = await createTask({ title: 'Shared' })
    const task = (await db.tasks.get(id))!
    const r = await render(<ul>
      <TaskRow task={task} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} swipe readOnly />
      <TaskRow task={task} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} swipe shape="card" />
    </ul>)
    for (const li of r.container.querySelectorAll('li')) expect(li.hasAttribute('data-swipeable')).toBe(false)
    await r.unmount()
  })
})
