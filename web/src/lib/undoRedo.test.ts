// @vitest-environment happy-dom
// Multi-step undo and redo (OpenSpec change undo-redo-history, #1488): the local batch
// log becomes real undo and redo stacks. D4 (clock bookkeeping) is the risk: undoing our
// own later change to a field must still let us undo an earlier change to the same field.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { applyOps, createTask, mutate, resetDeviceId } from './ops'
import { applyBatch, redoBatch, undoBatch } from './undo'

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

  it('skips the earlier batch when the field was changed by hand between the two batches', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    const b1 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action' }))!
    // A hand edit between the two batches: the chain is broken.
    await mutate('task', id, { priority: 3 })
    const b2 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 4 } }], { source: 'action' }))!
    expect((await db.tasks.get(id))!.priority).toBe(4)

    const r2 = await undoBatch(b2.id)
    expect(r2.restored).toBe(1)
    expect((await db.tasks.get(id))!.priority).toBe(3)

    // B1 no longer owns the field (the hand edit sits on top), so undoing it is skipped
    // and the hand edit's value is kept, not overwritten back to 1.
    const r1 = await undoBatch(b1.id)
    expect(r1.restored).toBe(0)
    expect(r1.skipped).toEqual(['T'])
    expect((await db.tasks.get(id))!.priority).toBe(3)
  })

  it('skips the earlier batch when another device changed the field between the two batches', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    const b1 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action' }))!
    // Another device sets priority to 3 with a later clock, so it wins.
    await applyOps([{ id: 'remote', entity: 'task', entityId: id, field: 'priority', value: 3, ts: Date.now() + 10_000_000, device: 'other' }])
    expect((await db.tasks.get(id))!.priority).toBe(3)
    const b2 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 4 } }], { source: 'action' }))!

    const r2 = await undoBatch(b2.id)
    expect(r2.restored).toBe(1)
    expect((await db.tasks.get(id))!.priority).toBe(3)

    const r1 = await undoBatch(b1.id)
    expect(r1.restored).toBe(0)
    expect(r1.skipped).toEqual(['T'])
    expect((await db.tasks.get(id))!.priority).toBe(3)
  })
})

describe('redo', () => {
  it('apply, undo, redo returns the applied value', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    const b = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action' }))!
    await undoBatch(b.id)
    expect((await db.tasks.get(id))!.priority).toBe(1)
    const r = await redoBatch(b.id)
    expect(r.restored).toBe(1)
    expect(r.skipped).toEqual([])
    expect((await db.tasks.get(id))!.priority).toBe(2)
    // Redone, it can be undone again.
    await undoBatch(b.id)
    expect((await db.tasks.get(id))!.priority).toBe(1)
  })

  it('undo two then redo two restores both, in original order', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    const b1 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action' }))!
    const b2 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 3 } }], { source: 'action' }))!
    await undoBatch(b2.id)
    await undoBatch(b1.id)
    expect((await db.tasks.get(id))!.priority).toBe(1)
    await redoBatch(b1.id)
    expect((await db.tasks.get(id))!.priority).toBe(2)
    await redoBatch(b2.id)
    expect((await db.tasks.get(id))!.priority).toBe(3)
  })

  it('a new recorded action clears the redo stack (D3)', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    const b = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action' }))!
    await undoBatch(b.id)
    expect((await db.assistantUndo.get(b.id))).toBeTruthy()
    // A new action drops the undone batch ahead; redo is no longer possible.
    await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 4 } }], { source: 'action' })
    expect(await db.assistantUndo.get(b.id)).toBeUndefined()
    const r = await redoBatch(b.id)
    expect(r.restored).toBe(0)
  })

  it('a rapid second undo of the same batch does not overwrite its redo payload', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    const b = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action' }))!
    // Two undos fired back-to-back, before the first records undone_at.
    const [r1, r2] = await Promise.all([undoBatch(b.id), undoBatch(b.id)])
    expect(r1.restored + r2.restored).toBe(1) // one did the work, the other a clean no-op
    expect((await db.tasks.get(id))!.priority).toBe(1)
    // The redo payload survives, so redo still works.
    const r = await redoBatch(b.id)
    expect(r.restored).toBe(1)
    expect((await db.tasks.get(id))!.priority).toBe(2)
  })

  it('redo skips a field changed by hand since the undo', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    const b = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action' }))!
    await undoBatch(b.id) // priority back to 1
    // The user sets it to 3 by hand (not through the undo stack).
    await mutate('task', id, { priority: 3 })
    const r = await redoBatch(b.id)
    expect(r.skipped).toEqual(['T'])
    expect((await db.tasks.get(id))!.priority).toBe(3)
  })
})

// Keyboard and palette steps read the stack's top from a live query, which lags a fast
// second press (security read of #1616): both presses name the same batch. With `latest`
// the step takes the top as it stands when it runs, so the second press reverses the next
// batch instead of doing nothing; the toast's own button keeps its exact batch.
describe('a fast second press reads the stack as it stands', () => {
  it('two fast undos of the same stale top undo two batches, newest first', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    const b1 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action', label: 'raise to 2' }))!
    const b2 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 3 } }], { source: 'action', label: 'raise to 3' }))!
    // Both presses saw b2 on top before the first one recorded its undo.
    const [r1, r2] = await Promise.all([undoBatch(b2.id, { latest: true }), undoBatch(b2.id, { latest: true })])
    expect([r1.id, r2.id]).toEqual([b2.id, b1.id])
    expect([r1.restored, r2.restored]).toEqual([1, 1])
    expect((await db.tasks.get(id))!.priority).toBe(1)
  })

  it('two fast redos of the same stale top redo two batches, in original order', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    const b1 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action' }))!
    const b2 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 3 } }], { source: 'action' }))!
    await undoBatch(b2.id)
    await undoBatch(b1.id)
    // b1 was undone last, so both presses saw it on top of the redo stack.
    const [r1, r2] = await Promise.all([redoBatch(b1.id, { latest: true }), redoBatch(b1.id, { latest: true })])
    expect([r1.id, r2.id]).toEqual([b1.id, b2.id])
    expect((await db.tasks.get(id))!.priority).toBe(3)
  })

  it('without latest an already reversed batch stays a no-op (the toast button)', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    const b1 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action' }))!
    const b2 = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 3 } }], { source: 'action' }))!
    await undoBatch(b2.id)
    const again = await undoBatch(b2.id)
    expect(again.restored).toBe(0)
    expect((await db.tasks.get(id))!.priority).toBe(2)
    expect((await db.assistantUndo.get(b1.id))!.undone_at).toBeUndefined()
  })

  it('names the step it reversed', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    const b = (await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action', label: 'Priority changed' }))!
    expect(await undoBatch(b.id)).toMatchObject({ id: b.id, label: 'Priority changed' })
    expect(await redoBatch(b.id)).toMatchObject({ id: b.id, label: 'Priority changed' })
  })
})
