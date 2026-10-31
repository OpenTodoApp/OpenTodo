import { describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { nameId, occurrenceId } from './ids'
import { actOnOccurrence, actOnOccurrenceUndoable } from './occurrenceActions'
import { occurrencesInRange } from './occurrences'
import { applyOps, completeTask, createTask, deleteTask, getDeviceId, mutate, resetDeviceId, updateTask } from './ops'
import { relativeFireAt } from './reminderTime'
import { seriesUpkeep } from './seriesRepair'
import { undoBatch } from './undo'
import type { Op } from './types'

// OpenSpec change series-exceptions: acting on one occurrence on the device
// (tasks 2.1, 2.4, 3.3, 4.2, 5.2, 6.7). Dates are passed as `today`, so the day
// the test runs does not matter.

let n = 0
async function use(name: string) {
  useDatabase(name)
  resetDeviceId()
  await getDeviceId()
}
const fresh = () => use(`series-exceptions-${Date.now()}-${n++}`)

async function outbox(): Promise<Op[]> {
  return (await db.outbox.toArray()).map(({ local: _local, ...op }) => op as Op)
}

const TODAY = '2026-10-12'

describe('acting on one occurrence', () => {
  it('moves Wednesday\'s session alone', async () => {
    await fresh()
    const id = await createTask({ title: 'Study', due: { date: '2026-10-12', time: '18:00' }, recurrence: 'every weekday' })
    const rec = await actOnOccurrence(id, '2026-10-14', { kind: 'move', due: { date: '2026-10-14', time: '19:00' } }, { today: TODAY })
    expect(rec).toBe(occurrenceId(id, '2026-10-14'))
    expect(await db.tasks.get(rec!)).toMatchObject({ occurrence_date: '2026-10-14', due: { date: '2026-10-14', time: '19:00' }, series_id: id, recurrence: null, completed_at: null })
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-12', time: '18:00' })
    const series = (await db.tasks.get(id))!
    const days = occurrencesInRange(series, await db.tasks.toArray(), TODAY, '2026-10-12', '2026-10-16').projections.map((p) => p.date)
    expect(days).toEqual(['2026-10-13', '2026-10-15', '2026-10-16'])
  })

  it('skips next Monday\'s report: no projection, nothing in Completed, the series rolls past it', async () => {
    await fresh()
    const id = await createTask({ title: 'Weekly report', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    await actOnOccurrence(id, '2026-10-19', { kind: 'skip' }, { today: TODAY })
    const rec = (await db.tasks.get(occurrenceId(id, '2026-10-19')))!
    expect(rec).toMatchObject({ skipped: true, occurrence_date: '2026-10-19' })
    await completeTask(id, { today: TODAY })
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-26' })
  })

  it('completes a future occurrence offline: the series stays, the record is queued', async () => {
    await fresh()
    const id = await createTask({ title: 'Study', due: { date: '2026-10-12' }, recurrence: 'every weekday' })
    await actOnOccurrence(id, '2026-10-15', { kind: 'complete' }, { today: TODAY })
    expect((await db.tasks.get(occurrenceId(id, '2026-10-15')))?.completed_at).toBeGreaterThan(0)
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-12' })
    expect((await outbox()).some((o) => o.entityId === occurrenceId(id, '2026-10-15') && o.field === 'occurrence_date')).toBe(true)
  })

  it('refuses a completion-relative series and a date that is not an occurrence', async () => {
    await fresh()
    const rel = await createTask({ title: 'Water', due: { date: '2026-10-12' }, recurrence: 'every 3 days after completion' })
    expect(await actOnOccurrence(rel, '2026-10-15', { kind: 'complete' }, { today: TODAY })).toBeNull()
    const mon = await createTask({ title: 'Report', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    expect(await actOnOccurrence(mon, '2026-10-20', { kind: 'complete' }, { today: TODAY })).toBeNull()
  })

  it('an Undo of a skip leaves an open occurrence on its date, never a trashed record', async () => {
    await fresh()
    const id = await createTask({ title: 'Report', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    const r = await actOnOccurrenceUndoable(id, '2026-10-19', { kind: 'skip' }, { today: TODAY })
    expect(r?.entry).toBeTruthy()
    await undoBatch(r!.entry!.id)
    expect(await db.tasks.get(occurrenceId(id, '2026-10-19'))).toMatchObject({ completed_at: null, skipped: false, deleted_at: null, due: { date: '2026-10-19' } })
  })

  it('deleting an open occurrence writes the skip, not a deletion', async () => {
    await fresh()
    const id = await createTask({ title: 'Study', due: { date: '2026-10-12' }, recurrence: 'every weekday' })
    const rec = (await actOnOccurrence(id, '2026-10-14', { kind: 'move', due: { date: '2026-10-14', time: '19:00' } }, { today: TODAY }))!
    await deleteTask(rec)
    expect(await db.tasks.get(rec)).toMatchObject({ skipped: true, deleted_at: null })
    expect((await db.tasks.get(rec))?.completed_at).toBeGreaterThan(0)
  })
})

describe('series edits carry to untouched records (D6)', () => {
  it('renames a moved session but not one renamed alone', async () => {
    await fresh()
    const id = await createTask({ title: 'Study', due: { date: '2026-10-12', time: '18:00' }, recurrence: 'every weekday' })
    const wed = (await actOnOccurrence(id, '2026-10-14', { kind: 'move', due: { date: '2026-10-14', time: '19:00' } }, { today: TODAY }))!
    const thu = (await actOnOccurrence(id, '2026-10-15', { kind: 'edit', patch: { title: 'Study: mock exam' } }, { today: TODAY }))!
    await updateTask(id, { title: 'Spanish' })
    expect(await db.tasks.get(wed)).toMatchObject({ title: 'Spanish', due: { date: '2026-10-14', time: '19:00' } })
    expect((await db.tasks.get(thu))?.title).toBe('Study: mock exam')
    expect((await db.tasks.get(id))?.title).toBe('Spanish')
  })
})

describe('reminders of a single occurrence (D7)', () => {
  it('copies relative reminders with derived ids and the record\'s own firing time', async () => {
    await fresh()
    const id = await createTask({ title: 'Study', due: { date: '2026-10-12', time: '18:00' }, recurrence: 'every weekday' })
    await mutate('reminder', 'rel', { task_id: id, kind: 'relative', offset_minutes: -15, fire_at: relativeFireAt({ date: '2026-10-12', time: '18:00' }, -15), created_at: 1, deleted_at: null, delivered_at: null, dismissed_at: null })
    await mutate('reminder', 'abs', { task_id: id, kind: 'absolute', offset_minutes: null, fire_at: 123, created_at: 1, deleted_at: null, delivered_at: null, dismissed_at: null })
    const rec = (await actOnOccurrence(id, '2026-10-14', { kind: 'move', due: { date: '2026-10-14', time: '19:00' } }, { today: TODAY }))!
    const copies = await db.reminders.where('task_id').equals(rec).toArray()
    expect(copies.map((r) => r.id)).toEqual([nameId('occurrence-reminder', `${rec}:rel`)])
    expect(copies[0].fire_at).toBe(relativeFireAt({ date: '2026-10-14', time: '19:00' }, -15))
    expect((await db.reminders.get('rel'))?.task_id).toBe(id)
  })
})

describe('after a pull (M5, D12)', () => {
  it('repairs a series that rolled onto another device\'s record', async () => {
    await fresh()
    const id = await createTask({ title: 'Gym', due: { date: '2026-10-14' }, recurrence: 'every mon, wed, fri' })
    // Another device completed the 14th early.
    const rec = occurrenceId(id, '2026-10-14')
    const op = (field: string, value: unknown): Op => ({ id: `${field}-x`, entity: 'task', entityId: rec, field, value, ts: Date.now() + 1000, device: 'other' })
    const ops = [op('series_id', id), op('occurrence_date', '2026-10-14'), op('due', { date: '2026-10-14' }), op('completed_at', 5), op('title', 'Gym')]
    await applyOps(ops)
    const changes = await seriesUpkeep(ops, { today: TODAY, encrypted: false })
    expect(changes).toEqual([{ entity: 'task', entityId: id, patch: { due: { date: '2026-10-16' } } }])
  })

  it('a viewer does not repair', async () => {
    await fresh()
    await db.memberships.put({ projectId: 'shared', role: 'viewer' } as never)
    const id = await createTask({ title: 'Stand-up', project_id: 'shared', due: { date: '2026-10-14' }, recurrence: 'every day' })
    const rec = occurrenceId(id, '2026-10-14')
    const ops: Op[] = ['series_id', 'occurrence_date', 'completed_at'].map((field, i) => ({ id: `v${i}`, entity: 'task', entityId: rec, field, value: [id, '2026-10-14', 5][i], ts: Date.now() + 1000, device: 'other' }))
    await applyOps(ops)
    expect(await seriesUpkeep(ops, { today: TODAY, encrypted: false })).toEqual([])
  })

  it('fills an empty server-made record from its series on an encrypted account', async () => {
    await fresh()
    const id = await createTask({ title: 'Journal', description: 'Three lines', due: { date: '2026-10-12' }, recurrence: 'every day' })
    const rec = occurrenceId(id, '2026-10-12')
    const ops: Op[] = ['series_id', 'occurrence_date', 'completed_at', 'due'].map((field, i) => ({ id: `e${i}`, entity: 'task', entityId: rec, field, value: [id, '2026-10-12', 5, { date: '2026-10-12' }][i], ts: Date.now() + 1000, device: 'server' }))
    await applyOps(ops)
    expect(await seriesUpkeep(ops, { today: TODAY, encrypted: true })).toContainEqual({ entity: 'task', entityId: rec, patch: { title: 'Journal', description: 'Three lines' } })
  })
})
