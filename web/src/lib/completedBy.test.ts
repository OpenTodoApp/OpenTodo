// Who completed a task (OpenSpec change completed-date-filters, task 3.1):
// completed_by rides in the same batch as completed_at on every completion path.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { toVersions } from './historyVersions'
import { restoreValue } from './history'
import { occurrenceId } from './ids'
import { completeTask, createSubtask, createTask, getDeviceId, mutateMany, resetDeviceId, setTaskCompleted, withCompletedBy } from './ops'
import type { ChangeSet, Op } from './types'

let n = 0
beforeEach(async () => {
  useDatabase(`completed-by-${Date.now()}-${n++}`)
  resetDeviceId()
  await getDeviceId()
  await db.meta.put({ key: 'userId', value: 'u-ana' })
})

async function ops(field: string, entityId?: string): Promise<Op[]> {
  return (await db.outbox.toArray()).filter((o) => o.field === field && (!entityId || o.entityId === entityId)) as Op[]
}

describe('withCompletedBy', () => {
  it('adds the actor on completion, null on reopen, nothing on an open creation or an explicit value', () => {
    const out = withCompletedBy([
      { entity: 'task', entityId: 'a', patch: { completed_at: 5 } },
      { entity: 'task', entityId: 'b', patch: { completed_at: null } },
      { entity: 'task', entityId: 'c', patch: { title: 'x', created_at: 1, completed_at: null } },
      { entity: 'task', entityId: 'd', patch: { completed_at: 5, completed_by: null } },
      { entity: 'task', entityId: 'e', patch: { title: 'x' } },
      { entity: 'project', entityId: 'p', patch: { name: 'x' } },
      { entity: 'task', entityId: 'f', patch: { created_at: 1, completed_at: 7 } },
    ], 'u-ana')
    expect(out.map((c) => c.patch.completed_by)).toEqual(['u-ana', null, undefined, null, undefined, undefined, 'u-ana'])
    expect(withCompletedBy([{ entity: 'task', entityId: 'a', patch: { completed_at: 5 } }], '')[0].patch.completed_by).toBeNull()
  })
})

describe('completion writes completed_by', () => {
  it('completing and reopening a task writes it in the same batch, with the same clock', async () => {
    const id = await createTask({ title: 'Report' })
    expect(await ops('completed_by', id)).toEqual([])
    await setTaskCompleted(id, true)
    expect((await db.tasks.get(id))!.completed_by).toBe('u-ana')
    const at = (await ops('completed_at', id)).at(-1)!
    const [by] = await ops('completed_by', id)
    expect([by.ts, by.device]).toEqual([at.ts, at.device])

    await setTaskCompleted(id, false)
    const row = (await db.tasks.get(id))!
    expect([row.completed_at, row.completed_by]).toEqual([null, null])
  })

  it('cascades to open subtasks', async () => {
    const parent = await createTask({ title: 'Trip' })
    const child = await createSubtask(parent, 'Pack')
    await setTaskCompleted(parent, true)
    expect((await db.tasks.get(child))!.completed_by).toBe('u-ana')
  })

  it('the occurrence record of a recurring task carries it, the series does not', async () => {
    const id = await createTask({ title: 'Water plants', due: { date: '2026-10-16' } })
    await mutateMany([{ entity: 'task', entityId: id, patch: { recurrence: 'every day' } }])
    const recordId = await completeTask(id, { today: '2026-10-16', now: Date.UTC(2026, 9, 16, 10) })
    expect(recordId).toBe(occurrenceId(id, '2026-10-16'))
    expect((await db.tasks.get(recordId!))!.completed_by).toBe('u-ana')
    const series = (await db.tasks.get(id))!
    expect(series.completed_at).toBeNull()
    expect(series.completed_by ?? null).toBeNull()
  })

  it('a history restore of completed_at keeps them together', async () => {
    const id = await createTask({ title: 'Call' })
    await setTaskCompleted(id, true)
    await restoreValue('task', id, 'completed_at', null)
    expect((await db.tasks.get(id))!.completed_by).toBeNull()
  })
})

describe('History versions', () => {
  it('fold completed_by into the completion', () => {
    const set: ChangeSet = {
      ts: 10, userId: 'u-ana', device: 'd1', opIds: ['o1', 'o2'],
      changes: [{ field: 'completed_at', from: null, to: 10, opId: 'o1' }, { field: 'completed_by', from: null, to: 'u-ana', opId: 'o2' }],
    } as unknown as ChangeSet
    const [v] = toVersions([set])
    expect(v.changes.map((c) => c.field)).toEqual(['completed_at'])
  })
})
