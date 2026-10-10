import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, completeTask, createTask, resetDeviceId, setRecurrence, skipOccurrence, updateTask } from './ops'
import { dueInstant, isDelivered, isDismissed, offsetLabel, relativeFireAt, snoozeUntil } from './reminderTime'
import { addReminder, deleteReminder, dismissReminder, followSharedDueChanges, snoozeReminder, updateReminder } from './reminders'
import type { Op } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`reminders-${Date.now()}-${n++}`)
  resetDeviceId()
})

const local = (date: string, time: string) => dueInstant({ date, time })

describe('reminder entity', () => {
  it('applies reminder ops in any order with identical results', async () => {
    const ops: Op[] = [
      { id: 'a', entity: 'reminder', entityId: 'r1', field: 'task_id', value: 't1', ts: 1, device: 'A' },
      { id: 'b', entity: 'reminder', entityId: 'r1', field: 'kind', value: 'relative', ts: 1, device: 'A' },
      { id: 'c', entity: 'reminder', entityId: 'r1', field: 'offset_minutes', value: -30, ts: 1, device: 'A' },
      { id: 'd', entity: 'reminder', entityId: 'r1', field: 'offset_minutes', value: -60, ts: 5, device: 'B' },
      { id: 'e', entity: 'reminder', entityId: 'r1', field: 'fire_at', value: 1000, ts: 3, device: 'A' },
      { id: 'f', entity: 'reminder', entityId: 'r1', field: 'deleted_at', value: 99, ts: 4, device: 'B' },
      { id: 'g', entity: 'reminder', entityId: 'r1', field: 'dismissed_at', value: 50, ts: 2, device: 'A' },
    ]
    const states: string[] = []
    for (const order of [[0, 1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1, 0], [3, 0, 5, 2, 6, 1, 4]]) {
      const d = useDatabase(`rem-order-${order.join('')}-${n++}`)
      for (const i of order) await applyOps([ops[i]])
      const { _clock, ...row } = (await d.reminders.get('r1'))!
      expect(_clock.offset_minutes).toEqual({ ts: 5, device: 'B' })
      states.push(JSON.stringify(row))
    }
    expect(new Set(states).size).toBe(1)
    expect(JSON.parse(states[0])).toEqual({
      id: 'r1', task_id: 't1', kind: 'relative', offset_minutes: -60, fire_at: 1000,
      delivered_at: null, dismissed_at: 50, created_at: 0, deleted_at: 99,
    })
  })

  it('concurrent offset edit and delete converge to deleted', async () => {
    const ops: Op[] = [
      { id: 'a', entity: 'reminder', entityId: 'r1', field: 'offset_minutes', value: -10, ts: 10, device: 'A' },
      { id: 'b', entity: 'reminder', entityId: 'r1', field: 'deleted_at', value: 9, ts: 9, device: 'B' },
    ]
    await applyOps([ops[1], ops[0]])
    expect((await db.reminders.get('r1'))?.deleted_at).toBe(9)
  })
})

describe('reminder helpers', () => {
  it('each helper writes ops to the outbox', async () => {
    const t = await createTask({ title: 'Call the dentist', due: { date: '2026-10-11', time: '10:00' } })
    await db.outbox.clear()

    const id = await addReminder(t, { kind: 'relative', offset_minutes: -30 })
    let r = (await db.reminders.get(id))!
    expect(r).toMatchObject({ task_id: t, kind: 'relative', offset_minutes: -30, fire_at: local('2026-10-11', '09:30'), deleted_at: null })
    const added = await db.outbox.toArray()
    expect(added.every((o) => o.entity === 'reminder' && o.entityId === id)).toBe(true)
    expect(added.map((o) => o.field).sort()).toEqual(['created_at', 'deleted_at', 'delivered_at', 'dismissed_at', 'fire_at', 'kind', 'offset_minutes', 'task_id'])

    await db.outbox.clear()
    await updateReminder(id, { kind: 'relative', offset_minutes: -60 })
    expect((await db.reminders.get(id))?.fire_at).toBe(local('2026-10-11', '09:00'))
    expect((await db.outbox.toArray()).some((o) => o.field === 'fire_at')).toBe(true)

    await db.outbox.clear()
    await dismissReminder(id, 1234)
    expect((await db.outbox.toArray()).map((o) => [o.field, o.value])).toEqual([['dismissed_at', 1234]])

    await db.outbox.clear()
    await deleteReminder(id, 5678)
    expect((await db.outbox.toArray()).map((o) => [o.field, o.value])).toEqual([['deleted_at', 5678]])
    r = (await db.reminders.get(id))!
    expect(r.deleted_at).toBe(5678)
  })

  it('snooze sets a new firing time and clears delivered_at', async () => {
    const t = await createTask({ title: 'x' })
    const id = await addReminder(t, { kind: 'absolute', fire_at: 1_000_000 })
    await applyOps([{ id: 'srv', entity: 'reminder', entityId: id, field: 'delivered_at', value: 1_000_500, ts: 1, device: 'server' }])
    // A server op with an old timestamp loses against the local creation op; write a winning one.
    await applyOps([{ id: 'srv2', entity: 'reminder', entityId: id, field: 'delivered_at', value: 1_000_500, ts: Date.now() + 1000, device: 'server' }])
    expect(isDelivered((await db.reminders.get(id))!)).toBe(true)
    await db.outbox.clear()
    const now = 2_000_000
    const at = await snoozeReminder(id, '10m', now)
    expect(at).toBe(now + 600_000)
    const r = (await db.reminders.get(id))!
    expect(r.fire_at).toBe(now + 600_000)
    const fields = Object.fromEntries((await db.outbox.toArray()).map((o) => [o.field, o.value]))
    expect(fields).toEqual({ fire_at: now + 600_000, delivered_at: null, dismissed_at: null })
    expect(r.kind).toBe('absolute')
  })

  it('snooze presets', () => {
    const now = new Date(2026, 9, 10, 22, 15).getTime()
    expect(snoozeUntil('1h', now)).toBe(now + 3_600_000)
    expect(snoozeUntil('tomorrow', now)).toBe(new Date(2026, 9, 11, 9, 0).getTime())
  })

  it('absolute reminder on an undated task is accepted', async () => {
    const t = await createTask({ title: 'undated' })
    const at = new Date(2026, 9, 12, 9, 0).getTime()
    const id = await addReminder(t, { kind: 'absolute', fire_at: at })
    expect((await db.reminders.get(id))?.fire_at).toBe(at)
  })

  it('relative reminder on an undated task has no firing time', async () => {
    const t = await createTask({ title: 'undated' })
    const id = await addReminder(t, { kind: 'relative', offset_minutes: -30 })
    expect((await db.reminders.get(id))?.fire_at).toBeNull()
  })

  it('date-only due uses 09:00 local', () => {
    expect(relativeFireAt({ date: '2026-10-11' }, 0)).toBe(local('2026-10-11', '09:00'))
    expect(offsetLabel(-30)).toBe('30 minutes before')
    expect(offsetLabel(-1440)).toBe('1 day before')
    expect(offsetLabel(120)).toBe('2 hours after')
  })

  it('zoned due fires relative to its instant, whatever the device zone (absolute-datetimes)', () => {
    expect(relativeFireAt({ date: '2026-10-11', time: '09:00', tz: 'Europe/Berlin' }, -10)).toBe(Date.UTC(2026, 9, 11, 6, 50))
    expect(relativeFireAt({ date: '2026-03-29', time: '02:30', tz: 'Europe/Berlin' }, 0)).toBe(Date.UTC(2026, 2, 29, 1, 0))
  })
})

describe('relative reminders follow the due time', () => {
  it('due moved recomputes fire_at', async () => {
    const t = await createTask({ title: 'x', due: { date: '2026-10-11', time: '10:00' } })
    const rel = await addReminder(t, { kind: 'relative', offset_minutes: -30 })
    const abs = await addReminder(t, { kind: 'absolute', fire_at: 42_000 })
    await db.outbox.clear()
    await updateTask(t, { due: { date: '2026-10-16', time: '15:00' } })
    expect((await db.reminders.get(rel))?.fire_at).toBe(local('2026-10-16', '14:30'))
    expect((await db.reminders.get(abs))?.fire_at).toBe(42_000)
    // Same batch: the due op and the reminder op carry the same timestamp and device.
    const out = await db.outbox.toArray()
    const dueOp = out.find((o) => o.entity === 'task' && o.field === 'due')!
    const fireOp = out.find((o) => o.entity === 'reminder' && o.field === 'fire_at')!
    expect(fireOp.ts).toBe(dueOp.ts)
    expect(fireOp.device).toBe(dueOp.device)
    expect(out.some((o) => o.entityId === abs)).toBe(false)
  })

  it('cleared due yields null fire_at', async () => {
    const t = await createTask({ title: 'x', due: { date: '2026-10-11', time: '10:00' } })
    const rel = await addReminder(t, { kind: 'relative', offset_minutes: -30 })
    await updateTask(t, { due: null })
    const r = (await db.reminders.get(rel))!
    expect(r.fire_at).toBeNull()
    expect(r.deleted_at).toBeNull()
    await updateTask(t, { due: { date: '2026-10-12' } })
    expect((await db.reminders.get(rel))?.fire_at).toBe(local('2026-10-12', '08:30'))
  })

  it('a moved firing clears delivered and dismissed state', async () => {
    const t = await createTask({ title: 'x', due: { date: '2026-10-11', time: '10:00' } })
    const rel = await addReminder(t, { kind: 'relative', offset_minutes: 0 })
    await dismissReminder(rel, local('2026-10-11', '10:01'))
    expect(isDismissed((await db.reminders.get(rel))!)).toBe(true)
    await updateTask(t, { due: { date: '2026-10-12', time: '10:00' } })
    const r = (await db.reminders.get(rel))!
    expect(r.dismissed_at).toBeNull()
    expect(isDismissed(r)).toBe(false)
  })

  it('two devices reschedule offline: due and fire_at come from the same winner', async () => {
    const t = await createTask({ title: 'x', due: { date: '2026-10-11', time: '10:00' } })
    const rel = await addReminder(t, { kind: 'relative', offset_minutes: -30 })
    await db.outbox.clear()
    await updateTask(t, { due: { date: '2026-10-16', time: '15:00' } })
    const mine = await db.outbox.toArray()
    // Device Z (sorts after ours) moved the task to Saturday at the same instant; its batch wins the tie.
    const ts = mine[0].ts
    const theirs: Op[] = [
      { id: 'z1', entity: 'task', entityId: t, field: 'due', value: { date: '2026-10-17', time: '08:00' }, ts, device: 'zzzz' },
      { id: 'z2', entity: 'reminder', entityId: rel, field: 'fire_at', value: local('2026-10-17', '07:30'), ts, device: 'zzzz' },
    ]
    await applyOps(theirs)
    expect((await db.tasks.get(t))?.due).toEqual({ date: '2026-10-17', time: '08:00' })
    expect((await db.reminders.get(rel))?.fire_at).toBe(local('2026-10-17', '07:30'))
  })

  it('a recurring series rolling forward carries its relative reminders along', async () => {
    const t = await createTask({ title: 'standup', due: { date: '2026-10-12', time: '09:30' } })
    await setRecurrence(t, 'every day')
    const rel = await addReminder(t, { kind: 'relative', offset_minutes: -15 })
    const abs = await addReminder(t, { kind: 'absolute', fire_at: local('2026-10-12', '08:00') })
    await dismissReminder(rel, local('2026-10-12', '09:16'))
    await completeTask(t, { today: '2026-10-12' })
    expect((await db.tasks.get(t))?.due).toEqual({ date: '2026-10-13', time: '09:30' })
    const r = (await db.reminders.get(rel))!
    expect(r.fire_at).toBe(local('2026-10-13', '09:15'))
    expect(r.dismissed_at).toBeNull()
    expect(r.task_id).toBe(t)
    expect((await db.reminders.get(abs))?.fire_at).toBe(local('2026-10-12', '08:00'))
    await skipOccurrence(t, { today: '2026-10-12' })
    expect((await db.reminders.get(rel))?.fire_at).toBe(local('2026-10-14', '09:15'))
  })
})

describe('personal reminders on shared tasks', () => {
  it("another member's due change moves my relative reminders on a shared task only", async () => {
    await db.memberships.put({ projectId: 'shared', role: 'editor', ownerId: 'u-owner', members: [] })
    const shared = await createTask({ title: 'shared', project_id: 'shared', due: { date: '2026-10-11', time: '10:00' } })
    const own = await createTask({ title: 'own', project_id: 'mine', due: { date: '2026-10-11', time: '10:00' } })
    const r1 = await addReminder(shared, { kind: 'relative', offset_minutes: -30 })
    const r2 = await addReminder(own, { kind: 'relative', offset_minutes: -30 })
    const ts = Date.now() + 10_000
    const remote: Op[] = [
      { id: 'm1', entity: 'task', entityId: shared, field: 'due', value: { date: '2026-10-12', time: '15:00' }, ts, device: 'other-member' },
      { id: 'm2', entity: 'task', entityId: own, field: 'due', value: { date: '2026-10-12', time: '15:00' }, ts, device: 'my-other-device' },
    ]
    await applyOps(remote)
    await db.outbox.clear()
    expect(await followSharedDueChanges(remote)).toBe(1)
    expect((await db.reminders.get(r1))?.fire_at).toBe(local('2026-10-12', '14:30'))
    // A personal task's reminders are written by the device that moved it, in the same batch.
    expect((await db.reminders.get(r2))?.fire_at).toBe(local('2026-10-11', '09:30'))
    expect((await db.outbox.toArray()).every((o) => o.entity === 'reminder' && o.entityId === r1)).toBe(true)
    expect(await followSharedDueChanges(remote)).toBe(0) // idempotent
  })
})
