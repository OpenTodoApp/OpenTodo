// OpenSpec change bulk-edit, tasks 3.2, 3.4 and 4.1.
import { beforeEach, describe, expect, it } from 'vitest'
import { applyBulk, planMoveFor } from './bulk'
import { db, useDatabase } from './db'
import { occurrenceId } from './ids'
import { applyOps, createProject, createSubtask, createTask, getDeviceId, resetDeviceId, updateTask } from './ops'
import type { Op } from './types'
import { applyBatch, undoBatch } from './undo'

let n = 0
beforeEach(() => {
  useDatabase(`bulk-${Date.now()}-${n++}`)
  resetDeviceId()
})

const outboxStamps = async () => new Set((await db.outbox.toArray()).map((o) => `${o.ts}|${o.device}`))

describe('planners in one batch (3.2)', () => {
  it('five tasks with one weekly series complete in one batch and the series rolls', async () => {
    const ids = [await createTask({ title: 'a' }), await createTask({ title: 'b' }), await createTask({ title: 'c' }), await createTask({ title: 'd' })]
    const series = await createTask({ title: 'Weekly', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    await db.outbox.clear()
    const r = await applyBulk([...ids, series], { kind: 'complete' }, { today: '2026-10-12' })
    expect(r.label).toBe('5 tasks completed')
    for (const id of ids) expect((await db.tasks.get(id))!.completed_at).not.toBeNull()
    expect(await db.tasks.get(series)).toMatchObject({ completed_at: null, due: { date: '2026-10-19' } })
    expect(await db.tasks.get(occurrenceId(series, '2026-10-12'))).toBeTruthy()
    expect((await outboxStamps()).size).toBe(1)
  })

  it('mixed completion completes the open ones; all completed reopens', async () => {
    const a = await createTask({ title: 'a' })
    const b = await createTask({ title: 'b' })
    await applyBulk([a], { kind: 'complete' })
    const r = await applyBulk([a, b], { kind: 'complete' })
    expect(r.label).toBe('1 task completed')
    expect((await db.tasks.get(b))!.completed_at).not.toBeNull()
    const back = await applyBulk([a, b], { kind: 'complete' })
    expect(back.label).toBe('2 tasks reopened')
    expect((await db.tasks.get(a))!.completed_at).toBeNull()
  })

  it('parent and subtask both ticked yield one tombstone per task', async () => {
    const p = await createTask({ title: 'Parent' })
    const c = await createSubtask(p, 'Child')
    await db.outbox.clear()
    await applyBulk([p, c], { kind: 'trash' })
    const ops = (await db.outbox.toArray()).filter((o) => o.field === 'deleted_at')
    expect(ops.map((o) => o.entityId).sort()).toEqual([p, c].sort())
  })

  it('"Tomorrow" keeps an existing time; no date ends a rule; a date un-parks', async () => {
    const timed = await createTask({ title: 'Call', due: { date: '2026-10-12', time: '15:00' } })
    const parked = await createTask({ title: 'Idea', start: 'someday' })
    await applyBulk([timed, parked], { kind: 'due', pick: 'tomorrow' }, { today: '2026-10-14' })
    expect((await db.tasks.get(timed))!.due).toEqual({ date: '2026-10-15', time: '15:00' })
    expect(await db.tasks.get(parked)).toMatchObject({ due: { date: '2026-10-15' }, start: null })
    const rep = await createTask({ title: 'Gym', due: { date: '2026-10-12' }, recurrence: 'every day' })
    await applyBulk([rep], { kind: 'due', pick: null })
    expect(await db.tasks.get(rep)).toMatchObject({ due: null, recurrence: null })
  })

  it('labels read each task’s current array', async () => {
    const a = await createTask({ title: 'a', labels: ['l1'] })
    const b = await createTask({ title: 'b', labels: ['l2'] })
    await applyBulk([a, b], { kind: 'label', labelId: 'l1', add: true })
    expect((await db.tasks.get(a))!.labels).toEqual(['l1'])
    expect((await db.tasks.get(b))!.labels).toEqual(['l2', 'l1'])
  })

  it('a move into a shared project produces copies plus tombstones', async () => {
    const shared = await createProject({ name: 'Shared' })
    await db.memberships.put({ projectId: shared, role: 'owner', ownerId: 'me', members: [] } as never)
    const t = await createTask({ title: 'Private' })
    const changes = await planMoveFor([t], { projectId: shared })
    const created = changes.filter((c) => c.create)
    expect(created).toHaveLength(1)
    expect(created[0].patch).toMatchObject({ project_id: shared, title: 'Private' })
    expect(changes.find((c) => c.entityId === t)!.patch).toMatchObject({ deleted_at: expect.any(Number) })
  })

  it('an offline batch leaves every op in the outbox with one timestamp', async () => {
    const ids = [await createTask({ title: 'a' }), await createTask({ title: 'b' }), await createTask({ title: 'c' })]
    await db.outbox.clear()
    await applyBulk(ids, { kind: 'priority', priority: 2 })
    expect((await db.outbox.toArray()).map((o) => o.field)).toEqual(['priority', 'priority', 'priority'])
    expect((await outboxStamps()).size).toBe(1)
  })
})

describe('two devices complete the same occurrence in a batch (3.4)', () => {
  it('converge on one record and the same next due', async () => {
    useDatabase(`A-${n++}`); resetDeviceId(); await getDeviceId()
    const id = await createTask({ title: 'Daily', due: { date: '2026-10-12' }, recurrence: 'every day' })
    const seed = (await db.outbox.toArray()).map(({ local: _l, ...o }) => o as Op)
    await db.outbox.clear()
    await applyBulk([id], { kind: 'complete' }, { today: '2026-10-12' })
    const fromA = (await db.outbox.toArray()).map(({ local: _l, ...o }) => o as Op)
    useDatabase(`B-${n++}`); resetDeviceId(); await getDeviceId()
    await applyOps(seed)
    await db.outbox.clear()
    await applyBulk([id], { kind: 'complete' }, { today: '2026-10-12' })
    const fromB = (await db.outbox.toArray()).map(({ local: _l, ...o }) => o as Op)
    await applyOps(fromA)
    const b = JSON.stringify(await db.tasks.orderBy('id').toArray())
    useDatabase(`A2-${n++}`); resetDeviceId(); await getDeviceId()
    await applyOps(seed); await applyOps(fromA); await applyOps(fromB)
    expect(JSON.stringify(await db.tasks.orderBy('id').toArray())).toBe(b)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-13' })
  })
})

describe('undo store (4.1)', () => {
  it('undo after rescheduling eight restores eight; a field changed again is skipped and named', async () => {
    const ids: string[] = []
    for (let i = 0; i < 8; i++) ids.push(await createTask({ title: `t${i}`, due: { date: '2026-10-12' } }))
    const r = await applyBulk(ids, { kind: 'due', pick: 'tomorrow' }, { today: '2026-10-14' })
    await updateTask(ids[0], { due: { date: '2026-11-01' } })
    const u = await undoBatch(r.undoId!)
    expect(u).toEqual({ restored: 7, skipped: ['t0'] })
    expect((await db.tasks.get(ids[1]))!.due).toEqual({ date: '2026-10-12' })
    expect((await db.tasks.get(ids[0]))!.due).toEqual({ date: '2026-11-01' })
    const row = (await db.assistantUndo.get(r.undoId!))!
    expect(row).toMatchObject({ source: 'bulk', label: '8 tasks rescheduled' })
  })

  it('a cross-scope move undone: copies go to the Trash, originals come back', async () => {
    const shared = await createProject({ name: 'Shared' })
    await db.memberships.put({ projectId: shared, role: 'owner', ownerId: 'me', members: [] } as never)
    const t = await createTask({ title: 'Private' })
    const entry = (await applyBatch(await planMoveFor([t], { projectId: shared }), { source: 'bulk' }))!
    const copy = (await db.tasks.toArray()).find((x) => x.title === 'Private' && x.id !== t)!
    expect((await db.tasks.get(t))!.deleted_at).not.toBeNull()
    await undoBatch(entry.id)
    expect((await db.tasks.get(t))!.deleted_at).toBeNull()
    expect((await db.tasks.get(copy.id))!.deleted_at).not.toBeNull()
  })
})
