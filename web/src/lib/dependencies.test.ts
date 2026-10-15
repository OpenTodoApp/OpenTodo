import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { blockedMap, blockerCandidates, brokenEdges, dependents, isBlocked, openBlockers, removeBlocker, addBlocker, setBlockedBy } from './dependencies'
import { applyOps, createProject, createTask, resetDeviceId, updateTask } from './ops'
import { membershipMap } from './sharing'
import type { Op, Task } from './types'

// Task dependencies on the device (OpenSpec change task-dependencies, tasks 1.4, 2.1, 2.2).

let n = 0
beforeEach(() => {
  useDatabase(`deps-${Date.now()}-${n++}`)
  resetDeviceId()
})

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0, created_at: 0,
  completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, blocked_by: [], _clock: {}, ...over,
} as Task)
const map = (...ts: Task[]) => new Map(ts.map((t) => [t.id, t]))

describe('derived blocked state', () => {
  it('completed, deleted and unknown blockers do not block; an open one does', () => {
    const a = task('a', { blocked_by: ['open', 'done', 'gone', 'unknown'] })
    const tasks = [a, task('open'), task('done', { completed_at: 1 }), task('gone', { deleted_at: 1 })]
    expect(openBlockers(a, map(...tasks)).map((t) => t.id)).toEqual(['open'])
    expect(blockedMap(tasks).get('a')).toBe(1)
    expect(isBlocked(task('b', { blocked_by: ['done'] }), map(...tasks))).toBe(false)
  })

  it('a recurring blocker keeps blocking (its occurrences are separate records)', () => {
    const series = task('s', { recurrence: 'every week', due: { date: '2026-10-20' } })
    const done = task('occ', { series_id: 's', completed_at: 5 })
    expect(isBlocked(task('b', { blocked_by: ['s'] }), map(series, done))).toBe(true)
  })

  it('a local cycle blocks nothing at the newest member, whatever the input order', () => {
    const a = task('a', { blocked_by: ['b'], _clock: { blocked_by: { ts: 10, device: 'd1' } } })
    const b = task('b', { blocked_by: ['a'], _clock: { blocked_by: { ts: 20, device: 'd2' } } })
    const one = brokenEdges([a, b])
    const two = brokenEdges([b, a])
    expect([...one]).toEqual([...two])
    expect([...one]).toEqual(['b\u0000a'])
    // a still waits for b; b's edge to a is ignored.
    expect(blockedMap([a, b])).toEqual(new Map([['a', 1]]))
    expect(blockedMap([b, a])).toEqual(new Map([['a', 1]]))
  })

  it('lists dependents for the Blocks row', () => {
    const tasks = [task('a', { blocked_by: ['x'] }), task('b', { blocked_by: ['x', 'y'] }), task('c'), task('d', { blocked_by: ['x'], deleted_at: 1 })]
    expect(dependents('x', tasks).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('offers candidates in the same scope, never the task, its blockers or what waits for it', () => {
    const t = task('t', { blocked_by: ['b1'] })
    const tasks = [t, task('b1'), task('free'), task('dep', { blocked_by: ['t'] }), task('dep2', { blocked_by: ['dep'] }), task('done', { completed_at: 1 }), task('shared', { project_id: 'p' })]
    const memberships = new Map([['p', { projectId: 'p', role: 'editor', ownerId: 'x', members: [] }]]) as never
    expect(blockerCandidates(t, tasks, memberships).map((c) => c.id)).toEqual(['free'])
  })
})

describe('setBlockedBy', () => {
  it('writes one op, refuses self, cycles and other scopes with a readable message', async () => {
    const a = await createTask({ title: 'Confirm dates' })
    const b = await createTask({ title: 'Book flights' })
    await setBlockedBy(b, [a])
    expect((await db.tasks.get(b))!.blocked_by).toEqual([a])
    const ops = (await db.outbox.toArray()).filter((o) => o.field === 'blocked_by')
    expect(ops).toHaveLength(1)
    await expect(setBlockedBy(a, [a])).rejects.toThrow('cannot wait for itself')
    await expect(setBlockedBy(a, [b])).rejects.toThrow('“Book flights” already waits for this task')
    const p = await createProject({ name: 'Team' })
    await db.memberships.put({ projectId: p, role: 'owner', ownerId: 'me', members: [] })
    const shared = await createTask({ title: 'Team task', project_id: p })
    await expect(setBlockedBy(a, [shared])).rejects.toThrow('shared differently')
  })

  it('sequential adds and a remove never lose an entry', async () => {
    const t = await createTask({ title: 'Trip' })
    const [x, y, z] = await Promise.all(['X', 'Y', 'Z'].map((title) => createTask({ title })))
    await addBlocker(t, x)
    await addBlocker(t, y)
    await removeBlocker(t, x)
    await addBlocker(t, z)
    expect((await db.tasks.get(t))!.blocked_by).toEqual([y, z])
  })
})

describe('the blocked_by field', () => {
  it('applies a remote op, queues an offline edit, and a cross-scope move copies without blockers', async () => {
    const op: Op = { id: 'r1', entity: 'task', entityId: 'remote', field: 'blocked_by', value: ['x1'], ts: 10, device: 'other' }
    await applyOps([op, { ...op, id: 'r2', field: 'title', value: 'Remote' }])
    expect((await db.tasks.get('remote'))!.blocked_by).toEqual(['x1'])
    const a = await createTask({ title: 'A' })
    const b = await createTask({ title: 'B' })
    await setBlockedBy(b, [a])
    expect((await db.outbox.toArray()).some((o) => o.entityId === b && o.field === 'blocked_by')).toBe(true)
    const p = await createProject({ name: 'Shared' })
    await db.memberships.put({ projectId: p, role: 'owner', ownerId: 'me', members: [] })
    expect((await membershipMap()).has(p)).toBe(true)
    const moved = await updateTask(b, { project_id: p })
    expect(moved).not.toBe(b)
    expect((await db.tasks.get(moved))!.blocked_by ?? []).toEqual([])
  })
})
