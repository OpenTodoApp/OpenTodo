// @vitest-environment happy-dom
// Move a task to another day in Upcoming (OpenSpec change upcoming-drag-day, tasks
// 2.1–2.4): the drop on a day group, the deadline, the same day, a viewer's task,
// Undo, and Shift+← / Shift+→.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { Task } from '../lib/types'
import { undoBatch } from '../lib/undo'
import { dropUndoable } from '../lib/undoActions'
import { key, render, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 5, 10, 0))
  useDatabase(`upcoming-drag-${Date.now()}-${n++}`)
  resetDeviceId()
})
afterEach(() => {
  vi.useRealTimers()
  resetPanel()
})

const row = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!
const day = (date: string) => document.querySelector<HTMLElement>(`[data-task-drop="day:${date}"]`)!
const task = async (id: string) => (await db.tasks.get(id)) as Task

/** Press on `el`, move over `over`, release there; reports whether the day group rang. */
async function drag(el: Element, over: Element) {
  document.elementFromPoint = () => over
  await act(async () => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 }))
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 120 }))
  })
  const active = over.closest('[data-task-drop]')?.hasAttribute('data-drop-active') ?? false
  await act(async () => {
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 120 }))
  })
  return active
}

describe('drag a task to another day in Upcoming', () => {
  it('a drop on another day moves the due date and keeps its time; Undo puts it back', async () => {
    const id = await createTask({ title: 'Dentist', due: { date: '2026-11-06', time: '09:30' } })
    const other = await createTask({ title: 'Gym', due: { date: '2026-11-08' } })
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => !!row(id) && !!day('2026-11-08'))
    // Over a row of the other day: the whole day group is the target.
    expect(await drag(row(id), row(other))).toBe(true)
    await waitFor(async () => (await task(id)).due?.date === '2026-11-08')
    expect((await task(id)).due).toEqual({ date: '2026-11-08', time: '09:30' })
    await r.unmount()
  })

  it('a task listed by its deadline moves its deadline, not a new due date', async () => {
    const id = await createTask({ title: 'Tax return', deadline: '2026-11-07' })
    await createTask({ title: 'Gym', due: { date: '2026-11-09' } })
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => !!row(id) && !!day('2026-11-09'))
    await drag(row(id), day('2026-11-09'))
    await waitFor(async () => (await task(id)).deadline === '2026-11-09')
    expect((await task(id)).due ?? null).toBeNull()
    await r.unmount()
  })

  it('a drop on its own day writes nothing', async () => {
    const id = await createTask({ title: 'Dentist', due: { date: '2026-11-06', time: '09:30' } })
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => !!row(id))
    await db.outbox.clear()
    await drag(row(id), day('2026-11-06'))
    expect(await db.outbox.count()).toBe(0)
    await r.unmount()
  })

  it("a viewer's task cannot be picked up, and a drop never moves it", async () => {
    const shared = await createProject({ name: 'Family' })
    await db.memberships.put({ projectId: shared, role: 'viewer', ownerId: 'someone', members: [] })
    const id = await createTask({ title: 'Recital', project_id: shared, due: { date: '2026-11-06' } })
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => !!row(id))
    expect(row(id).hasAttribute('data-draggable')).toBe(false)
    expect((await dropUndoable('day:2026-11-09', [id]))!.entry).toBeNull()
    expect((await task(id)).due).toEqual({ date: '2026-11-06' })
    await r.unmount()
  })

  it('the drop is one change with Undo', async () => {
    const id = await createTask({ title: 'Dentist', due: { date: '2026-11-06', time: '09:30' } })
    await db.outbox.clear()
    const r = (await dropUndoable('day:2026-11-10', [id]))!
    expect(r.label).toBe('Date changed')
    expect(await db.outbox.count()).toBe(1)
    await undoBatch(r.entry!.id)
    expect((await task(id)).due).toEqual({ date: '2026-11-06', time: '09:30' })
  })

  it('Shift+→ and Shift+← move the selected task a day, never before today', async () => {
    const id = await createTask({ title: 'Dentist', due: { date: '2026-11-06', time: '09:30' } })
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => !!row(id))
    await key(document.body, 'j')
    await key(document.body, 'ArrowRight', { shiftKey: true })
    await waitFor(async () => (await task(id)).due?.date === '2026-11-07')
    expect((await task(id)).due).toEqual({ date: '2026-11-07', time: '09:30' })
    await waitFor(() => row(id)?.closest('[data-task-drop="day:2026-11-07"]') !== null)
    await key(document.body, 'ArrowLeft', { shiftKey: true })
    await waitFor(async () => (await task(id)).due?.date === '2026-11-06')
    await r.unmount()
  })
})
