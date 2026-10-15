import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { detachedId, occurrenceId } from './ids'
import {
  applyOps, completeTask, createTask, deleteTask, detachOccurrence, getDeviceId, resetDeviceId, setRecurrence, setTaskCompleted, skipOccurrence, updateTask,
} from './ops'
import type { Op, Task } from './types'

let n = 0
const run = () => `${Date.now()}-${n++}`

/** Switch the module-level database to a device's store (its device id lives in that store). */
async function use(name: string) {
  useDatabase(name)
  resetDeviceId()
  await getDeviceId()
}

async function outbox(): Promise<Op[]> {
  return (await db.outbox.toArray()).map(({ local: _local, ...op }) => op as Op)
}

/** Every op each device has produced reaches the other (the server relays them). */
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

async function snapshot(name: string): Promise<string> {
  await use(name)
  const tasks = await db.tasks.orderBy('id').toArray()
  return JSON.stringify(tasks)
}

async function records(seriesId: string): Promise<Task[]> {
  return db.tasks.filter((t) => t.series_id === seriesId && !t.deleted_at).toArray()
}

/** Create a series on device A and copy it to device B (both then go offline). */
async function seriesOnTwoDevices(input: Parameters<typeof createTask>[0]) {
  const a = `A-${run()}`
  const b = `B-${run()}`
  await use(a)
  const id = await createTask(input)
  await syncAll([a, b])
  return { a, b, id }
}

beforeEach(async () => {
  await use(`recurring-${run()}`)
})

describe('completeTask on a recurring task', () => {
  it('records the occurrence and moves the series to the next one, keeping rule and time', async () => {
    const id = await createTask({ title: 'Stand-up', due: { date: '2026-10-12', time: '09:00' }, recurrence: 'every day' })
    const recordId = await completeTask(id, { today: '2026-10-12' })
    expect(recordId).toBe(occurrenceId(id, '2026-10-12'))
    const series = await db.tasks.get(id)
    expect(series).toMatchObject({ completed_at: null, recurrence: 'every day', due: { date: '2026-10-13', time: '09:00' } })
    const record = await db.tasks.get(recordId!)
    expect(record).toMatchObject({ title: 'Stand-up', series_id: id, recurrence: null, due: { date: '2026-10-12', time: '09:00' } })
    expect(record?.completed_at).toBeGreaterThan(0)
  })

  it('a zoned series keeps its zone as it rolls (absolute-datetimes)', async () => {
    const id = await createTask({ title: 'Stand-up', due: { date: '2026-10-12', time: '09:00', tz: 'Europe/Berlin' }, recurrence: 'every day' })
    const recordId = await completeTask(id, { today: '2026-10-12' })
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-13', time: '09:00', tz: 'Europe/Berlin' })
    expect((await db.tasks.get(recordId!))?.due).toEqual({ date: '2026-10-12', time: '09:00', tz: 'Europe/Berlin' })
  })

  it('setTaskCompleted (list, keyboard, detail panel) uses the same flow', async () => {
    const id = await createTask({ title: 'Bins', due: { date: '2020-01-01' }, recurrence: 'every week' })
    await setTaskCompleted(id, true)
    expect((await db.tasks.get(id))?.completed_at).toBeNull()
    expect(await records(id)).toHaveLength(1)
  })

  it('catches up when overdue instead of piling up occurrences', async () => {
    const id = await createTask({ title: 'Water plants', due: { date: '2026-10-05' }, recurrence: 'every day' })
    await completeTask(id, { today: '2026-10-10' })
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-11' })
    expect(await records(id)).toHaveLength(1)
  })

  it('completion-relative rules count from the completion date', async () => {
    const id = await createTask({ title: 'Mow', due: { date: '2026-10-12' }, recurrence: 'every 3 days after completion' })
    await completeTask(id, { today: '2026-10-14' })
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-17' })
  })

  it('carries series edits into later occurrences without a prompt', async () => {
    const id = await createTask({ title: 'Old name', due: { date: '2026-10-12' }, recurrence: 'every day' })
    await updateTask(id, { title: 'New name', priority: 1 })
    const recordId = await completeTask(id, { today: '2026-10-12' })
    expect(await db.tasks.get(recordId!)).toMatchObject({ title: 'New name', priority: 1 })
    expect(await db.tasks.get(id)).toMatchObject({ title: 'New name', recurrence: 'every day' })
  })

  it('until: completing the last occurrence completes the series like a plain task', async () => {
    const id = await createTask({ title: 'Course', due: { date: '2026-10-12' }, recurrence: 'every day until 2026-10-12' })
    expect(await completeTask(id, { today: '2026-10-12' })).toBeNull()
    expect((await db.tasks.get(id))?.completed_at).toBeGreaterThan(0)
    expect(await records(id)).toHaveLength(0)
  })

  it('for 2 times ends the series on the second completion; skips do not count', async () => {
    const id = await createTask({ title: 'Twice', due: { date: '2026-10-12' }, recurrence: 'every monday for 2 times' })
    expect(await skipOccurrence(id, { today: '2026-10-12' })).toBe(true)
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-19' })
    await completeTask(id, { today: '2026-10-19' })
    expect(await db.tasks.get(id)).toMatchObject({ completed_at: null, due: { date: '2026-10-26' } })
    await completeTask(id, { today: '2026-10-26' })
    expect((await db.tasks.get(id))?.completed_at).toBeGreaterThan(0)
    // Completed lists the first occurrence record and the ended series itself.
    expect(await records(id)).toHaveLength(1)
    expect(await db.tasks.filter((t) => !!t.completed_at).count()).toBe(2)
  })

  it('reopening an ended series keeps its rule; reopening a record yields a standalone task', async () => {
    const id = await createTask({ title: 'Twice', due: { date: '2026-10-12' }, recurrence: 'every day for 2 times' })
    const recordId = await completeTask(id, { today: '2026-10-12' })
    await setTaskCompleted(recordId!, false)
    expect(await db.tasks.get(recordId!)).toMatchObject({ completed_at: null, recurrence: null, series_id: id, due: { date: '2026-10-12' } })
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-13' })
    // The reopened record no longer counts, so this completion is not the last one.
    await completeTask(id, { today: '2026-10-13' })
    expect(await db.tasks.get(id)).toMatchObject({ completed_at: null, due: { date: '2026-10-14' } })
    await completeTask(id, { today: '2026-10-14' })
    expect((await db.tasks.get(id))?.completed_at).toBeGreaterThan(0)
    await setTaskCompleted(id, false)
    expect(await db.tasks.get(id)).toMatchObject({ completed_at: null, recurrence: 'every day for 2 times' })
  })

  it('a plain task, a completed series and a task with an unparseable rule complete normally', async () => {
    const plain = await createTask({ title: 'Once' })
    await completeTask(plain)
    expect((await db.tasks.get(plain))?.completed_at).toBeGreaterThan(0)
    const weird = await createTask({ title: 'From an old export', due: { date: '2026-10-12' } })
    await applyOps([{ id: 'x', entity: 'task', entityId: weird, field: 'recurrence', value: 'every blursday', ts: Date.now() + 1000, device: 'z' }])
    await completeTask(weird, { today: '2026-10-12' })
    expect((await db.tasks.get(weird))?.completed_at).toBeGreaterThan(0)
  })
})

describe('skip and detach', () => {
  it('skip moves to the next occurrence without a record', async () => {
    const id = await createTask({ title: 'Gym', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    expect(await skipOccurrence(id, { today: '2026-10-10' })).toBe(true)
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-19' })
    expect(await records(id)).toHaveLength(0)
  })

  it('skip refuses the last occurrence before until and non-recurring tasks', async () => {
    const id = await createTask({ title: 'Last', due: { date: '2026-10-12' }, recurrence: 'every day until 2026-10-12' })
    expect(await skipOccurrence(id, { today: '2026-10-12' })).toBe(false)
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-12' })
    expect(await skipOccurrence(await createTask({ title: 'plain' }))).toBe(false)
  })

  it('"this occurrence only" creates a standalone copy and moves the series', async () => {
    const id = await createTask({ title: 'Team sync', due: { date: '2026-10-12' }, recurrence: 'every monday', labels: ['work'] })
    const copyId = await detachOccurrence(id, { today: '2026-10-10' })
    expect(copyId).toBe(detachedId(id, '2026-10-12'))
    await updateTask(copyId!, { due: { date: '2026-10-13' } })
    expect(await db.tasks.get(copyId!)).toMatchObject({ title: 'Team sync', recurrence: null, series_id: id, completed_at: null, due: { date: '2026-10-13' }, labels: ['work'] })
    expect(await db.tasks.get(id)).toMatchObject({ recurrence: 'every monday', due: { date: '2026-10-19' } })
    // A detached copy is not a completed occurrence, even once completed.
    await setTaskCompleted(copyId!, true)
    expect((await db.tasks.get(copyId!))?.completed_at).toBeGreaterThan(0)
  })
})

describe('setRecurrence', () => {
  it('stores the canonical form, rejects invalid rules and keeps the previous one', async () => {
    const id = await createTask({ title: 'T', due: { date: '2026-10-12' } })
    expect(await setRecurrence(id, 'Every  2nd  Tuesday')).toEqual({ ok: true, rule: 'every 2nd tuesday' })
    const bad = await setRecurrence(id, 'every blursday')
    expect(bad.ok).toBe(false)
    expect(await setRecurrence(id, 'every day' + ' '.repeat(200))).toMatchObject({ ok: false })
    expect((await db.tasks.get(id))?.recurrence).toBe('every 2nd tuesday')
    expect(await setRecurrence(id, '')).toEqual({ ok: true, rule: null })
    expect((await db.tasks.get(id))?.recurrence).toBeNull()
  })

  it('gives an undated task its first occurrence, and clearing the due date clears the rule', async () => {
    const id = await createTask({ title: 'T' })
    await setRecurrence(id, 'every weekday', { today: '2026-10-10' })
    expect(await db.tasks.get(id)).toMatchObject({ recurrence: 'every weekday', due: { date: '2026-10-12' } })
    await updateTask(id, { due: null })
    expect(await db.tasks.get(id)).toMatchObject({ recurrence: null, due: null })
  })

  it('createTask with a rule and no due date starts at the first occurrence', async () => {
    const id = await createTask({ title: 'T', recurrence: 'every day' })
    expect((await db.tasks.get(id))?.due?.date).toMatch(/^\d{4}-\d\d-\d\d$/)
    await expect(createTask({ title: 'bad', recurrence: 'every blursday' })).rejects.toThrow()
  })
})

describe('convergence across offline devices', () => {
  it('two devices completing the same occurrence end with one record and one next due', async () => {
    const { a, b, id } = await seriesOnTwoDevices({ title: 'Daily', due: { date: '2026-10-12' }, recurrence: 'every day' })
    await use(a)
    await completeTask(id, { today: '2026-10-12' })
    await use(b)
    await completeTask(id, { today: '2026-10-12' })
    await syncAll([a, b])
    for (const dev of [a, b]) {
      await use(dev)
      const recs = await records(id)
      expect(recs).toHaveLength(1)
      expect(recs[0].id).toBe(occurrenceId(id, '2026-10-12'))
      expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-13' })
    }
    expect(await snapshot(a)).toBe(await snapshot(b))
  })

  it('completion-relative on different days: one record, the later stamp decides the due date', async () => {
    const { a, b, id } = await seriesOnTwoDevices({ title: 'Mow', due: { date: '2026-10-12' }, recurrence: 'every 3 days after completion' })
    await use(a)
    await completeTask(id, { today: '2026-10-12' }) // Monday
    await use(b)
    await completeTask(id, { today: '2026-10-13' }) // Tuesday, stamped later
    await syncAll([a, b])
    for (const dev of [a, b]) {
      await use(dev)
      expect(await records(id)).toHaveLength(1)
      expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-16' })
    }
    expect(await snapshot(a)).toBe(await snapshot(b))
  })

  it('two devices skipping the same occurrence land on the same next occurrence, not two ahead', async () => {
    const { a, b, id } = await seriesOnTwoDevices({ title: 'Gym', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    await use(a)
    await skipOccurrence(id, { today: '2026-10-10' })
    await use(b)
    await skipOccurrence(id, { today: '2026-10-11' })
    await syncAll([a, b])
    for (const dev of [a, b]) {
      await use(dev)
      expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-19' })
      expect(await records(id)).toHaveLength(0)
    }
  })

  it('two devices detaching the same occurrence end with exactly one copy', async () => {
    const { a, b, id } = await seriesOnTwoDevices({ title: 'Sync', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    await use(a)
    await detachOccurrence(id, { today: '2026-10-10' })
    await use(b)
    await detachOccurrence(id, { today: '2026-10-10' })
    await syncAll([a, b])
    for (const dev of [a, b]) {
      await use(dev)
      const copies = await records(id)
      expect(copies.map((t) => t.id)).toEqual([detachedId(id, '2026-10-12')])
      expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-19' })
    }
  })

  it('for 10 times: both devices complete the ninth offline; one ninth record, same tenth due, ends after the tenth', async () => {
    const { a, b, id } = await seriesOnTwoDevices({ title: 'Course', due: { date: '2026-10-01' }, recurrence: 'every day for 10 times' })
    await use(a)
    for (let d = 1; d <= 8; d++) await completeTask(id, { today: `2026-10-0${d}` })
    await syncAll([a, b])
    await use(a)
    await completeTask(id, { today: '2026-10-09' })
    await use(b)
    await completeTask(id, { today: '2026-10-09' })
    await syncAll([a, b])
    for (const dev of [a, b]) {
      await use(dev)
      expect(await records(id)).toHaveLength(9)
      expect(await db.tasks.get(id)).toMatchObject({ completed_at: null, due: { date: '2026-10-10' } })
    }
    await use(b)
    expect(await completeTask(id, { today: '2026-10-10' })).toBeNull()
    await syncAll([a, b])
    for (const dev of [a, b]) {
      await use(dev)
      expect((await db.tasks.get(id))?.completed_at).toBeGreaterThan(0)
      expect(await records(id)).toHaveLength(9)
    }
    expect(await snapshot(a)).toBe(await snapshot(b))
  })

  it('a series deleted on one device while another completes it offline stays deleted; the record remains', async () => {
    const { a, b, id } = await seriesOnTwoDevices({ title: 'Doomed', due: { date: '2026-10-12' }, recurrence: 'every day' })
    await use(a)
    await deleteTask(id)
    await use(b)
    const recordId = await completeTask(id, { today: '2026-10-12' })
    await syncAll([a, b])
    for (const dev of [a, b]) {
      await use(dev)
      expect((await db.tasks.get(id))?.deleted_at).toBeGreaterThan(0)
      expect(await db.tasks.get(recordId!)).toMatchObject({ deleted_at: null, series_id: id })
      expect((await db.tasks.get(recordId!))?.completed_at).toBeGreaterThan(0)
    }
  })

  it('concurrent rule edits converge on the later rule', async () => {
    const { a, b, id } = await seriesOnTwoDevices({ title: 'R', due: { date: '2026-10-12' }, recurrence: 'every week' })
    await use(a)
    await setRecurrence(id, 'every day')
    await use(b)
    await setRecurrence(id, 'every week')
    await setRecurrence(id, 'every 2 weeks')
    await syncAll([a, b])
    expect(await snapshot(a)).toBe(await snapshot(b))
    await use(a)
    expect((await db.tasks.get(id))?.recurrence).toBe('every 2 weeks')
  })
})

describe('deadlines follow the series (OpenSpec deadlines 8.1)', () => {
  it('weekly report: the series moves its deadline, the record keeps the old one', async () => {
    const id = await createTask({ title: 'Report', due: { date: '2026-10-12' }, deadline: '2026-10-14', recurrence: 'every monday' })
    await completeTask(id, { today: '2026-10-12' })
    expect(await db.tasks.get(id)).toMatchObject({ due: { date: '2026-10-19' }, deadline: '2026-10-21' })
    expect((await db.tasks.get(occurrenceId(id, '2026-10-12')))?.deadline).toBe('2026-10-14')
  })

  it('catch-up keeps the distance', async () => {
    const id = await createTask({ title: 'Daily', due: { date: '2026-10-09' }, deadline: '2026-10-10', recurrence: 'every day' })
    await completeTask(id, { today: '2026-10-14' })
    expect(await db.tasks.get(id)).toMatchObject({ due: { date: '2026-10-15' }, deadline: '2026-10-16' })
  })

  it('skip and detach move the deadline too; the copy keeps its own', async () => {
    const id = await createTask({ title: 'Gym', due: { date: '2026-10-12' }, deadline: '2026-10-13', recurrence: 'every monday' })
    await skipOccurrence(id, { today: '2026-10-10' })
    expect((await db.tasks.get(id))?.deadline).toBe('2026-10-20')
    await detachOccurrence(id, { today: '2026-10-10' })
    expect((await db.tasks.get(id))?.deadline).toBe('2026-10-27')
    expect((await db.tasks.get(detachedId(id, '2026-10-19')))?.deadline).toBe('2026-10-20')
  })

  it('a series without a deadline writes no deadline op', async () => {
    const id = await createTask({ title: 'Plain', due: { date: '2026-10-12' }, recurrence: 'every day' })
    await db.outbox.clear()
    await completeTask(id, { today: '2026-10-12' })
    expect((await outbox()).some((o) => o.field === 'deadline')).toBe(false)
    expect((await db.tasks.get(id))?.deadline ?? null).toBeNull()
  })

  it('two devices completing offline converge on the same deadline', async () => {
    const { a, b, id } = await seriesOnTwoDevices({ title: 'Report', due: { date: '2026-10-12' }, deadline: '2026-10-14', recurrence: 'every monday' })
    await use(a)
    await completeTask(id, { today: '2026-10-12' })
    await use(b)
    await completeTask(id, { today: '2026-10-13' })
    await syncAll([a, b])
    for (const dev of [a, b]) {
      await use(dev)
      expect(await records(id)).toHaveLength(1)
      expect(await db.tasks.get(id)).toMatchObject({ due: { date: '2026-10-19' }, deadline: '2026-10-21' })
    }
    expect(await snapshot(a)).toBe(await snapshot(b))
  })
})

describe('start and evening follow the series (OpenSpec someday-and-evening 7.1)', () => {
  it('weekly task hidden until its day', async () => {
    const id = await createTask({ title: 'Plan the week', due: { date: '2026-10-19' }, start: '2026-10-17', recurrence: 'every monday' })
    await completeTask(id, { today: '2026-10-19' })
    expect(await db.tasks.get(id)).toMatchObject({ due: { date: '2026-10-26' }, start: '2026-10-24' })
    expect((await db.tasks.get(occurrenceId(id, '2026-10-19')))?.start).toBe('2026-10-17')
  })

  it('evening routine keeps the flag; the record carries it', async () => {
    const id = await createTask({ title: 'Stretch', due: { date: '2026-10-14' }, evening: true, recurrence: 'every day' })
    await completeTask(id, { today: '2026-10-14' })
    expect(await db.tasks.get(id)).toMatchObject({ due: { date: '2026-10-15' }, evening: true })
    expect((await db.tasks.get(occurrenceId(id, '2026-10-14')))?.evening).toBe(true)
  })

  it('two devices completing offline converge on the same start', async () => {
    const { a, b, id } = await seriesOnTwoDevices({ title: 'Plan', due: { date: '2026-10-19' }, start: '2026-10-17', recurrence: 'every monday' })
    await use(a)
    await completeTask(id, { today: '2026-10-19' })
    await use(b)
    await completeTask(id, { today: '2026-10-19' })
    await syncAll([a, b])
    expect(await snapshot(a)).toBe(await snapshot(b))
    await use(a)
    expect((await db.tasks.get(id))?.start).toBe('2026-10-24')
  })
})
