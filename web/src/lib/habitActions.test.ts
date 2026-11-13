// Habits on the data layer (OpenSpec change habits-home): the Habits switch, the
// tiny version, editing past days, graduation and making a habit, each as the ops
// the device writes and how two devices converge.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { runFilter } from './filter'
import { checkIn, createHabit, graduate, makeHabit, planGraduate, planMakeHabit, planPastDay, resume, setPastDay, type HabitInput } from './habitActions'
import { habitsChoice, habitsEnabled, habitStats, isGraduated, keptDays, monthGrid } from './habits'
import { occurrenceId } from './ids'
import { lineageRows } from './lineageRows'
import { occurrencesInRange } from './occurrences'
import { applyOps, completeTask, createTask, getDeviceId, resetDeviceId, updateTask } from './ops'
import { planCompletion } from './recurring'
import { parseRule } from './recurrence'
import { withoutArchived, todayList } from './dayLists'
import { undoBatch } from './undo'
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

async function habit(title: string, rule: string, due: string): Promise<string> {
  const id = await createTask({ title, due: { date: due }, recurrence: rule })
  await updateTask(id, { habit: true })
  return id
}

const input = (over: Partial<HabitInput> = {}): HabitInput => ({ title: 'Read', rule: 'every day', tiny: '', anchor: '', part: null, ...over })

beforeEach(async () => {
  await use(`habit-actions-${run()}`)
})

describe('the Habits switch (task 1.3)', () => {
  it('reads not decided, on, off and an unknown value', () => {
    expect(habitsChoice({ habits: '' })).toBe('undecided')
    expect(habitsChoice({ habits: 'on' })).toBe('on')
    expect(habitsChoice({ habits: 'off' })).toBe('off')
    expect(habitsChoice({ habits: 'weekly' })).toBe('undecided')
    expect(habitsChoice(undefined)).toBe('undecided')
  })

  it('is on while not decided with an open habit, without a write', () => {
    expect(habitsEnabled({ habits: '' }, false)).toBe(false)
    expect(habitsEnabled({ habits: '' }, true)).toBe(true)
    expect(habitsEnabled({ habits: 'on' }, false)).toBe(true)
    expect(habitsEnabled({ habits: 'off' }, true)).toBe(false)
    expect(habitsEnabled({ habits: 'weekly' }, true)).toBe(true)
  })
})

describe('tiny (tasks 1.2, 7.1)', () => {
  it('a completion record of a habit is not tiny, whatever the series holds', () => {
    const series = { id: 's', title: 'Read', description: '', project_id: null, parent_id: null, priority: 4, due: { date: '2026-10-14' }, labels: [], position: 0,
      created_at: 1, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: 'every day', series_id: null, assignee_id: null, section_id: null,
      ical_extra: null, _clock: {}, habit: true, tiny: true } as unknown as Task
    const rule = parseRule('every day')
    if (!rule.ok) throw new Error('rule')
    const plan = planCompletion(series, rule.rule, [series], 5, '2026-10-14')
    expect(plan.kind).toBe('roll')
    if (plan.kind === 'roll') expect(plan.changes[0].patch.tiny).toBe(false)
  })

  it('logging the tiny version completes the occurrence with tiny true, counts as done and lists in Completed', async () => {
    const id = await habit('Read', 'every day', '2026-10-14')
    await checkIn(id, true, { today: '2026-10-14' })
    const rec = (await db.tasks.get(occurrenceId(id, '2026-10-14')))!
    expect(rec).toMatchObject({ tiny: true, skipped: false })
    expect(rec.completed_at).not.toBeNull()
    const series = (await db.tasks.get(id))!
    expect(series.due?.date).toBe('2026-10-15')
    const rows = await lineageRows(id)
    expect(habitStats(series, rows, '2026-10-15')).toMatchObject({ current: 1, kept: 1, keptOf: 1 })
    expect(monthGrid(series, rows, 2026, 10, '2026-10-15')[13].state).toBe('tiny')
    const r = runFilter('completed', await db.tasks.toArray(), { today: '2026-10-15', labels: [], projects: [] })
    expect(r.ok && r.tasks.map((x) => x.id)).toEqual([occurrenceId(id, '2026-10-14')])
  })

  it('Tiny on one device, full on another: one done record, tiny as last written', async () => {
    const a = `a-${run()}`
    const b = `b-${run()}`
    await use(a)
    const id = await habit('Read', 'every day', '2026-10-14')
    await syncAll([a, b])
    await use(a)
    await checkIn(id, true, { now: 1000, today: '2026-10-14' })
    await use(b)
    await checkIn(id, false, { now: 2000, today: '2026-10-14' })
    await syncAll([a, b])
    for (const name of [a, b]) {
      await use(name)
      const recs = (await db.tasks.toArray()).filter((x) => x.series_id === id && !x.deleted_at)
      expect(recs).toHaveLength(1)
      expect(recs[0].completed_at).not.toBeNull()
    }
    await use(a)
    const one = (await db.tasks.get(occurrenceId(id, '2026-10-14')))!.tiny
    await use(b)
    expect((await db.tasks.get(occurrenceId(id, '2026-10-14')))!.tiny).toBe(one)
  })
})

describe('editing past days (tasks 8.1, 8.2)', () => {
  async function readWithGap(): Promise<string> {
    const id = await habit('Read', 'every day', '2026-10-10')
    for (const d of ['2026-10-10', '2026-10-11']) await completeTask(id, { today: d })
    // The 12th was forgotten; the series caught up and is due today, the 13th.
    await updateTask(id, { due: { date: '2026-10-13' } })
    return id
  }

  it('Fill in a forgotten day: done without moving the series, counted, one Undo clears it', async () => {
    const id = await readWithGap()
    const rowsBefore = await lineageRows(id)
    const series = (await db.tasks.get(id))!
    expect(monthGrid(series, rowsBefore, 2026, 10, '2026-10-13')[11].state).toBe('missed')
    const r = await setPastDay(id, '2026-10-12', 'done', 5000, '2026-10-13')
    expect(r?.entry).toBeTruthy()
    const after = await lineageRows(id)
    expect((await db.tasks.get(id))!.due?.date).toBe('2026-10-13')
    expect(monthGrid(series, after, 2026, 10, '2026-10-13')[11].state).toBe('done')
    expect(habitStats(series, after, '2026-10-13')).toMatchObject({ current: 3, kept: 3 })
    await undoBatch(r!.entry.id)
    expect(monthGrid(series, await lineageRows(id), 2026, 10, '2026-10-13')[11].state).toBe('missed')
  })

  it('Clear a wrong tick: the day reads missed, leaves Completed, and the record is a tombstone', async () => {
    const id = await readWithGap()
    const rec = occurrenceId(id, '2026-10-11')
    await setPastDay(id, '2026-10-11', 'clear', 6000, '2026-10-13')
    expect((await db.tasks.get(rec))!.deleted_at).toBe(6000)
    const series = (await db.tasks.get(id))!
    expect(monthGrid(series, await lineageRows(id), 2026, 10, '2026-10-13')[10].state).toBe('missed')
    const done = runFilter('completed', (await db.tasks.toArray()).filter((x) => !x.deleted_at), { today: '2026-10-13', labels: [], projects: [] })
    expect(done.ok && done.tasks.map((x) => x.id)).not.toContain(rec)
  })

  it('Edited on two devices: one record in the state written last', async () => {
    const a = `a-${run()}`
    const b = `b-${run()}`
    await use(a)
    const id = await readWithGap()
    await syncAll([a, b])
    await use(a)
    await setPastDay(id, '2026-10-12', 'done', 1000, '2026-10-13')
    await use(b)
    await setPastDay(id, '2026-10-12', 'skipped', 2000, '2026-10-13')
    await syncAll([a, b])
    const states: string[] = []
    for (const name of [a, b]) {
      await use(name)
      const recs = (await db.tasks.toArray()).filter((x) => x.series_id === id && x.occurrence_date === '2026-10-12' && !x.deleted_at)
      expect(recs).toHaveLength(1)
      states.push(recs[0].skipped ? 'skipped' : 'done')
    }
    expect(states[0]).toBe(states[1])
  })

  it('refuses to clear a day with no record', async () => {
    const id = await readWithGap()
    const series = (await db.tasks.get(id))!
    expect(planPastDay(series, await lineageRows(id), '2026-10-12', 'clear', 1, '2026-10-13')).toBeNull()
  })
})

describe('graduation (tasks 9.1, 9.2)', () => {
  it('Floss has stuck: out of every list, projections and reminders, kept for its days', async () => {
    const id = await habit('Floss', 'every day', '2026-10-01')
    for (let d = 1; d <= 13; d++) await completeTask(id, { today: `2026-10-${String(d).padStart(2, '0')}` })
    await graduate(id, 9000, '2026-10-14')
    const series = (await db.tasks.get(id))!
    expect(isGraduated(series)).toBe(true)
    expect(series.recurrence).toBe('every day until 2026-10-13')
    expect(keptDays(series, await lineageRows(id))).toBe(13)
    const all = await db.tasks.toArray()
    expect(todayList(withoutArchived(all, []), '2026-10-20').map((x) => x.id)).not.toContain(id)
    expect(occurrencesInRange(series, all, '2026-10-14', '2026-10-14', '2026-11-30').projections).toEqual([])
    expect(series.completed_at).toBeNull()
  })

  it('Resume after a month: due today, the gap unscheduled, the history kept', async () => {
    const id = await habit('Floss', 'every day', '2026-10-01')
    for (let d = 1; d <= 13; d++) await completeTask(id, { today: `2026-10-${String(d).padStart(2, '0')}` })
    await graduate(id, 9000, '2026-10-14')
    await resume(id, 10000, '2026-11-13')
    const pieces = (await db.tasks.toArray()).filter((x) => x.split_from?.series === id)
    expect(pieces).toHaveLength(1)
    const piece = pieces[0]
    expect(piece).toMatchObject({ habit: true, habit_graduated_at: null, due: { date: '2026-11-13' }, recurrence: 'every day' })
    const rows = await lineageRows(piece.id)
    const oct = monthGrid(piece, rows, 2026, 10, '2026-11-13')
    expect(oct.slice(0, 13).every((c) => c.state === 'done')).toBe(true)
    expect(oct.slice(13).every((c) => c.state === 'blank')).toBe(true)
    expect(monthGrid(piece, rows, 2026, 11, '2026-11-13')[12].state).toBe('pending')
    expect(habitStats(piece, rows, '2026-11-13')).toMatchObject({ current: 13, atRisk: false })
  })

  it('graduating is one undoable batch and never completes the task', async () => {
    const id = await habit('Floss', 'every day', '2026-10-13')
    const plan = planGraduate((await db.tasks.get(id))!, 1, '2026-10-14')!
    expect(plan).toHaveLength(1)
    expect(Object.keys(plan[0].patch).sort()).toEqual(['habit_graduated_at', 'recurrence'])
  })
})

describe('creating habits (task 6.1)', () => {
  it('Create in one step: one task with the rule, the flag, tiny version, anchor and part', async () => {
    const r = await createHabit(input({ tiny: 'One page', anchor: 'After dinner', part: 'evening' }))
    const tk = (await db.tasks.get(r!.id))!
    expect(tk).toMatchObject({ title: 'Read', recurrence: 'every day', habit: true, habit_tiny: 'One page', habit_anchor: 'After dinner', evening: true, project_id: null })
    expect(tk.due).not.toBeNull()
  })

  it('From a one-off task: Every day and the flag in one batch', async () => {
    const id = await createTask({ title: 'Stretch' })
    const before = await db.outbox.count()
    await makeHabit(id, input({ title: 'Stretch' }), '2026-10-14')
    expect((await db.tasks.get(id))!).toMatchObject({ habit: true, recurrence: 'every day', due: { date: '2026-10-14' } })
    expect((await db.outbox.count()) - before).toBeGreaterThan(0)
  })

  it('From a completion-relative task: nothing until a calendar rule is chosen', async () => {
    const id = await createTask({ title: 'Water the plants', due: { date: '2026-10-14' }, recurrence: 'every 3 days after completion' })
    const tk = (await db.tasks.get(id))!
    expect(planMakeHabit(tk, input({ rule: tk.recurrence! }), '2026-10-14')).toBeNull()
    expect(planMakeHabit(tk, input({ rule: 'every 3 days' }), '2026-10-14')).not.toBeNull()
  })
})
