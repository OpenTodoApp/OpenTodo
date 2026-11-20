import { beforeEach, describe, expect, it } from 'vitest'
import { db, getMeta, setMeta, useDatabase } from './db'
import { heldCount, holdOps, requeueHeld } from './limits'
import type { Op } from './types'

const op = (id: string): Op => ({ id, entity: 'task', entityId: 't1', field: 'title', value: id, ts: 1, device: 'd' })

let n = 0
beforeEach(() => {
  useDatabase(`limits-${Date.now()}-${n++}`)
})

describe('held ops (client-sync-robustness)', () => {
  it('a hold that runs while held ops are requeued is not lost', async () => {
    await setMeta('heldOps', [op('a')])
    // Both start at once, as when a requeue and a limited exchange overlap.
    await Promise.all([requeueHeld(), holdOps([op('b')], [{ id: 'b', reason: 'limit_storage' }])])
    const outbox = (await db.outbox.toArray()).map((o) => o.id)
    const held = (await getMeta<Op[]>('heldOps', [])).map((o) => o.id)
    // Every op is either queued again or still held; none disappeared.
    expect([...outbox, ...held].sort()).toEqual(['a', 'b'])
    expect(await heldCount()).toBe(held.length)
  })

  it('requeues every held op once', async () => {
    await holdOps([op('a'), op('b')], [{ id: 'a', reason: 'limit_storage' }, { id: 'b', reason: 'limit_ops_hour' }])
    expect(await requeueHeld()).toBe(2)
    expect(await requeueHeld()).toBe(0)
    expect((await db.outbox.toArray()).map((o) => o.id).sort()).toEqual(['a', 'b'])
  })

  it('drops a held op whose field was written again; keeps one whose row is in the Trash (#1532)', async () => {
    const clock = (ts: number, device = 'd') => ({ ts, device })
    await db.tasks.bulkPut([
      { id: 't1', title: 'newer', _clock: { title: clock(5) } },
      { id: 't2', title: 'same', _clock: { title: clock(1) } },
      { id: 't3', title: 'gone', deleted_at: 9, _clock: { title: clock(1), deleted_at: clock(9) } },
    ] as never)
    const held = (id: string, entityId: string): Op => ({ ...op(id), entityId })
    await holdOps([held('a', 't1'), held('b', 't2'), held('c', 't3'), held('d', 'missing')], ['a', 'b', 'c', 'd'].map((id) => ({ id, reason: 'unknown_field' })))
    // t1's title has a newer write: a is dropped. t3 is in the Trash: c stays held. b and d go again.
    expect(await requeueHeld()).toBe(2)
    expect((await db.outbox.toArray()).map((o) => o.id).sort()).toEqual(['b', 'd'])
    expect((await getMeta<Op[]>('heldOps', [])).map((o) => o.id)).toEqual(['c'])
  })

  it('a held op of a trashed row is offered again once the row is restored', async () => {
    const clock = (ts: number, device = 'd') => ({ ts, device })
    await db.tasks.put({ id: 't1', title: 'edited', deleted_at: 9, _clock: { title: clock(1), deleted_at: clock(9) } } as never)
    await holdOps([op('a')], [{ id: 'a', reason: 'limit_storage' }])
    // In the Trash: nothing is offered, the change stays on the device.
    expect(await requeueHeld()).toBe(0)
    expect(await heldCount()).toBe(1)
    // Restored from the Trash: the edited title goes to the server.
    await db.tasks.update('t1', { deleted_at: null, _clock: { title: clock(1), deleted_at: clock(10) } } as never)
    expect(await requeueHeld()).toBe(1)
    expect((await db.outbox.toArray()).map((o) => o.id)).toEqual(['a'])
    expect(await heldCount()).toBe(0)
  })
})
