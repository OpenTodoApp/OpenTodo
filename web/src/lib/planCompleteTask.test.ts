// planCompleteTask plans what completeTask writes (ops.ts): applied with mutateMany it
// leaves the same rows, for a plain task with subtasks, a repeating task and a task
// with a running timer. The native app applies the plan as an undoable batch.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { completeTask, createSubtask, createTask, getDeviceId, mutateMany, planCompleteTask, resetDeviceId } from './ops'
import { applyBatch, undoBatch } from './undo'
import { toProposed } from './bulk'
import type { Task } from './types'

const TODAY = '2026-11-13'
const NOW = Date.parse(`${TODAY}T10:00:00Z`)
const opts = { now: NOW, today: TODAY }

let n = 0
async function fresh() {
  useDatabase(`plan-complete-${Date.now()}-${n++}`)
  resetDeviceId()
  await getDeviceId()
  await db.meta.put({ key: 'userId', value: 'u-ana' })
}
beforeEach(fresh)

/** What a completion left: each task's title, completion and date; each time entry's end. */
async function state() {
  const tasks = (await db.tasks.toArray()).map((t: Task) => `${t.title}|${t.completed_at ?? ''}|${t.due?.date ?? ''}|${t.series_id ? 'record' : ''}`).sort()
  const entries = (await db.timeEntries.toArray()).map((e) => e.ended_at)
  return { tasks, entries }
}

async function seed() {
  const plain = await createTask({ title: 'Pack' })
  await createSubtask(plain, 'Socks')
  const done = await createSubtask(plain, 'Shirts')
  await completeTask(done, { now: NOW - 1000, today: TODAY })
  const series = await createTask({ title: 'Water the plants', due: { date: TODAY }, recurrence: 'every day' })
  const timed = await createTask({ title: 'Write the report' })
  await mutateMany([{ entity: 'time_entry', entityId: 'e1', patch: { task_id: timed, user_id: 'u-ana', started_at: NOW - 60_000, ended_at: null, created_at: NOW - 60_000 } }])
  return { plain, series, timed }
}

describe('planCompleteTask', () => {
  it('plans the same rows completeTask writes', async () => {
    const a = await seed()
    for (const id of [a.plain, a.series, a.timed]) await completeTask(id, opts)
    const written = await state()

    await fresh()
    const b = await seed()
    for (const id of [b.plain, b.series, b.timed]) await mutateMany(await planCompleteTask(id, opts))
    expect(await state()).toEqual(written)
    expect(written.tasks).toContain(`Socks|${NOW}||`)
    expect(written.tasks).toContain('Water the plants||2026-11-14|')
    expect(written.entries).toEqual([NOW])
  })

  it('plans nothing for a completed, deleted or unknown task', async () => {
    const id = await createTask({ title: 'Done' })
    await completeTask(id, opts)
    expect(await planCompleteTask(id, opts)).toEqual([])
    expect(await planCompleteTask('nope', opts)).toEqual([])
  })

  it('is undone in one step as a batch: the task, its subtasks and the series; a stopped timer stays stopped', async () => {
    const a = await seed()
    const before = await state()
    const undo: string[] = []
    for (const id of [a.plain, a.series, a.timed]) {
      const entry = await applyBatch(await toProposed(await planCompleteTask(id, opts)), { source: 'action' })
      undo.push(entry!.id)
    }
    expect(await state()).not.toEqual(before)
    for (const id of undo.reverse()) await undoBatch(id)
    const after = await state()
    // The occurrence record goes to the Trash; every other row is as it was.
    expect(after.entries).toEqual([NOW])
    expect(after.tasks.filter((t) => !t.endsWith('|record'))).toEqual(before.tasks)
    expect((await db.tasks.toArray()).filter((t) => t.series_id).every((t) => !!t.deleted_at)).toBe(true)
  })
})
