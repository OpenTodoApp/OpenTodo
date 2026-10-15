// OpenSpec change `deadlines`: the task.deadline field and deadline reminders in
// the client data layer (tasks 1.3).
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, createTask, resetDeviceId, updateTask } from './ops'
import { deadlineFireAt, deadlineOffsetLabel, dueInstant } from './reminderTime'
import { addReminder, followSharedDueChanges } from './reminders'
import { formatValue } from './history'

let n = 0
beforeEach(() => {
  useDatabase(`deadline-${Date.now()}-${n++}`)
  resetDeviceId()
})

const local = (date: string, time: string) => dueInstant({ date, time })

describe('task.deadline', () => {
  it('a remote deadline op reads back as the string; an old row reads null', async () => {
    await applyOps([
      { id: 'a', entity: 'task', entityId: 't1', field: 'title', value: 'Tax return', ts: 1, device: 'A' },
      { id: 'b', entity: 'task', entityId: 't1', field: 'deadline', value: '2026-11-06', ts: 2, device: 'A' },
      { id: 'c', entity: 'task', entityId: 't2', field: 'title', value: 'Old row', ts: 1, device: 'A' },
    ])
    expect((await db.tasks.get('t1'))?.deadline).toBe('2026-11-06')
    expect((await db.tasks.get('t2'))?.deadline ?? null).toBeNull()
  })

  it('an offline updateTask queues exactly one op', async () => {
    const id = await createTask({ title: 'Renew passport' })
    await db.outbox.clear()
    await updateTask(id, { deadline: '2026-12-01' })
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => [o.field, o.value])).toEqual([['deadline', '2026-12-01']])
  })

  it('createTask sends the field only when set', async () => {
    await createTask({ title: 'Plain' })
    expect((await db.outbox.toArray()).some((o) => o.field === 'deadline')).toBe(false)
    await db.outbox.clear()
    const id = await createTask({ title: 'With one', deadline: '2026-11-20' })
    expect((await db.tasks.get(id))?.deadline).toBe('2026-11-20')
    expect((await db.outbox.toArray()).filter((o) => o.field === 'deadline').map((o) => o.value)).toEqual(['2026-11-20'])
  })

  it('history shows the deadline as a date', () => {
    expect(formatValue('deadline', null)).toBe('—')
    expect(formatValue('deadline', '2026-11-06')).not.toBe('')
  })
})

describe('deadline reminders', () => {
  it('fire at 09:00 local on the deadline plus offset', () => {
    expect(deadlineFireAt('2026-11-06', -1440)).toBe(local('2026-11-05', '09:00'))
    expect(deadlineFireAt(null, 0)).toBeNull()
    expect(deadlineOffsetLabel(0)).toBe('On the deadline')
    expect(deadlineOffsetLabel(-1440)).toBe('1 day before the deadline')
  })

  it('add a deadline reminder', async () => {
    const t = await createTask({ title: 'Tax return', deadline: '2026-11-06' })
    const id = await addReminder(t, { kind: 'deadline', offset_minutes: -1440 })
    expect(await db.reminders.get(id)).toMatchObject({ kind: 'deadline', offset_minutes: -1440, fire_at: local('2026-11-05', '09:00') })
  })

  it('moving the deadline rewrites deadline reminders in the same batch and leaves relative ones alone', async () => {
    const t = await createTask({ title: 'Tax return', due: { date: '2026-11-02', time: '10:00' }, deadline: '2026-11-06' })
    const dl = await addReminder(t, { kind: 'deadline', offset_minutes: 0 })
    const rel = await addReminder(t, { kind: 'relative', offset_minutes: -30 })
    await db.outbox.clear()
    await updateTask(t, { deadline: '2026-11-12' })
    expect((await db.reminders.get(dl))?.fire_at).toBe(local('2026-11-12', '09:00'))
    expect((await db.reminders.get(rel))?.fire_at).toBe(local('2026-11-02', '09:30'))
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => `${o.entity}.${o.field}`).sort()).toEqual(['reminder.fire_at', 'task.deadline'])
    expect(new Set(ops.map((o) => `${o.ts}|${o.device}`)).size).toBe(1)
  })

  it('rescheduling due leaves deadline reminders alone', async () => {
    const t = await createTask({ title: 'Tax return', due: { date: '2026-11-02' }, deadline: '2026-11-06' })
    const dl = await addReminder(t, { kind: 'deadline', offset_minutes: -60 })
    const rel = await addReminder(t, { kind: 'relative', offset_minutes: 0 })
    await updateTask(t, { due: { date: '2026-11-03' } })
    expect((await db.reminders.get(dl))?.fire_at).toBe(local('2026-11-06', '08:00'))
    expect((await db.reminders.get(rel))?.fire_at).toBe(local('2026-11-03', '09:00'))
  })

  it('clearing the deadline keeps the reminder without a firing time', async () => {
    const t = await createTask({ title: 'Tax return', deadline: '2026-11-06' })
    const dl = await addReminder(t, { kind: 'deadline', offset_minutes: 0 })
    await updateTask(t, { deadline: null })
    expect(await db.reminders.get(dl)).toMatchObject({ deleted_at: null, fire_at: null })
  })

  it('a shared task whose deadline arrives from another member recomputes our deadline reminders', async () => {
    const t = await createTask({ title: 'Shared', deadline: '2026-11-06' })
    const dl = await addReminder(t, { kind: 'deadline', offset_minutes: 0 })
    await db.tasks.update(t, { project_id: 'p1' })
    await db.memberships.put({ projectId: 'p1' } as never)
    const op = { id: 'x', entity: 'task' as const, entityId: t, field: 'deadline', value: '2026-11-09', ts: Date.now() * 2, device: 'other' }
    await applyOps([op])
    expect(await followSharedDueChanges([op])).toBe(1)
    expect((await db.reminders.get(dl))?.fire_at).toBe(local('2026-11-09', '09:00'))
  })
})
