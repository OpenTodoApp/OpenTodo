// @vitest-environment happy-dom
// Single-action Undo (OpenSpec change ux-overhaul, task-list-presentation
// "Completion feedback" and "Single-action undo"): complete, delete, move, date
// change and park offer the same toast; Undo is an ordinary op, locally first, so
// it works offline and converges by last-writer-wins.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createSubtask, createTask, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import { click, flush, render } from '../ui/test-utils'
import { TOAST_MS, UndoToast, undoToast } from './bulk/UndoToast'
import { ACTION_TOAST_MS, bulkToast, hideBulkToast } from './bulk/toastStore'
import { PanelHost } from './PanelHost'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'
import { completeWithUndo, deleteWithUndo, moveWithUndo, parkWithUndo, setDueWithUndo } from './undoable'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  setCurrentUserId('me')
  resetPanel()
  // Offline throughout: nothing reaches a server, everything lands in the outbox.
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
})
afterEach(() => { vi.unstubAllGlobals(); hideBulkToast(); resetPanel(); document.body.innerHTML = '' })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const toast = () => document.querySelector('[data-bulk-toast]')
const opsFor = (id: string, field: string) => db.outbox.toArray().then((ops) => ops.filter((o) => o.entityId === id && o.field === field))

describe('single-action undo', () => {
  it('offline: completing then Undo reopens the task at once, queued as ordinary ops that converge on the open state', async () => {
    const id = await createTask({ title: 'Pay rent' })
    await completeWithUndo(id, true)
    expect((await db.tasks.get(id))!.completed_at).not.toBeNull()
    const offer = bulkToast()!
    expect(offer.label).toBe('Task completed')
    expect(offer.ttl).toBe(ACTION_TOAST_MS)
    expect(offer.undoId).toBeTruthy()

    await undoToast(offer.undoId!)
    expect((await db.tasks.get(id))!.completed_at).toBeNull()
    expect(bulkToast()!.result).toBe('Undone.')
    // Both edits are in the outbox in order; the later one wins everywhere (LWW).
    const ops = (await opsFor(id, 'completed_at')).slice(-2) // after the creation's own null
    expect(ops[0].value).not.toBeNull()
    expect(ops[1].value).toBeNull()
    expect(ops[1].ts).toBeGreaterThan(ops[0].ts)
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/sync'), expect.anything())
  })

  it('a completion that was changed again since is kept on Undo', async () => {
    const id = await createTask({ title: 'Pay rent' })
    await completeWithUndo(id, true)
    const undoId = bulkToast()!.undoId!
    await completeWithUndo(id, false)
    await completeWithUndo(id, true)
    await undoToast(undoId)
    expect((await db.tasks.get(id))!.completed_at).not.toBeNull()
    expect(bulkToast()!.result).toContain('Kept because')
  })

  it('delete then Undo brings the task back with its subtasks', async () => {
    const id = await createTask({ title: 'Renovate' })
    const sub = await createSubtask(id, 'Paint')
    await deleteWithUndo(id)
    expect((await db.tasks.get(id))!.deleted_at).not.toBeNull()
    expect((await db.tasks.get(sub))!.deleted_at).not.toBeNull()
    expect(bulkToast()!.label).toBe('Moved to Trash')
    await undoToast(bulkToast()!.undoId!)
    expect((await db.tasks.get(id))!.deleted_at).toBeNull()
    expect((await db.tasks.get(sub))!.deleted_at).toBeNull()
  })

  it('move, date change and park each offer Undo and come back', async () => {
    const home = await createProject({ name: 'Home' })
    const id = await createTask({ title: 'Buy paint', due: { date: '2026-10-20' } })

    expect(await moveWithUndo(id, home, 'Home')).toBe(id)
    expect((await db.tasks.get(id))!.project_id).toBe(home)
    expect(bulkToast()!.label).toBe('Moved to Home')
    await undoToast(bulkToast()!.undoId!)
    expect((await db.tasks.get(id))!.project_id).toBeNull()

    await setDueWithUndo(id, { date: '2026-10-25' })
    expect(bulkToast()!.label).toBe('Date changed')
    await undoToast(bulkToast()!.undoId!)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-20' })

    await parkWithUndo(id)
    expect(await db.tasks.get(id)).toMatchObject({ start: 'someday', due: null })
    expect(bulkToast()!.label).toBe('Moved to Someday')
    await undoToast(bulkToast()!.undoId!)
    expect(await db.tasks.get(id)).toMatchObject({ start: null, due: { date: '2026-10-20' } })
  })

  it('a new offer replaces the previous one', async () => {
    const a = await createTask({ title: 'A' })
    const b = await createTask({ title: 'B' })
    await completeWithUndo(a, true)
    const first = bulkToast()!.key
    await deleteWithUndo(b)
    expect(bulkToast()!.key).not.toBe(first)
    expect(bulkToast()!.label).toBe('Moved to Trash')
  })

  it('the list checkbox shows the toast with Undo, which reopens the row', async () => {
    const id = await createTask({ title: 'Pay rent' })
    const r = await render(<><TaskListView route={{ view: 'inbox' }} /><PanelHost /><UndoToast /></>)
    await waitFor(() => !!document.querySelector('[data-task-id]'))
    await click(document.querySelector('[data-task-id] button[aria-label^="Complete"]')!)
    await waitFor(() => !!toast())
    expect(toast()!.textContent).toContain('Task completed')
    expect(ACTION_TOAST_MS).toBeLessThan(TOAST_MS)
    await click([...toast()!.querySelectorAll('button')].find((b) => b.textContent === 'Undo')!)
    await waitFor(() => toast()?.textContent?.includes('Undone') ?? false)
    expect((await db.tasks.get(id))!.completed_at).toBeNull()
    await r.unmount()
  })
})
