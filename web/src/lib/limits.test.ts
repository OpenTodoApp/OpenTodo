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
})
