// Taking back today's check-in, Skip today, the day's progress and Remind me at
// (OpenSpec change habits-complete, tasks 1.1 to 1.3), on the data layer.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { checkIn, createHabit, habitReminderId, makeHabit, planRemind, remindTimeOf, setPastDay, skipToday, uncheckToday } from './habitActions'
import { dayProgress } from './habitDay'
import { habitRowsOf, threadDays } from './habits'
import { occurrenceId } from './ids'
import { lineageRows } from './lineageRows'
import { createTask, getDeviceId, resetDeviceId, updateTask } from './ops'
import { undoBatch } from './undo'
import type { Reminder, Task } from './types'

let n = 0
beforeEach(async () => {
  useDatabase(`habit-uncheck-${Date.now()}-${n++}`)
  resetDeviceId()
  await getDeviceId()
})

const TODAY = '2026-11-25' // a Wednesday
const NOW = Date.UTC(2026, 10, 25, 12)

async function habit(title: string, rule: string, due: string, extra: Partial<Task> = {}): Promise<string> {
  const id = await createTask({ title, due: { date: due }, recurrence: rule })
  await updateTask(id, { habit: true, ...extra })
  return id
}
const row = async (id: string) => (await db.tasks.get(id))!

describe('taking back today (task 1.1)', () => {
  it('a daily habit kept today is due today again, and Undo checks it back in', async () => {
    const id = await habit('Read', 'every day', TODAY)
    await checkIn(id, false, { now: NOW, today: TODAY })
    expect((await row(id)).due?.date).toBe('2026-11-26')
    const r = await uncheckToday(id, NOW + 1, TODAY)
    expect(r?.label).toBe('Check-in taken back')
    expect((await row(id)).due?.date).toBe(TODAY)
    expect((await db.tasks.get(occurrenceId(id, TODAY)))?.deleted_at).toBeTruthy()
    expect(threadDays(await row(id), await lineageRows(id), TODAY).at(-1)?.state).toBe('pending')
    await undoBatch(r!.entry.id)
    expect((await row(id)).due?.date).toBe('2026-11-26')
    expect((await db.tasks.get(occurrenceId(id, TODAY)))?.deleted_at).toBeFalsy()
  })

  it('a weekly habit moves back from Friday to today, its time with it', async () => {
    const id = await createTask({ title: 'Run', due: { date: TODAY, time: '07:00' }, recurrence: 'every mon, wed, fri' })
    await updateTask(id, { habit: true })
    await checkIn(id, false, { now: NOW, today: TODAY })
    expect((await row(id)).due).toEqual({ date: '2026-11-27', time: '07:00' })
    await uncheckToday(id, NOW + 1, TODAY)
    expect((await row(id)).due).toEqual({ date: TODAY, time: '07:00' })
  })

  it('moves nothing when a later day was recorded since', async () => {
    const id = await habit('Read', 'every day', TODAY)
    await checkIn(id, false, { now: NOW, today: TODAY })
    await checkIn(id, false, { now: NOW + 1, today: TODAY }) // tomorrow, early
    expect((await row(id)).due?.date).toBe('2026-11-27')
    await uncheckToday(id, NOW + 2, TODAY)
    expect((await row(id)).due?.date).toBe('2026-11-27')
    expect((await db.tasks.get(occurrenceId(id, TODAY)))?.deleted_at).toBeTruthy()
  })

  it('is null with nothing to take back, for a skip, and for an amount habit', async () => {
    const id = await habit('Read', 'every day', TODAY)
    expect(await uncheckToday(id, NOW, TODAY)).toBeNull()
    await skipToday(id, { now: NOW, today: TODAY })
    expect(await uncheckToday(id, NOW + 1, TODAY)).toBeNull()
    const water = await habit('Water', 'every day', TODAY, { habit_amount: 1 })
    await checkIn(water, false, { now: NOW, today: TODAY })
    expect(await uncheckToday(water, NOW + 1, TODAY)).toBeNull()
  })
})

describe('Skip today (design D5)', () => {
  it('skips the current occurrence and keeps the streak', async () => {
    const id = await habit('Run', 'every mon, wed, fri', '2026-11-23')
    await checkIn(id, false, { now: NOW - 2 * 86400000, today: '2026-11-23' })
    await skipToday(id, { now: NOW, today: TODAY })
    expect((await db.tasks.get(occurrenceId(id, TODAY)))?.skipped).toBe(true)
    expect((await row(id)).due?.date).toBe('2026-11-27')
  })
})

describe('the day across habits (task 1.2)', () => {
  it('counts due and kept, leaving out graduated habits, rest days and skips', async () => {
    const read = await habit('Read', 'every day', TODAY)
    const run = await habit('Run', 'every mon, wed, fri', TODAY)
    await habit('Floss', 'every day', TODAY, { habit_graduated_at: 1 })
    await habit('Piano', 'every tue', '2026-11-24')
    const stretch = await habit('Stretch', 'every day', TODAY)
    await checkIn(read, false, { now: NOW, today: TODAY })
    await skipToday(stretch, { now: NOW, today: TODAY })
    const all = await db.tasks.toArray()
    const habits = all.filter((t) => t.habit && !t.series_id)
    expect(dayProgress(habits, habitRowsOf(all), TODAY, TODAY)).toEqual({ kept: 1, due: 2 })
    expect(run).toBeTruthy()
  })

  it('reads an earlier day from its records', async () => {
    const read = await habit('Read', 'every day', '2026-11-23')
    await checkIn(read, false, { now: NOW - 2 * 86400000, today: '2026-11-23' })
    await updateTask(read, { due: { date: TODAY } })
    await setPastDay(read, '2026-11-24', 'tiny', NOW, TODAY)
    const all = await db.tasks.toArray()
    const habits = all.filter((t) => t.habit && !t.series_id)
    expect(dayProgress(habits, habitRowsOf(all), '2026-11-24', TODAY)).toEqual({ kept: 1, due: 1 })
  })
})

describe('Remind me at (task 1.3)', () => {
  const reminder = (over: Partial<Reminder>): Reminder => ({ id: 'r', task_id: 't', kind: 'relative', offset_minutes: 0, fire_at: null, delivered_at: null, dismissed_at: null, created_at: 1, deleted_at: null, _clock: {}, ...over } as Reminder)

  it('a time writes the due time and the derived reminder in one batch, the same id on every device', async () => {
    const id = await habit('Stretch', 'every day', TODAY)
    const r = await makeHabit(id, { title: 'Stretch', rule: 'every day', tiny: '', anchor: '', part: null, remindAt: '07:30' }, TODAY)
    expect((await row(id)).due).toEqual({ date: TODAY, time: '07:30' })
    const rem = await db.reminders.get(habitReminderId(id))
    expect(rem).toMatchObject({ task_id: id, kind: 'relative', offset_minutes: 0 })
    expect(rem?.fire_at).toBeGreaterThan(0)
    expect(remindTimeOf(await row(id), await db.reminders.where('task_id').equals(id).toArray())).toBe('07:30')
    expect(habitReminderId(id)).toBe(habitReminderId(id))
    await undoBatch(r!.entry.id)
    expect((await row(id)).due).toEqual({ date: TODAY })
    expect((await db.reminders.get(habitReminderId(id)))?.deleted_at ?? null).not.toBeNull()
  })

  it('clearing removes the reminder and the time; an empty field without one changes nothing', async () => {
    const id = await habit('Stretch', 'every day', TODAY)
    await makeHabit(id, { title: 'Stretch', rule: 'every day', tiny: '', anchor: '', part: null, remindAt: '07:30' }, TODAY)
    await makeHabit(id, { title: 'Stretch', rule: 'every day', tiny: '', anchor: '', part: null, remindAt: null }, TODAY)
    expect((await row(id)).due).toEqual({ date: TODAY })
    expect((await db.reminders.get(habitReminderId(id)))?.deleted_at).toBeTruthy()
    expect(planRemind('t', { date: TODAY, time: '09:00' }, null, [reminder({ offset_minutes: 15 })], NOW)).toEqual({ changes: [] })
  })

  it('a new habit with a time is due at it from its first day', async () => {
    const r = await createHabit({ title: 'Walk', rule: 'every day', tiny: '', anchor: '', part: null, remindAt: '18:00' })
    const t = await row(r!.id)
    expect(t.due?.time).toBe('18:00')
    expect(await db.reminders.get(habitReminderId(r!.id))).toBeTruthy()
  })
})
