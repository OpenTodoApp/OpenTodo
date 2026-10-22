// @vitest-environment happy-dom
// The completion sequence (OpenSpec change motion-v2, task-list-presentation
// "Completion feedback", design D2, D3): the op is written at once, the list keeps a
// departing row for the moment that nothing can target, a repeating task stays and
// rolls, and Undo during the moment keeps the row in place.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import { flush, render } from '../ui/test-utils'
import { undoToast } from './bulk/UndoToast'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { departures$, resetDepartures } from './motion'
import { resetPanel } from './panel'
import { installShortcutDispatcher } from './shortcuts'
import { selectTask } from './signals'
import { TaskListView } from './TaskListView'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  setCurrentUserId('me')
  resetPanel()
  resetDepartures()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
})
afterEach(() => { vi.unstubAllGlobals(); hideBulkToast(); resetPanel(); resetDepartures(); document.body.innerHTML = '' })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 10) await flush(10)
  expect(ok()).toBe(true)
}
const row = (c: HTMLElement, title: string) => [...c.querySelectorAll<HTMLElement>('[data-task-id]')].find((li) => li.textContent?.includes(title))
const ghost = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-departing]')
const press = (key: string) => act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })
const complete = (li: HTMLElement) => act(async () => { li.querySelector<HTMLButtonElement>('button[aria-label^="Complete"]')!.click() })

describe('departing rows', () => {
  it('the completion is in the database before any timer of the sequence fires', async () => {
    const id = await createTask({ title: 'Pay rent' })
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!row(r.container, 'Pay rent'))
    await complete(row(r.container, 'Pay rent')!)
    // Written while the sequence still runs: no timer of the moment has fired yet.
    for (let i = 0; i < 100 && !(await db.tasks.get(id))?.completed_at; i++) await flush(1)
    expect((await db.tasks.get(id))!.completed_at).not.toBeNull()
    expect(departures$().get(id)).toBe('leave')
    await r.unmount()
  })

  it('keeps the row as a departing row that is not counted, selected or a drop target, then removes it', async () => {
    await createTask({ title: 'Pay rent' })
    await createTask({ title: 'Call mum' })
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!row(r.container, 'Pay rent'))
    await complete(row(r.container, 'Pay rent')!)
    await waitFor(() => !!ghost(r.container))
    const g = ghost(r.container)!
    expect(g.textContent).toContain('Pay rent')
    expect(g.getAttribute('aria-hidden')).toBe('true')
    expect(g.hasAttribute('inert')).toBe(true)
    expect(g.hasAttribute('data-drop-target')).toBe(false)
    expect(g.hasAttribute('data-draggable')).toBe(false)
    // Only the open task is a row of the list.
    expect([...r.container.querySelectorAll('[data-task-id]')].map((li) => li.textContent)).toEqual([expect.stringContaining('Call mum')])
    await waitFor(() => !ghost(r.container), 1500)
    await r.unmount()
  })

  it('three completions by key in a row: each written in order, the cursor moving on at once', async () => {
    const a = await createTask({ title: 'Alpha' })
    const b = await createTask({ title: 'Bravo' })
    const c = await createTask({ title: 'Charlie' })
    await createTask({ title: 'Delta' })
    const probe = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!row(probe.container, 'Delta'))
    const order = [...probe.container.querySelectorAll<HTMLElement>('[data-task-id]')].map((li) => li.dataset.taskId)
    await probe.unmount()
    const first = order[0]!
    // The list takes the task to select when it mounts.
    selectTask.set(first)
    const release = installShortcutDispatcher()
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => r.container.querySelector('[data-task-id][aria-current]')?.getAttribute('data-task-id') === first)
    for (let i = 0; i < 3; i++) {
      const current = r.container.querySelector<HTMLElement>('[data-task-id][aria-current]')!.dataset.taskId
      await press('c')
      // The cursor is on the next row before the departing one has left.
      await waitFor(() => r.container.querySelector('[data-task-id][aria-current]')?.getAttribute('data-task-id') !== current, 300)
    }
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length === 1)
    const done = await Promise.all(order.slice(0, 3).map((id) => db.tasks.get(id!)))
    expect(done.every((t) => t!.completed_at)).toBe(true)
    const ops = (await db.outbox.toArray()).filter((o) => o.field === 'completed_at' && o.value !== null).map((o) => o.entityId)
    expect(ops).toEqual(order.slice(0, 3))
    expect(new Set([a, b, c])).toEqual(new Set(order.slice(0, 3)))
    await r.unmount()
    release()
  })

  it('a repeating task stays in the list, rolls to its next date and is marked rolled', async () => {
    const project = await createProject({ name: 'Home' })
    await createTask({ title: 'Water plants', project_id: project, due: { date: '2026-10-19' }, recurrence: 'every monday' })
    const r = await render(<TaskListView route={{ view: 'project', id: project }} />)
    await waitFor(() => !!row(r.container, 'Water plants'))
    await complete(row(r.container, 'Water plants')!)
    await waitFor(() => !!r.container.querySelector('[data-rolled]'))
    expect(ghost(r.container)).toBeNull()
    expect(row(r.container, 'Water plants')).toBeTruthy()
    await r.unmount()
  })

  for (const ms of [50, 200, 450]) {
    it(`Undo ${ms} ms after completing keeps the row in place, offline`, async () => {
      const id = await createTask({ title: 'Pay rent' })
      const r = await render(<TaskListView route={{ view: 'inbox' }} />)
      await waitFor(() => !!row(r.container, 'Pay rent'))
      await complete(row(r.container, 'Pay rent')!)
      await waitFor(() => !!bulkToast()?.undoId)
      await flush(ms)
      await act(async () => { await undoToast(bulkToast()!.undoId!) })
      expect((await db.tasks.get(id))!.completed_at).toBeNull()
      await waitFor(() => !!row(r.container, 'Pay rent') && !ghost(r.container))
      // The reopening is queued after the completion.
      const ops = (await db.outbox.toArray()).filter((o) => o.entityId === id && o.field === 'completed_at').slice(-2)
      expect(ops[0].value).not.toBeNull()
      expect(ops[1].value).toBeNull()
      await r.unmount()
    })
  }
})
