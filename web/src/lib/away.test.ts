// Away periods (OpenSpec change away-periods): the stored value read as the
// server reads it (shared vectors), and the skips of "Set an away period" and
// "Skipping inside the period".
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatAway, parseAway, quietOn, awayOn } from './away'
import { endAway, planAwayLocal, setAway } from './awayActions'
import { db, useDatabase } from './db'
import { habitStats } from './habits'
import { occurrenceId } from './ids'
import { applyOps, completeTask, createProject, createTask, getDeviceId, resetDeviceId, updateTask } from './ops'
import { dueReminders } from './reminderWatcher'
import { shellReminders } from './shellPublish'
import type { Op, Reminder, Task } from './types'
import { undoBatch } from './undo'
import { USER_PREFS_ID } from './userPrefs'

interface Vectors {
  parse: { value: string; valid: boolean; from?: string; to?: string; quiet?: boolean }[]
  holds: { value: string; today: string; away: boolean; quiet: boolean }[]
}
const vectors = JSON.parse(readFileSync(resolve(__dirname, '../../../internal/sync/testdata/away.vectors.json'), 'utf8')) as Vectors

describe('the stored value (shared vectors)', () => {
  it.each(vectors.parse)('parses $value', (c) => {
    const a = parseAway(c.value)
    expect(a !== null).toBe(c.valid)
    if (a) {
      expect(a).toEqual({ from: c.from, to: c.to, quiet: c.quiet })
      expect(formatAway(a)).toBe(c.value)
    }
  })
  it.each(vectors.holds)('$value on $today', (c) => {
    expect(awayOn(c.value, c.today) !== null).toBe(c.away)
    expect(quietOn(c.value, c.today)).toBe(c.quiet)
  })
})

let n = 0
async function use(name: string) {
  useDatabase(name)
  resetDeviceId()
  await getDeviceId()
}
beforeEach(async () => { await use(`away-${Date.now()}-${n++}`) })

const live = (seriesId: string) => db.tasks.filter((t) => t.series_id === seriesId && !t.deleted_at).toArray()
const skippedDates = async (seriesId: string) => (await live(seriesId)).filter((t) => t.skipped).map((t) => t.occurrence_date).sort()
const dueOf = async (id: string) => (await db.tasks.get(id))?.due?.date

async function habit(title: string, rule: string, due: string): Promise<string> {
  const id = await createTask({ title, due: { date: due }, recurrence: rule })
  await updateTask(id, { habit: true })
  return id
}

const everything = { all: true } as const

describe('Set an away period', () => {
  it('a week\'s holiday skips every occurrence in the range, with one Undo', async () => {
    const stretch = await habit('Stretch', 'every day', '2026-11-23')
    const bins = await createTask({ title: 'Take out the bins', due: { date: '2026-11-26' }, recurrence: 'every thursday' })
    const today = '2026-11-20'
    const r = await setAway({ from: '2026-11-24', to: '2026-11-30', scope: everything, quiet: true }, { today })
    expect(await skippedDates(stretch)).toEqual(['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30'])
    expect(await dueOf(stretch)).toBe('2026-11-23')
    // The bins' current occurrence, Thursday the 26th, is skipped: the series moves to the next Thursday.
    expect(await dueOf(bins)).toBe('2026-12-03')
    expect(r.plan).toMatchObject({ occurrences: 8, series: 2 })
    expect((await db.userPrefs.get(USER_PREFS_ID))?.away).toBe('2026-11-24..2026-11-30 quiet')

    await undoBatch(r.entry!.id)
    expect(await skippedDates(stretch)).toEqual([])
    expect(await dueOf(bins)).toBe('2026-11-26')
    expect((await db.userPrefs.get(USER_PREFS_ID))?.away ?? '').toBe('')
  })

  it('the current occurrence inside the period moves the series past it', async () => {
    const water = await createTask({ title: 'Water', due: { date: '2026-11-24' }, recurrence: 'every day' })
    await setAway({ from: '2026-11-24', to: '2026-11-26', scope: everything, quiet: false }, { today: '2026-11-24' })
    expect(await dueOf(water)).toBe('2026-11-27')
    // The current one moves the series and writes no record (series-exceptions D3); the later ones are records.
    expect(await skippedDates(water)).toEqual(['2026-11-25', '2026-11-26'])
  })

  it('only the chosen projects and labels', async () => {
    const work = await createProject({ name: 'Work' })
    const home = await createProject({ name: 'Home' })
    const report = await createTask({ title: 'Report', project_id: work, due: { date: '2026-11-25' }, recurrence: 'every day' })
    const plants = await createTask({ title: 'Water the plants', project_id: home, due: { date: '2026-11-25' }, recurrence: 'every day' })
    const tagged = await createTask({ title: 'Call', project_id: home, labels: ['phone'], due: { date: '2026-11-25' }, recurrence: 'every day' })
    await setAway({ from: '2026-11-24', to: '2026-11-30', scope: { all: false, projects: [work], labels: ['phone'] }, quiet: true }, { today: '2026-11-24' })
    expect(await dueOf(report)).toBe('2026-12-01')
    expect(await dueOf(tagged)).toBe('2026-12-01')
    expect(await dueOf(plants)).toBe('2026-11-25')
  })

  it('a series the user may not edit is not covered, and a plain task keeps its date', async () => {
    const shared = await createProject({ name: 'Shared' })
    await db.memberships.put({ projectId: shared, role: 'viewer', ownerId: 'alice', members: [] })
    const theirs = await createTask({ title: 'Theirs', project_id: shared, due: { date: '2026-11-25' }, recurrence: 'every day' })
    const once = await createTask({ title: 'Dentist', due: { date: '2026-11-25' } })
    const plan = await planAwayLocal({ from: '2026-11-24', to: '2026-11-30', scope: everything, quiet: true }, { today: '2026-11-24' })
    expect(plan.changes.some((c) => c.entityId === theirs)).toBe(false)
    expect(plan.changes.some((c) => c.entityId === once)).toBe(false)
    expect(plan.series).toBe(0)
  })

  it('setting a new period replaces the stored one, and End now clears it and keeps the skips', async () => {
    const stretch = await habit('Stretch', 'every day', '2026-11-20')
    await setAway({ from: '2026-11-24', to: '2026-11-25', scope: everything, quiet: true }, { today: '2026-11-20' })
    await setAway({ from: '2026-12-01', to: '2026-12-02', scope: everything, quiet: false }, { today: '2026-11-20' })
    expect((await db.userPrefs.get(USER_PREFS_ID))?.away).toBe('2026-12-01..2026-12-02')
    await endAway()
    expect((await db.userPrefs.get(USER_PREFS_ID))?.away).toBe('')
    expect(await skippedDates(stretch)).toEqual(['2026-11-24', '2026-11-25', '2026-12-01', '2026-12-02'])
  })
})

describe('Skipping inside the period', () => {
  it('after the fact: overdue days become skipped records and the streak is unbroken', async () => {
    const stretch = await habit('Stretch', 'every day', '2026-11-23')
    await completeTask(stretch, { today: '2026-11-23' })
    expect(await dueOf(stretch)).toBe('2026-11-24')
    await setAway({ from: '2026-11-24', to: '2026-11-26', scope: everything, quiet: true }, { today: '2026-11-27' })
    expect(await skippedDates(stretch)).toEqual(['2026-11-24', '2026-11-25', '2026-11-26'])
    expect(await dueOf(stretch)).toBe('2026-11-27')
    const series = (await db.tasks.get(stretch))!
    const stats = habitStats(series, await db.tasks.toArray(), '2026-11-27')!
    expect(stats.overdue).toBe(false)
    expect(stats.current).toBeGreaterThanOrEqual(1)
  })

  it('a completion-relative rule due in the period moves to the day after it', async () => {
    const ferns = await createTask({ title: 'Water the ferns', due: { date: '2026-11-26' }, recurrence: 'every 3 days after completion' })
    const ferny = await habit('Mist', 'every 3 days after completion', '2026-11-26')
    await setAway({ from: '2026-11-24', to: '2026-11-30', scope: everything, quiet: true }, { today: '2026-11-20' })
    expect(await dueOf(ferns)).toBe('2026-12-01')
    expect(await dueOf(ferny)).toBe('2026-12-01')
    expect(await skippedDates(ferny)).toEqual(['2026-11-26'])
  })

  it('applying the same period twice writes no second record', async () => {
    const stretch = await habit('Stretch', 'every day', '2026-11-20')
    const input = { from: '2026-11-24', to: '2026-11-25', scope: everything, quiet: true }
    await setAway(input, { today: '2026-11-20' })
    const again = await planAwayLocal(input, { today: '2026-11-20' })
    expect(again.occurrences).toBe(0)
    expect((await live(stretch)).length).toBe(2)
  })

  it('two devices setting the same period offline converge to one record per day and one due date', async () => {
    const first = `away-a-${n++}`
    const second = `away-b-${n++}`
    await use(first)
    const stretch = await habit('Stretch', 'every day', '2026-11-24')
    const seed = (await db.outbox.toArray()).map(({ local: _l, ...op }) => op as Op)
    await use(second)
    await applyOps(seed)
    const opsOf = async () => (await db.outbox.toArray()).map(({ local: _l, ...op }) => op as Op)
    const input = { from: '2026-11-24', to: '2026-11-26', scope: everything, quiet: true }
    await setAway(input, { today: '2026-11-24' })
    const fromSecond = await opsOf()
    await use(first)
    await setAway(input, { today: '2026-11-24' })
    const fromFirst = await opsOf()
    await applyOps(fromSecond)
    const a = await live(stretch)
    await use(second)
    await applyOps(fromFirst)
    const b = await live(stretch)
    expect(a.map((t) => t.id).sort()).toEqual([occurrenceId(stretch, '2026-11-24'), occurrenceId(stretch, '2026-11-25'), occurrenceId(stretch, '2026-11-26')].sort())
    expect(b.map((t) => t.id).sort()).toEqual(a.map((t) => t.id).sort())
    expect(await dueOf(stretch)).toBe('2026-11-27')
  })
})

describe('While away: local notifications', () => {
  const task = { id: 't1', title: 'Call the dentist', completed_at: null, deleted_at: null, project_id: null } as unknown as Task
  const at = (iso: string) => new Date(`${iso}T09:00:00`).getTime()
  const reminder = (fireAt: number) => ({ id: 'r1', task_id: 't1', kind: 'absolute', offset_minutes: null, fire_at: fireAt, delivered_at: null, dismissed_at: null, created_at: 0, deleted_at: null }) as unknown as Reminder
  const tasks = new Map([['t1', task]])

  it('a reminder inside a quiet period is not shown, then or after the period', () => {
    const quiet = '2026-11-24..2026-11-30 quiet'
    expect(dueReminders([reminder(at('2026-11-26'))], tasks, at('2026-11-26') + 1000, {}, new Map(), quiet)).toEqual([])
    expect(dueReminders([reminder(at('2026-11-26'))], tasks, at('2026-12-02'), {}, new Map(), quiet)).toEqual([])
    expect(dueReminders([reminder(at('2026-12-01'))], tasks, at('2026-12-01') + 1000, {}, new Map(), quiet)).toHaveLength(1)
    expect(shellReminders([reminder(at('2026-11-26'))], [task], at('2026-11-25'), { titles: true, encrypted: false, away: quiet })).toEqual([])
  })

  it('a period that keeps reminders shows them', () => {
    expect(dueReminders([reminder(at('2026-11-26'))], tasks, at('2026-11-26') + 1000, {}, new Map(), '2026-11-24..2026-11-30')).toHaveLength(1)
  })
})
