import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const purgeCalls = vi.fn(async (_entity: string, _id: string) => ({ purged: { tasks: 1, projects: 0, reminders: 0 } }))
vi.mock('./api', () => {
  class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message)
    }
  }
  return {
    api: { purge: (e: string, id: string) => purgeCalls(e, id), emptyTrash: vi.fn(async () => ({ purged: { tasks: 0, projects: 0, reminders: 0 } })) },
    ApiError,
    isNetworkError: (err: unknown) => !(err instanceof ApiError),
  }
})

import { db, useDatabase } from './db'
import { applyOps, createProject, createSubtask, createTask, deleteProject, deleteTask, resetDeviceId, restoreProject, restoreTask, setTaskCompleted } from './ops'
import { flushPendingPurges, pendingPurges, purgeItems, remainingDays, removeLocally, trashItems, visibleTasks } from './trash'
import type { Op } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`trash-${Date.now()}-${n++}`)
  resetDeviceId()
  purgeCalls.mockClear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Trash view data', () => {
  it('lists deleted tasks and projects newest first with the project name', async () => {
    const home = await createProject({ name: 'Home' })
    const a = await createTask({ title: 'A', project_id: home })
    const b = await createTask({ title: 'B' })
    await deleteTask(a)
    await new Promise((r) => setTimeout(r, 2))
    await deleteTask(b)
    const items = trashItems(await db.tasks.toArray(), await db.projects.toArray())
    expect(items.map((i) => i.title)).toEqual(['B', 'A'])
    expect(items[0].projectName).toBe('Inbox')
    expect(items[1].projectName).toBe('Home')
  })

  it('computes remaining days and none when retention is off', () => {
    const day = 86_400_000
    expect(remainingDays(0, 30, 29.5 * day)).toBe(1)
    expect(remainingDays(0, 30, 40 * day)).toBe(0)
    expect(remainingDays(0, 0, day)).toBeNull()
  })
})

describe('restore', () => {
  it('restores a task to its project with all fields, and its subtree deleted with it', async () => {
    const home = await createProject({ name: 'Home' })
    const t = await createTask({ title: 'Paint', project_id: home, priority: 2, labels: ['l1'] })
    const child = await createSubtask(t, 'Buy brushes')
    await deleteTask(t)
    expect((await visibleTasks()).map((x) => x.id)).not.toContain(t)
    await restoreTask(t)
    const back = await db.tasks.get(t)
    expect(back).toMatchObject({ title: 'Paint', project_id: home, priority: 2, labels: ['l1'], deleted_at: null })
    expect((await db.tasks.get(child))?.deleted_at).toBeNull()
  })

  it('restores a task to the Inbox when its project is still deleted', async () => {
    const home = await createProject({ name: 'Home' })
    const t = await createTask({ title: 'Paint', project_id: home })
    await deleteTask(t)
    await deleteProject(home)
    await db.outbox.clear()
    await restoreTask(t)
    expect(await db.tasks.get(t)).toMatchObject({ project_id: null, deleted_at: null })
    // One batch: the tombstone and the move share a timestamp.
    const ops = await db.outbox.toArray()
    expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
    expect(ops.map((o) => o.field).sort()).toEqual(['deleted_at', 'parent_id', 'project_id'])
  })

  it('restoring a project brings its open and completed tasks back without task ops', async () => {
    const garden = await createProject({ name: 'Garden' })
    const ids: string[] = []
    for (let i = 0; i < 5; i++) ids.push(await createTask({ title: `T${i}`, project_id: garden }))
    await setTaskCompleted(ids[3], true)
    await setTaskCompleted(ids[4], true)
    await deleteProject(garden)
    expect((await visibleTasks()).filter((t) => t.project_id === garden)).toHaveLength(0)
    await db.outbox.clear()
    await restoreProject(garden)
    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ entity: 'project', field: 'deleted_at', value: null })
    const back = (await visibleTasks()).filter((t) => t.project_id === garden)
    expect(back.filter((t) => !t.completed_at)).toHaveLength(3)
    expect(back.filter((t) => t.completed_at)).toHaveLength(2)
  })

  it('concurrent delete and restore resolves to newer', async () => {
    const t = await createTask({ title: 'X' })
    const del = (ts: number, device: string): Op => ({ id: crypto.randomUUID(), entity: 'task', entityId: t, field: 'deleted_at', value: ts, ts, device })
    const res = (ts: number, device: string): Op => ({ id: crypto.randomUUID(), entity: 'task', entityId: t, field: 'deleted_at', value: null, ts, device })
    const future = Date.now() + 10_000
    // A restores at future+2, B deletes at future+1: restore wins in any order.
    await applyOps([res(future + 2, 'A'), del(future + 1, 'B')])
    expect((await db.tasks.get(t))?.deleted_at).toBeNull()
    await applyOps([del(future + 1, 'B'), res(future + 2, 'A')])
    expect((await db.tasks.get(t))?.deleted_at).toBeNull()
    // The reverse holds too.
    await applyOps([del(future + 4, 'B'), res(future + 3, 'A')])
    expect((await db.tasks.get(t))?.deleted_at).toBe(future + 4)
  })
})

describe('purge', () => {
  it('queues purges while offline and sends them once online', async () => {
    const t = await createTask({ title: 'Gone' })
    await deleteTask(t)
    vi.stubGlobal('navigator', { onLine: false })
    expect(await purgeItems([{ entity: 'task', id: t }])).toBe('pending')
    expect(purgeCalls).not.toHaveBeenCalled()
    // Nothing is removed locally before the server confirms.
    expect(await db.tasks.get(t)).toBeDefined()
    expect(await pendingPurges()).toEqual([{ entity: 'task', id: t }])
    vi.stubGlobal('navigator', { onLine: true })
    await flushPendingPurges()
    expect(purgeCalls).toHaveBeenCalledWith('task', t)
    expect(await db.tasks.get(t)).toBeUndefined()
    expect(await pendingPurges()).toEqual([])
  })

  it('removes purged rows with their queued ops', async () => {
    const p = await createProject({ name: 'P' })
    const t = await createTask({ title: 'in P', project_id: p })
    await removeLocally([{ entity: 'project', entityId: p }, { entity: 'task', entityId: t }])
    expect(await db.projects.get(p)).toBeUndefined()
    expect(await db.tasks.get(t)).toBeUndefined()
    expect(await db.outbox.count()).toBe(0)
  })
})
