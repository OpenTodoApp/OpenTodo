// @vitest-environment happy-dom
// Drag a task to another day in Upcoming (OpenSpec change upcoming-drag): the day's
// group rings, no drop line, the date moves keeping its time with an Undo toast;
// a touch drag starts after the hold; Escape changes nothing.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import type { Task, User } from '../lib/types'
import { render, waitFor } from '../ui/test-utils'
import { hideBulkToast } from './bulk/toastStore'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 21, 10, 0))
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  resetPanel()
  hideBulkToast()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

const shell = async () => { navigate({ view: 'upcoming' }); return render(<Shell user={user} onLogout={() => {}} />) }
const row = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!
const day = (date: string) => document.querySelector<HTMLElement>(`[data-task-drop="day:${date}"]`)
const toast = () => document.querySelector('[data-bulk-toast]')?.textContent ?? ''
const task = async (id: string) => (await db.tasks.get(id)) as Task

/** Press on `el`, move over `over`, then release there (or press Escape first). */
async function drag(el: Element, over: Element, opts: { escape?: boolean; touch?: boolean } = {}) {
  document.elementFromPoint = () => over
  const pointerType = opts.touch ? 'touch' : 'mouse'
  await act(async () => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType, button: 0, clientX: 10, clientY: 10 }))
  })
  if (opts.touch) await waitFor(() => !!el.closest('li')?.hasAttribute('data-touch-hold'), 'the hold to arm')
  await act(async () => {
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType, clientX: 200, clientY: 120 }))
  })
  const active = over.closest('[data-task-drop]')?.hasAttribute('data-drop-active') ?? false
  const line = !!document.querySelector('[data-drop-indicator]')
  await act(async () => {
    if (opts.escape) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType, clientX: 200, clientY: 120 }))
  })
  return { active, line }
}

describe('drag a task to another day in Upcoming', () => {
  it('drops under another day: the date moves, the time stays, with Undo', async () => {
    const id = await createTask({ title: 'Dentist', due: { date: '2026-10-22', time: '09:30' } })
    await createTask({ title: 'Groceries', due: { date: '2026-10-24' } })
    const r = await shell()
    await waitFor(() => !!row(id) && !!day('2026-10-24'))
    const { active, line } = await drag(row(id), day('2026-10-24')!)
    expect([active, line]).toEqual([true, false])
    await waitFor(() => toast().includes('Date changed'))
    expect(toast()).toContain('Undo')
    expect((await task(id)).due).toEqual({ date: '2026-10-24', time: '09:30' })
    await r.unmount()
  })

  it('on a touch screen the drag starts after the hold', async () => {
    const id = await createTask({ title: 'Call Ada', due: { date: '2026-10-22' } })
    await createTask({ title: 'Groceries', due: { date: '2026-10-24' } })
    const r = await shell()
    await waitFor(() => !!row(id) && !!day('2026-10-24'))
    await drag(row(id), day('2026-10-24')!, { touch: true })
    await waitFor(() => toast().includes('Date changed'))
    expect((await task(id)).due).toEqual({ date: '2026-10-24' })
    await r.unmount()
  })

  it('Escape cancels and nothing moves', async () => {
    const id = await createTask({ title: 'Stay', due: { date: '2026-10-22' } })
    await createTask({ title: 'Groceries', due: { date: '2026-10-24' } })
    const r = await shell()
    await waitFor(() => !!row(id) && !!day('2026-10-24'))
    await drag(row(id), day('2026-10-24')!, { escape: true })
    await waitFor(() => !document.querySelector('[data-drag-ghost]'), 'the drag ended')
    expect((await task(id)).due).toEqual({ date: '2026-10-22' })
    await r.unmount()
  })
})
