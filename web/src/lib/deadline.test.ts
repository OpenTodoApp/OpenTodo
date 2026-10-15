// OpenSpec change `deadlines`: the task.deadline field and deadline reminders in
// the client data layer (tasks 1.3).
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, createTask, resetDeviceId, updateTask } from './ops'
import { deadlineFireAt, deadlineOffsetLabel, dueInstant } from './reminderTime'
import { addReminder, followSharedDueChanges } from './reminders'
import { formatValue } from './history'
import { daysBetweenISO, describeDeadline } from './dates'
import { inToday, inUpcoming, overdueInToday, upcomingDate } from './views'

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

describe('countdown (design D2)', () => {
  const today = '2026-10-14'
  it.each([
    ['2026-10-17', undefined, '3d', 'soon'],
    ['2026-10-14', undefined, 'Today', 'overdue'],
    ['2026-10-12', undefined, '2d over', 'overdue'],
    ['2026-10-30', undefined, '16d', 'later'],
    ['2026-10-21', undefined, '7d', 'soon'],
    // Due after the deadline: the countdown turns to the danger tone.
    ['2026-10-17', '2026-10-19', '3d', 'overdue'],
  ])('deadline %s (due %s) reads %s, tone %s', (deadline, due, label, tone) => {
    expect(describeDeadline(deadline, today, due)).toEqual({ label, tone })
  })
  it('null without a deadline', () => {
    expect(describeDeadline(null, today)).toBeNull()
    expect(describeDeadline(undefined, today)).toBeNull()
  })
  it('counts calendar days across a DST change', () => {
    expect(daysBetweenISO('2026-10-24', '2026-10-26')).toBe(2)
    expect(daysBetweenISO('2026-03-28', '2026-03-30')).toBe(2)
  })
})

describe('Today and Upcoming (design D3)', () => {
  const today = '2026-10-14'
  const t = (due: string | null, deadline: string | null, completed_at: number | null = null) => ({ due: due ? { date: due } : null, deadline, completed_at })
  it('deadline today without a due date is in Today, not overdue', () => {
    expect(inToday(t(null, today), today)).toBe(true)
    expect(overdueInToday(t(null, today), today)).toBe(false)
  })
  it('scheduled later than a past deadline is in Today once, in Overdue', () => {
    const x = t('2026-10-16', '2026-10-13')
    expect(inToday(x, today)).toBe(true)
    expect(overdueInToday(x, today)).toBe(true)
    expect(inUpcoming(x, today)).toBe(true) // listed under its due date in Upcoming too, as any task due later
  })
  it('a past deadline planned for today stays in the Today group', () => {
    expect(overdueInToday(t(today, '2026-10-13'), today)).toBe(false)
  })
  it('deadline still ahead is not in Today', () => {
    expect(inToday(t('2026-10-20', '2026-10-24'), today)).toBe(false)
  })
  it('deadline only is in Upcoming under its deadline', () => {
    const x = t(null, '2026-10-17')
    expect(inUpcoming(x, today)).toBe(true)
    expect(upcomingDate(x)).toBe('2026-10-17')
  })
  it('both dates: Upcoming lists it under the due date only', () => {
    const x = t('2026-10-15', '2026-10-17')
    expect(upcomingDate(x)).toBe('2026-10-15')
  })
  it('clearing the due date moves it to its deadline day', () => {
    expect(upcomingDate(t(null, '2026-10-16'))).toBe('2026-10-16')
  })
  it('completed tasks are in neither', () => {
    expect(inToday(t(null, today, 1), today)).toBe(false)
    expect(inUpcoming(t(null, '2026-10-17', 1), today)).toBe(false)
  })
})
