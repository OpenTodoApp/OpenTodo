// The patched task snapshot (OpenSpec change list-rendering-at-scale, design D2):
// after every kind of write it equals a full read, and rows a write did not touch
// keep their objects.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { changedTaskKeys, deriveSets, patchRows, taskSnapshot, type TaskSets } from './taskSnapshot'
import { applyOps, createProject, createTask, deleteTask, resetDeviceId, setTaskCompleted, updateProject, updateTask } from './ops'
import { readWorkspaceState, storeWorkspaces } from './workspaces'
import type { Op, Task } from './types'
import { waitFor } from '../ui/test-utils'

let n = 0
beforeEach(() => {
  useDatabase(`task-snapshot-${Date.now()}-${n++}`)
  resetDeviceId()
})

async function fullRead(): Promise<TaskSets> {
  return deriveSets(await db.tasks.toArray() as Task[], await db.projects.toArray(), await readWorkspaceState())
}

const ids = (s: TaskSets | undefined) => JSON.stringify(s && { every: s.every.map((t) => [t.id, t.title, t.completed_at, t.deleted_at, t.project_id]), here: s.here.map((t) => t.id) })

async function settles(snap: ReturnType<typeof taskSnapshot>, what: string) {
  const want = ids(await fullRead())
  await waitFor(() => ids(snap.read()) === want, what)
}

describe('the patched task snapshot', () => {
  it('keeps its sets when only a project\'s name or the stored workspaces change', async () => {
    const snap = taskSnapshot()
    let published = 0
    const stop = snap.subscribe(() => { published++ })
    const p = await createProject({ name: 'Home' })
    await createTask({ title: 'A', project_id: p })
    await settles(snap, 'created')
    const sets = snap.read()
    const before = published
    await updateProject(p, { name: 'House' })
    await storeWorkspaces([])
    await createTask({ title: 'B' })
    await settles(snap, 'the next task')
    // One publish for the new task; none for the rename or the directory.
    expect(published - before).toBe(1)
    const a = (x: TaskSets | undefined) => x!.every.find((t) => t.title === 'A')
    expect(a(snap.read())).toBe(a(sets))
    stop()
  })

  it('equals a full read after every kind of write', async () => {
    const snap = taskSnapshot()
    const stop = snap.subscribe(() => undefined)
    await settles(snap, 'the first read')
    const p = await createProject({ name: 'Home' })
    const a = await createTask({ title: 'A', project_id: p })
    const b = await createTask({ title: 'B' })
    await settles(snap, 'created')
    const before = snap.read()!.every.find((t) => t.id === b)
    await updateTask(a, { title: 'A2' })
    await settles(snap, 'edited')
    // A row the write did not touch keeps its object.
    expect(snap.read()!.every.find((t) => t.id === b)).toBe(before)
    await setTaskCompleted(a, true)
    await settles(snap, 'completed')
    await deleteTask(b)
    await settles(snap, 'trashed')
    await db.tasks.delete(a)
    await settles(snap, 'purged')
    // A project in the Trash hides its tasks (the context, not the tasks, changed).
    const c = await createTask({ title: 'C', project_id: p })
    await settles(snap, 'one more')
    await applyOps([{ id: 'del-p', entity: 'project', entityId: p, field: 'deleted_at', value: 5, ts: Date.now() + 10, device: 'x' }])
    await settles(snap, 'project trashed')
    expect(snap.read()!.every.some((t) => t.id === c)).toBe(false)
    // Many rows in one transaction: read again in full.
    const ops: Op[] = []
    for (let i = 0; i < 1_200; i++) ops.push({ id: `m${i}`, entity: 'task', entityId: `m${String(i).padStart(4, '0')}`, field: 'title', value: `M${i}`, ts: 1_000 + i, device: 'x' })
    await applyOps(ops)
    await settles(snap, 'a large page')
    await db.tasks.clear()
    await settles(snap, 'cleared')
    stop()
  })

  it('names the changed keys, or asks for a full read', () => {
    const leaf = (k: string) => ({ from: k, to: k, d: 1 })
    expect((changedTaskKeys({ 'idb://x/tasks/': { ...leaf('b'), l: leaf('a'), r: leaf('c'), d: 2 } } as never, 'x') as string[]).sort()).toEqual(['a', 'b', 'c'])
    expect(changedTaskKeys({ 'idb://x/tasks/': { from: 'a', to: 'z', d: 1 } } as never, 'x')).toBe('all')
    expect(changedTaskKeys({ 'idb://x/projects/': leaf('a') } as never, 'x')).toBeNull()
    expect(changedTaskKeys({ 'idb://x/tasks/': { d: 0 } } as never, 'x')).toEqual([])
  })

  it('patches rows in id order', () => {
    const row = (id: string, title = id) => ({ id, title }) as Task
    const rows = [row('a'), row('c'), row('e')]
    const out = patchRows(rows, ['b', 'c', 'e'], [row('b'), row('c', 'C'), undefined])
    expect(out.map((r) => `${r.id}:${r.title}`)).toEqual(['a:a', 'b:b', 'c:C'])
    expect(out[0]).toBe(rows[0])
  })
})
