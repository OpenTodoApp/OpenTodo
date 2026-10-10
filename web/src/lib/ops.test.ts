import { beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from './db'
import { applyOps, createTask, getDeviceId, mutate, resetDeviceId, updateTask } from './ops'
import { wins } from './hlc'
import type { Op } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`test-${Date.now()}-${n++}`)
  resetDeviceId()
})

const op = (partial: Partial<Op> & Pick<Op, 'field' | 'value' | 'ts' | 'device'>): Op => ({
  id: crypto.randomUUID(), entity: 'task', entityId: 't1', ...partial,
})

describe('applyOps', () => {
  it('converges to the same state regardless of delivery order', async () => {
    const ops = [
      op({ field: 'title', value: 'old', ts: 100, device: 'A' }),
      op({ field: 'title', value: 'new', ts: 200, device: 'B' }),
      op({ field: 'priority', value: 1, ts: 150, device: 'A' }),
      op({ field: 'priority', value: 2, ts: 150, device: 'B' }),
    ]
    const states: string[] = []
    for (const order of [[0, 1, 2, 3], [3, 2, 1, 0], [1, 3, 0, 2]]) {
      const db = useDatabase(`order-${order.join('')}-${Date.now()}`)
      for (const i of order) await applyOps([ops[i]])
      const t = await db.tasks.get('t1')
      states.push(JSON.stringify({ title: t?.title, priority: t?.priority }))
    }
    expect(new Set(states).size).toBe(1)
    expect(states[0]).toBe(JSON.stringify({ title: 'new', priority: 2 }))
  })

  it('is idempotent', async () => {
    const db = useDatabase(`idem-${Date.now()}`)
    const o = op({ field: 'title', value: 'x', ts: 1, device: 'A' })
    await applyOps([o])
    await applyOps([o, o])
    expect((await db.tasks.get('t1'))?.title).toBe('x')
    expect(await db.tasks.count()).toBe(1)
  })

  it('applies label ops into the labels table with defaults', async () => {
    const db = useDatabase(`label-${Date.now()}`)
    await applyOps([
      { id: 'l1', entity: 'label', entityId: 'lab', field: 'name', value: 'errand', ts: 1, device: 'A' },
      { id: 'l2', entity: 'label', entityId: 'lab', field: 'color', value: '#ef4444', ts: 1, device: 'A' },
      { id: 'l3', entity: 'label', entityId: 'lab', field: 'name', value: 'stale', ts: 0, device: 'A' },
    ])
    const l = await db.labels.get('lab')
    expect(l).toMatchObject({ id: 'lab', name: 'errand', color: '#ef4444', position: 0, deleted_at: null })
    expect(await db.tasks.count()).toBe(0)
  })

  it('skips ops for entities this build does not know instead of failing the batch', async () => {
    const db = useDatabase(`unknown-${Date.now()}`)
    await applyOps([
      { id: 'u1', entity: 'widget' as Op['entity'], entityId: 'w', field: 'name', value: 'x', ts: 1, device: 'A' },
      op({ field: 'title', value: 'kept', ts: 1, device: 'A' }),
    ])
    expect((await db.tasks.get('t1'))?.title).toBe('kept')
    expect(await db.labels.count()).toBe(0)
  })

  it('keeps a newer local edit when an older remote op arrives late', async () => {
    const db = useDatabase(`late-${Date.now()}`)
    const id = await createTask({ title: 'local title' })
    const local = await db.tasks.get(id)
    const remote = op({ entityId: id, field: 'title', value: 'stale remote', ts: local!._clock.title.ts - 10, device: 'remote' })
    await applyOps([remote])
    expect((await db.tasks.get(id))?.title).toBe('local title')
  })
})

describe('mutate', () => {
  it('writes locally and enqueues one op per field with increasing timestamps', async () => {
    const db = useDatabase(`mutate-${Date.now()}`)
    const id = await createTask({ title: 'a' })
    await updateTask(id, { title: 'b', priority: 1 })
    const outbox = await db.outbox.toArray()
    const titleOps = outbox.filter((o) => o.field === 'title')
    expect(titleOps).toHaveLength(2)
    expect(titleOps[1].ts).toBeGreaterThan(titleOps[0].ts)
    expect((await db.tasks.get(id))?.priority).toBe(1)
    await mutate('task', id, { deleted_at: 5 })
    expect((await db.tasks.get(id))?.deleted_at).toBe(5)
  })
})

describe('getDeviceId', () => {
  it('returns one id even when called concurrently on first launch', async () => {
    useDatabase(`device-${Date.now()}`)
    resetDeviceId()
    const ids = await Promise.all([getDeviceId(), getDeviceId(), getDeviceId()])
    expect(new Set(ids).size).toBe(1)
    resetDeviceId()
    expect(await getDeviceId()).toBe(ids[0])
  })
})

describe('wins', () => {
  it('breaks timestamp ties by device id', () => {
    expect(wins(5, 'B', { ts: 5, device: 'A' })).toBe(true)
    expect(wins(5, 'A', { ts: 5, device: 'B' })).toBe(false)
    expect(wins(4, 'Z', { ts: 5, device: 'A' })).toBe(false)
    expect(wins(1, 'A')).toBe(true)
  })
})
