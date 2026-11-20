// @vitest-environment happy-dom
// Multi-step undo and redo (OpenSpec change undo-redo-history, #1488): the local batch
// log becomes real undo and redo stacks. D4 (clock bookkeeping) is the risk: undoing our
// own later change to a field must still let us undo an earlier change to the same field.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { createTask, resetDeviceId } from './ops'
import { applyBatch, undoBatch } from './undo'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('D4: undo our later change, then the earlier one', () => {
  it('undoes the later batch then the earlier batch of the same field, neither wrongly skipped', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    const b1 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action' }))!
    const b2 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 3 } }], { source: 'action' }))!
    expect((await db.tasks.get(id))!.priority).toBe(3)

    const r2 = await undoBatch(b2.id)
    expect(r2.restored).toBe(1)
    expect((await db.tasks.get(id))!.priority).toBe(2)

    const r1 = await undoBatch(b1.id)
    expect(r1.skipped).toEqual([])
    expect(r1.restored).toBe(1)
    expect((await db.tasks.get(id))!.priority).toBe(1)
  })
})
