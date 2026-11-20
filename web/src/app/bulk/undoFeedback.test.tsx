// @vitest-environment happy-dom
// Feedback after an undo or redo once the toast is gone (OpenSpec undo-redo-history D7,
// #1488): a keyboard or palette undo past the toast's deadline must still say what it did,
// with no button and no new deadline, so the change is never silent.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createTask, resetDeviceId } from '../../lib/ops'
import { applyBatch } from '../../lib/undo'
import { redoToast, undoToast } from './UndoToast'
import { bulkToast, hideBulkToast } from './toastStore'

let n = 0
beforeEach(() => {
  useDatabase(`undo-fb-${Date.now()}-${n++}`)
  resetDeviceId()
  hideBulkToast()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
})
afterEach(() => { hideBulkToast(); vi.unstubAllGlobals() })

describe('undo/redo feedback when the toast is gone (#1488)', () => {
  it('shows a button-less message for a keyboard undo and redo past the toast deadline', async () => {
    const id = await createTask({ title: 'Pay rent', priority: 1 })
    const b = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action', label: 'raise priority' }))!
    hideBulkToast() // the undo toast has expired
    expect(bulkToast()).toBeNull()

    await undoToast(b.id)
    const after = bulkToast()
    // The message names what was undone (undo-history "Descriptive feedback").
    expect(after?.label).toBe('Undone: raise priority.')
    expect(after?.undoId).toBeFalsy() // no Undo button
    expect(after?.redoId).toBeFalsy() // no Redo button — no new deadline for action
    expect((await db.tasks.get(id))!.priority).toBe(1)

    hideBulkToast()
    await redoToast(b.id)
    expect(bulkToast()?.label).toBe('Redone: raise priority.')
    expect(bulkToast()?.undoId).toBeFalsy()
    expect((await db.tasks.get(id))!.priority).toBe(2)
  })

  it('does not double a label’s own full stop, and keeps the count for an unnamed batch', async () => {
    const id = await createTask({ title: 'Pay rent', priority: 1 })
    const named = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action', label: 'Moved to Done.' }))!
    hideBulkToast()
    await undoToast(named.id)
    expect(bulkToast()?.label).toBe('Undone: Moved to Done.')

    const unnamed = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 3 } }], { source: 'action' }))!
    hideBulkToast()
    await undoToast(unnamed.id)
    expect(bulkToast()?.label).toBe('Undone.')
  })

  it('a fast second keyboard undo reverses the next batch and names it', async () => {
    const id = await createTask({ title: 'Pay rent', priority: 1 })
    await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action', label: 'first change' })
    const b2 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 3 } }], { source: 'action', label: 'second change' }))!
    hideBulkToast()
    // Both presses read b2 as the top before the live query caught up.
    await Promise.all([undoToast(b2.id, { latest: true }), undoToast(b2.id, { latest: true })])
    expect((await db.tasks.get(id))!.priority).toBe(1)
    // The second press's message lands on the toast the first opened; the toast shows `result ?? label`.
    const shown = bulkToast()
    expect(shown?.result ?? shown?.label).toBe('Undone: first change.')
  })
})
