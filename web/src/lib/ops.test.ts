import { beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from './db'
import {
  applyOps, createSubtask, createTask, deleteTask, getDeviceId, mutate, resetDeviceId, setTaskCompleted, setTaskParent, updateTask,
} from './ops'
import { wins } from './hlc'
import { parentReadyToComplete } from './subtasks'
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

  it('round-trips estimate_minutes and labels through createTask, the outbox and applyOps', async () => {
    const db = useDatabase(`estimate-${Date.now()}`)
    const plain = await createTask({ title: 'no estimate' })
    expect((await db.tasks.get(plain))?.estimate_minutes).toBeNull()
    const id = await createTask({ title: 'Write report', estimate_minutes: 45, labels: ['call'] })
    const row = await db.tasks.get(id)
    expect(row?.estimate_minutes).toBe(45)
    expect(row?.labels).toEqual(['call'])
    const queued = (await db.outbox.toArray()).find((o) => o.entityId === id && o.field === 'estimate_minutes')
    expect(queued?.value).toBe(45)
    // The same op arriving from another device applies to a fresh row with the default elsewhere.
    const other = useDatabase(`estimate-remote-${Date.now()}`)
    await applyOps([{ ...queued!, device: 'remote' }])
    const remote = await other.tasks.get(id)
    expect(remote?.estimate_minutes).toBe(45)
    expect(remote?.priority).toBe(4)
  })
})

describe('subtasks', () => {
  async function tree() {
    const db = useDatabase(`sub-${Date.now()}-${n++}`)
    resetDeviceId()
    const trip = await createTask({ title: 'Plan trip', project_id: 'travel' })
    const flights = await createSubtask(trip, 'Flights')
    const hotel = await createSubtask(trip, 'Hotel')
    const compare = await createSubtask(hotel, 'Compare prices')
    return { db, trip, flights, hotel, compare }
  }

  it('subtask inherits project', async () => {
    const { db, trip, hotel } = await tree()
    const t = (await db.tasks.get(hotel))!
    expect(t.project_id).toBe('travel')
    expect(t.parent_id).toBe(trip)
    expect(t.priority).toBe(4)
    expect(t.due).toBeNull()
    expect(t.completed_at).toBeNull()
  })

  it('setTaskParent rejects self, a descendant and a different-project parent', async () => {
    const { db, trip, flights, hotel, compare } = await tree()
    const other = await createTask({ title: 'Elsewhere', project_id: 'home' })
    await expect(setTaskParent(trip, trip)).rejects.toThrow()
    await expect(setTaskParent(trip, compare)).rejects.toThrow(/descendant/)
    await expect(setTaskParent(hotel, other)).rejects.toThrow(/same project/)
    expect((await db.tasks.get(trip))?.parent_id).toBeNull()
    expect((await db.tasks.get(hotel))?.parent_id).toBe(trip)
    // A legal move places the task last among its new siblings.
    await setTaskParent(hotel, flights)
    const moved = (await db.tasks.get(hotel))!
    expect(moved.parent_id).toBe(flights)
    await setTaskParent(compare, trip)
    const c = (await db.tasks.get(compare))!
    expect(c.parent_id).toBe(trip)
    expect(c.position).toBeGreaterThan((await db.tasks.get(flights))!.position)
    await setTaskParent(compare, null)
    expect((await db.tasks.get(compare))?.parent_id).toBeNull()
  })

  it('moving a parent to another project moves the subtree; moving a child detaches it', async () => {
    const { db, trip, flights, hotel, compare } = await tree()
    await updateTask(trip, { project_id: 'later' })
    for (const id of [trip, flights, hotel, compare]) expect((await db.tasks.get(id))?.project_id).toBe('later')
    expect((await db.tasks.get(compare))?.parent_id).toBe(hotel)
    await updateTask(compare, { project_id: null })
    const c = (await db.tasks.get(compare))!
    expect(c.project_id).toBeNull()
    expect(c.parent_id).toBeNull()
  })

  it('complete cascades', async () => {
    const { db, trip, flights, hotel, compare } = await tree()
    await setTaskCompleted(flights, true)
    await setTaskCompleted(trip, true)
    for (const id of [trip, flights, hotel, compare]) expect((await db.tasks.get(id))?.completed_at).not.toBeNull()
    const ops = (await db.outbox.toArray()).filter((o) => o.field === 'completed_at' && o.value !== null)
    expect(ops).toHaveLength(4) // one per task: flights alone, then trip + hotel + compare
  })

  it('reopen does not cascade', async () => {
    const { db, trip, flights, hotel, compare } = await tree()
    await setTaskCompleted(trip, true)
    await setTaskCompleted(trip, false)
    expect((await db.tasks.get(trip))?.completed_at).toBeNull()
    for (const id of [flights, hotel, compare]) expect((await db.tasks.get(id))?.completed_at).not.toBeNull()
  })

  it('offers to complete the parent only when its last open subtask is completed', async () => {
    const { trip, flights, hotel, compare } = await tree()
    await setTaskCompleted(flights, true)
    expect(await parentReadyToComplete(flights)).toBeNull()
    await setTaskCompleted(compare, true)
    expect((await parentReadyToComplete(compare))?.id).toBe(hotel)
    await setTaskCompleted(hotel, true)
    expect((await parentReadyToComplete(hotel))?.id).toBe(trip)
  })

  it('delete cascades', async () => {
    const { db, trip, flights, hotel, compare } = await tree()
    const keep = await createTask({ title: 'Unrelated', project_id: 'travel' })
    await deleteTask(trip)
    for (const id of [trip, flights, hotel, compare]) expect((await db.tasks.get(id))?.deleted_at).not.toBeNull()
    expect((await db.tasks.get(keep))?.deleted_at).toBeNull()
  })

  it('concurrent delete and edit keeps tombstone', async () => {
    const { db, trip, hotel } = await tree()
    // Device B renamed Hotel at the same moment device A deleted the subtree.
    const before = (await db.tasks.get(hotel))!
    await deleteTask(trip)
    const after = (await db.tasks.get(hotel))!
    await applyOps([op({ entityId: hotel, field: 'title', value: 'Hotel near the beach', ts: after._clock.deleted_at.ts, device: 'B' })])
    const t = (await db.tasks.get(hotel))!
    expect(t.deleted_at).toBe(after.deleted_at)
    expect(t.title).toBe('Hotel near the beach')
    expect(before.deleted_at).toBeNull()
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
