import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, completeTask, createTask, getDeviceId, resetDeviceId, TIME_ENTRY_DEFAULTS } from './ops'
import { setCurrentUserId } from './sharing'
import { reseedAfterRestore } from './sync'
import { deleteTimeEntry, logTime, repairRunning, startTracking, stopTracking, TimeRangeError, toggleTracking, updateTimeEntry } from './timeEntries'
import type { Op } from './types'

// The client side of time entries (OpenSpec time-tracking, tasks 2.3, 2.4, 8.2).

let n = 0
async function fresh(user = 'u1'): Promise<void> {
  useDatabase(`time-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId(user)
}
beforeEach(() => fresh())

const T0 = new Date(2026, 9, 20, 9, 0).getTime()
const min = (m: number) => T0 + m * 60000

describe('the time_entry entity', () => {
  it('applies a remote op into an empty row with the defaults', async () => {
    await applyOps([{ id: 'o1', entity: 'time_entry', entityId: 'e1', field: 'started_at', value: T0, ts: 5, device: 'other' }])
    const row = await db.timeEntries.get('e1')
    expect(row).toMatchObject({ ...TIME_ENTRY_DEFAULTS, id: 'e1', started_at: T0 })
    expect(row?.ended_at).toBeNull()
  })

  it("re-seeds the user's own entries only after a restore", async () => {
    await applyOps([
      { id: 'a', entity: 'time_entry', entityId: 'mine', field: 'user_id', value: 'u1', ts: 5, device: 'd' },
      { id: 'b', entity: 'time_entry', entityId: 'theirs', field: 'user_id', value: 'u2', ts: 5, device: 'd' },
    ])
    await reseedAfterRestore('gen-2')
    const ids = new Set((await db.outbox.toArray()).filter((o) => o.entity === 'time_entry').map((o) => o.entityId))
    expect([...ids]).toEqual(['mine'])
  })
})

describe('start and stop', () => {
  it('Start stops the running one: A ends at B\'s start with 25 minutes, in one batch', async () => {
    const a = await startTracking('A', { now: min(0) })
    const b = await startTracking('B', { now: min(25) })
    const ea = await db.timeEntries.get(a)
    expect(ea?.ended_at).toBe(min(25))
    expect((await db.timeEntries.get(b))?.ended_at).toBeNull()
    const outbox = await db.outbox.toArray()
    const close = outbox.find((o) => o.entityId === a && o.field === 'ended_at' && o.value === min(25))!
    const open = outbox.find((o) => o.entityId === b && o.field === 'started_at')!
    expect(close.ts).toBe(open.ts)
    expect((await db.timeEntries.filter((e) => e.ended_at === null).toArray()).map((e) => e.id)).toEqual([b])
  })

  it('Stop while offline: the entry closes at once and the op waits in the outbox', async () => {
    const id = await startTracking('A', { now: min(0) })
    expect(await stopTracking({ now: min(12) })).toBe(id)
    expect((await db.timeEntries.get(id))?.ended_at).toBe(min(12))
    expect((await db.outbox.toArray()).some((o) => o.entityId === id && o.field === 'ended_at' && o.value === min(12))).toBe(true)
    expect(await stopTracking()).toBeNull()
  })

  it('toggles with the y key and only stops a completed task', async () => {
    expect(await toggleTracking('A', { now: min(0) })).toBe('started')
    expect(await toggleTracking('A', { now: min(5) })).toBe('stopped')
    expect(await toggleTracking('A', { now: min(6), canStart: false })).toBe('none')
  })

  it('Complete stops tracking: the entry closes with 12 minutes in the completion batch', async () => {
    const task = await createTask({ title: 'Write the report' })
    const id = await startTracking(task, { now: min(0) })
    await completeTask(task, { now: min(12), today: '2026-10-20' })
    expect((await db.timeEntries.get(id))?.ended_at).toBe(min(12))
    const outbox = await db.outbox.toArray()
    const done = outbox.find((o) => o.entityId === task && o.field === 'completed_at' && o.value === min(12))!
    const end = outbox.find((o) => o.entityId === id && o.field === 'ended_at' && o.value === min(12))!
    expect(end.ts).toBe(done.ts)
  })
})

describe('Two devices start while offline', () => {
  it('converge on one running entry: Y since 09:10, X closed from 09:00 to 09:10, on both replicas', async () => {
    await fresh('u1')
    await getDeviceId()
    const x = await startTracking('X', { now: min(0) })
    const fromA: Op[] = await db.outbox.toArray()
    const dbA = db
    await fresh('u1')
    const y = await startTracking('Y', { now: min(10) })
    const fromB: Op[] = await db.outbox.toArray()
    const dbB = db
    // Both sync: each device receives the other's ops and runs the repair.
    await applyOps(fromA)
    expect(await repairRunning()).toBe(1)
    const repairB = (await db.outbox.toArray()).filter((o) => o.field === 'ended_at' && o.entityId === x)
    useDatabase(dbA.name)
    resetDeviceId()
    await applyOps(fromB)
    expect(await repairRunning()).toBe(1)
    const repairA = (await db.outbox.toArray()).filter((o) => o.field === 'ended_at' && o.entityId === x && o.value !== null)
    expect(repairA.map((o) => o.value)).toEqual(repairB.map((o) => o.value))
    for (const replica of [dbA.name, dbB.name]) {
      useDatabase(replica)
      expect((await db.timeEntries.get(x))?.ended_at).toBe(min(10))
      expect((await db.timeEntries.get(y))?.ended_at).toBeNull()
    }
    // A second pass finds nothing to repair.
    expect(await repairRunning()).toBe(0)
  })
})

describe('manual entries', () => {
  it('logs, edits and deletes an own entry; an end before the start is refused', async () => {
    const id = await logTime('A', min(0), min(90), 'review')
    expect(await db.timeEntries.get(id)).toMatchObject({ started_at: min(0), ended_at: min(90), note: 'review', user_id: 'u1' })
    await expect(logTime('A', min(10), min(5))).rejects.toBeInstanceOf(TimeRangeError)
    await expect(updateTimeEntry(id, { ended_at: min(-1) })).rejects.toBeInstanceOf(TimeRangeError)
    await updateTimeEntry(id, { ended_at: min(105) })
    expect((await db.timeEntries.get(id))?.ended_at).toBe(min(105))
    await deleteTimeEntry(id, min(200))
    expect((await db.timeEntries.get(id))?.deleted_at).toBe(min(200))
  })

  it('Edit an end time offline: a concurrent note edit on another device keeps both changes', async () => {
    const id = await logTime('A', min(0), min(90))
    const before = await db.timeEntries.get(id)
    await updateTimeEntry(id, { ended_at: min(105) })
    // Another device changed the note at a later time: a separate field, so both stay.
    await applyOps([{ id: 'remote', entity: 'time_entry', entityId: id, field: 'note', value: 'call', ts: (before!._clock.note?.ts ?? 0) + 10_000_000, device: 'zzz' }])
    expect(await db.timeEntries.get(id)).toMatchObject({ ended_at: min(105), note: 'call' })
  })
})

describe('quick add `30m/2h` (task 8.2)', () => {
  it('writes the task with its estimate and one closed entry in the same batch', async () => {
    const at = new Date(2026, 9, 20, 10, 0)
    const id = await createTask({ title: 'Draft the offer', estimate_minutes: 120, spent_minutes: 30 }, at)
    const entries = await db.timeEntries.where('task_id').equals(id).toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ started_at: new Date(2026, 9, 20, 9, 30).getTime(), ended_at: at.getTime(), user_id: 'u1' })
    const outbox = await db.outbox.toArray()
    expect(new Set(outbox.map((o) => o.ts)).size).toBe(1)
    expect((await db.tasks.get(id))?.estimate_minutes).toBe(120)
  })

  it('Plus stays an estimate only', async () => {
    const id = await createTask({ title: 'Draft the offer', estimate_minutes: 30 })
    expect(await db.timeEntries.where('task_id').equals(id).count()).toBe(0)
  })
})
