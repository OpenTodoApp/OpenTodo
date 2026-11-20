// @vitest-environment happy-dom
// The undo/redo history controller (OpenSpec change undo-redo-history, #1488): the batch
// log read as two stacks. Undo takes the most recent batch not yet undone; redo the one
// undone most recently; a new action clears the redo stack.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, type AssistantUndo } from './db'
import { createTask, mutate, resetDeviceId } from './ops'
import { applyBatch } from './undo'
import { runRedo, runUndo, topRedo, topUndo } from './undoHistory'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
})
afterEach(() => { vi.unstubAllGlobals() })

const entry = (over: Partial<AssistantUndo>): AssistantUndo =>
  ({ id: 'x', created_at: 0, count: 1, inverse: [], clocks: [], source: 'action', ...over })

describe('the stack tops', () => {
  it('topUndo is the most recent batch not yet undone', () => {
    const entries = [
      entry({ id: 'a', created_at: 10 }),
      entry({ id: 'b', created_at: 30, label: 'B' }),
      entry({ id: 'c', created_at: 20, undone_at: 99 }), // already undone: not an undo candidate
    ]
    expect(topUndo(entries)).toEqual({ id: 'b', label: 'B', count: 1 })
  })

  it('topRedo is the batch undone most recently; null when none is undone', () => {
    expect(topRedo([entry({ id: 'a', created_at: 10 })])).toBeNull()
    const entries = [
      entry({ id: 'a', created_at: 10, undone_at: 50 }),
      entry({ id: 'b', created_at: 20, undone_at: 70 }),
    ]
    expect(topRedo(entries)).toEqual({ id: 'b', count: 1 })
  })

  it('both are null on an empty history', () => {
    expect(topUndo([])).toBeNull()
    expect(topRedo([])).toBeNull()
  })
})

describe('runUndo / runRedo over the live log', () => {
  it('undo reverses the most recent batch, redo re-applies it', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action', label: 'raise priority' })
    expect((await db.tasks.get(id))!.priority).toBe(2)

    const u = await runUndo()
    expect(u?.restored).toBe(1)
    expect(u?.step.label).toBe('raise priority')
    expect((await db.tasks.get(id))!.priority).toBe(1)
    expect(await runUndo()).toBeNull() // nothing left to undo

    const r = await runRedo()
    expect(r?.restored).toBe(1)
    expect((await db.tasks.get(id))!.priority).toBe(2)
    expect(await runRedo()).toBeNull()
  })

  it('undoes in reverse order (newest first), then redoes in order', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action' })
    await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 3 } }], { source: 'action' })

    await runUndo() // undoes the priority-3 batch
    expect((await db.tasks.get(id))!.priority).toBe(2)
    await runUndo() // undoes the priority-2 batch
    expect((await db.tasks.get(id))!.priority).toBe(1)

    await runRedo() // re-applies priority-2
    expect((await db.tasks.get(id))!.priority).toBe(2)
    await runRedo() // re-applies priority-3
    expect((await db.tasks.get(id))!.priority).toBe(3)
  })

  it('a new action clears the redo stack', async () => {
    const id = await createTask({ title: 'T', priority: 1 })
    await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 2 } }], { source: 'action' })
    await runUndo()
    // A fresh edit while something is undone drops the redo stack (D3).
    await mutate('task', id, { priority: 4 })
    await applyBatch([{ entity: 'task', entityId: id, patch: { priority: 3 } }], { source: 'action' })
    expect(await runRedo()).toBeNull()
  })
})
