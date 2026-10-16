// Habits on the data layer (OpenSpec change habits, design D1, D2): the two
// additive fields, the skip record and how it converges and counts.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { runFilter } from './filter'
import { habitStats } from './habits'
import { occurrenceId } from './ids'
import { applyOps, completeTask, createTask, getDeviceId, resetDeviceId, skipOccurrence, updateTask } from './ops'
import type { Op, Task } from './types'

let n = 0
const run = () => `${Date.now()}-${n++}`

async function use(name: string) {
  useDatabase(name)
  resetDeviceId()
  await getDeviceId()
}

async function outbox(): Promise<Op[]> {
  return (await db.outbox.toArray()).map(({ local: _local, ...op }) => op as Op)
}

async function syncAll(names: string[]) {
  const all: Op[] = []
  for (const name of names) {
    await use(name)
    all.push(...(await outbox()))
  }
  for (const name of names) {
    await use(name)
    await applyOps(all)
  }
}

async function records(seriesId: string): Promise<Task[]> {
  return db.tasks.filter((t) => t.series_id === seriesId && !t.deleted_at).toArray()
}

/** What Completed and a `completed` query list. */
async function completedIds(): Promise<string[]> {
  const all = await db.tasks.toArray()
  const r = runFilter('completed', all, { today: '2026-10-20', labels: [], projects: [] })
  return r.ok ? r.tasks.map((t) => t.id) : []
}

async function habit(rule: string, due: string): Promise<string> {
  const id = await createTask({ title: 'Stretch', due: { date: due }, recurrence: rule })
  await updateTask(id, { habit: true })
  return id
}

beforeEach(async () => {
  await use(`habits-${run()}`)
})

describe('habit and skipped fields', () => {
  it('a row stored before the fields reads false, and a remote habit op sets it', async () => {
    const id = await createTask({ title: 'Meditate', due: { date: '2026-10-14' }, recurrence: 'every day' })
    const row = (await db.tasks.get(id))!
    const { habit: _h, skipped: _s, ...old } = row
    await db.tasks.put(old as Task)
    const stored = (await db.tasks.get(id))!
    expect(stored.habit ?? false).toBe(false)
    expect(stored.skipped ?? false).toBe(false)
    await applyOps([{ id: 'r1', entity: 'task', entityId: id, field: 'habit', value: true, ts: Date.now() + 10_000, device: 'other' }])
    expect((await db.tasks.get(id))?.habit).toBe(true)
  })

  it('new tasks default to not a habit, not skipped', async () => {
    const id = await createTask({ title: 'Plain' })
    expect(await db.tasks.get(id)).toMatchObject({ habit: false, skipped: false })
  })
})

describe('skipping a habit', () => {
  it('writes the occurrence record marked skipped and moves the series, with nothing in Completed', async () => {
    const id = await habit('every day', '2026-10-14')
    expect(await skipOccurrence(id, { today: '2026-10-14' })).toBe(true)
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-15' })
    const recs = await records(id)
    expect(recs).toHaveLength(1)
    expect(recs[0]).toMatchObject({ id: occurrenceId(id, '2026-10-14'), skipped: true, series_id: id, due: { date: '2026-10-14' } })
    expect(recs[0].completed_at).toBeGreaterThan(0)
    expect(recs[0].habit).toBe(false)
    expect(await completedIds()).toEqual([])
  })

  it('a non-habit skip writes one op and no record', async () => {
    const id = await createTask({ title: 'Gym', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    const before = (await outbox()).length
    expect(await skipOccurrence(id, { today: '2026-10-12' })).toBe(true)
    const ops = (await outbox()).slice(before)
    expect(ops.map((o) => o.field)).toEqual(['due'])
    expect(await records(id)).toHaveLength(0)
  })

  it('completing a habit writes skipped: false on the record', async () => {
    const id = await habit('every day', '2026-10-14')
    const recordId = await completeTask(id, { today: '2026-10-14' })
    expect(await db.tasks.get(recordId!)).toMatchObject({ skipped: false })
    expect(await completedIds()).toEqual([recordId])
  })

  it('two devices skipping the same occurrence converge to one skipped record, one step ahead', async () => {
    const a = `A-${run()}`
    const b = `B-${run()}`
    await use(a)
    const id = await habit('every day', '2026-10-14')
    await syncAll([a, b])
    await use(a)
    await skipOccurrence(id, { today: '2026-10-14' })
    await use(b)
    await skipOccurrence(id, { today: '2026-10-14' })
    await syncAll([a, b])
    const snaps: string[] = []
    for (const dev of [a, b]) {
      await use(dev)
      const recs = await records(id)
      expect(recs).toHaveLength(1)
      expect(recs[0].skipped).toBe(true)
      expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-15' })
      snaps.push(JSON.stringify(await db.tasks.orderBy('id').toArray()))
    }
    expect(snaps[0]).toBe(snaps[1])
  })

  for (const order of ['complete then skip', 'skip then complete'] as const) {
    it(`${order} of the same date ends with the later batch, streak unbroken`, async () => {
      const a = `A-${run()}`
      const b = `B-${run()}`
      await use(a)
      const id = await habit('every day', '2026-10-14')
      await syncAll([a, b])
      const first = order === 'complete then skip' ? 'complete' : 'skip'
      for (const [dev, act] of [[a, first], [b, first === 'complete' ? 'skip' : 'complete']] as const) {
        await use(dev)
        if (act === 'complete') await completeTask(id, { today: '2026-10-14' })
        else await skipOccurrence(id, { today: '2026-10-14' })
      }
      await syncAll([a, b])
      for (const dev of [a, b]) {
        await use(dev)
        const recs = await records(id)
        expect(recs).toHaveLength(1)
        expect(recs[0].skipped).toBe(order === 'complete then skip')
        const all = await db.tasks.toArray()
        const stats = habitStats((await db.tasks.get(id))!, all, '2026-10-15')
        expect(stats?.current).toBe(order === 'complete then skip' ? 0 : 1)
        expect(stats?.pending).toBe(true)
      }
    })
  }

  it('for 2 times ends after two completions with a skip in between', async () => {
    const id = await habit('every day for 2 times', '2026-10-12')
    await completeTask(id, { today: '2026-10-12' })
    expect(await skipOccurrence(id, { today: '2026-10-13' })).toBe(true)
    expect(await db.tasks.get(id)).toMatchObject({ completed_at: null, due: { date: '2026-10-14' } })
    await completeTask(id, { today: '2026-10-14' })
    expect((await db.tasks.get(id))?.completed_at).toBeGreaterThan(0)
    expect((await records(id)).map((r) => r.skipped).sort()).toEqual([false, true])
  })
})
