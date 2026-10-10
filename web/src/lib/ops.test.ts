import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import {
  applyOps, archiveProject, createProject, createSubtask, createTask, deleteProject, deleteTask, getDeviceId, moveProject, mutate,
  resetDeviceId, setTaskCompleted, setTaskParent, updateProject, updateTask,
} from './ops'
import { wins } from './hlc'
import { parentReadyToComplete } from './subtasks'
import type { Op } from './types'
import { viewOptions } from './views'
import { setCurrentUserId } from './sharing'

let n = 0
beforeEach(() => {
  useDatabase(`test-${Date.now()}-${n++}`)
  resetDeviceId()
})

const op = (partial: Partial<Op> & Pick<Op, 'field' | 'value' | 'ts' | 'device'>): Op => ({
  id: crypto.randomUUID(), entity: 'task', entityId: 't1', ...partial,
})

describe('applyOps', () => {
  it('converges to the same state regardless of delivery order', async () => {
    const ops = [
      op({ field: 'title', value: 'old', ts: 100, device: 'A' }),
      op({ field: 'title', value: 'new', ts: 200, device: 'B' }),
      op({ field: 'priority', value: 1, ts: 150, device: 'A' }),
      op({ field: 'priority', value: 2, ts: 150, device: 'B' }),
    ]
    const states: string[] = []
    for (const order of [[0, 1, 2, 3], [3, 2, 1, 0], [1, 3, 0, 2]]) {
      const db = useDatabase(`order-${order.join('')}-${Date.now()}`)
      for (const i of order) await applyOps([ops[i]])
      const t = await db.tasks.get('t1')
      states.push(JSON.stringify({ title: t?.title, priority: t?.priority }))
    }
    expect(new Set(states).size).toBe(1)
    expect(states[0]).toBe(JSON.stringify({ title: 'new', priority: 2 }))
  })

  it('is idempotent', async () => {
    const db = useDatabase(`idem-${Date.now()}`)
    const o = op({ field: 'title', value: 'x', ts: 1, device: 'A' })
    await applyOps([o])
    await applyOps([o, o])
    expect((await db.tasks.get('t1'))?.title).toBe('x')
    expect(await db.tasks.count()).toBe(1)
  })

  it('applies label ops into the labels table with defaults', async () => {
    const db = useDatabase(`label-${Date.now()}`)
    await applyOps([
      { id: 'l1', entity: 'label', entityId: 'lab', field: 'name', value: 'errand', ts: 1, device: 'A' },
      { id: 'l2', entity: 'label', entityId: 'lab', field: 'color', value: '#ef4444', ts: 1, device: 'A' },
      { id: 'l3', entity: 'label', entityId: 'lab', field: 'name', value: 'stale', ts: 0, device: 'A' },
    ])
    const l = await db.labels.get('lab')
    expect(l).toMatchObject({ id: 'lab', name: 'errand', color: '#ef4444', position: 0, deleted_at: null })
    expect(await db.tasks.count()).toBe(0)
  })

  it('applies view ops into the views table with defaults and maps unknown option values at read time', async () => {
    const db = useDatabase(`view-${Date.now()}`)
    const v = (field: string, value: unknown, ts = 1): Op => ({ id: crypto.randomUUID(), entity: 'view', entityId: 'v1', field, value, ts, device: 'A' })
    await applyOps([v('name', 'Work tomorrow'), v('query', '@work & due <= tomorrow & p1'), v('pinned', true), v('group_by', 'colour'), v('sort_by', 'title', 2), v('sort_dir', 'sideways')])
    const row = await db.views.get('v1')
    expect(row).toMatchObject({
      id: 'v1', name: 'Work tomorrow', query: '@work & due <= tomorrow & p1', kind: 'list', pinned: true,
      panels: [], position: 0, deleted_at: null,
    })
    // Unknown values are stored as received (never rewritten) and read as defaults.
    expect(row?.group_by).toBe('colour')
    expect(row?.sort_dir).toBe('sideways')
    expect(viewOptions(row!)).toEqual({ kind: 'list', groupBy: 'project', sortBy: 'title', sortDir: 'asc' })
    expect(viewOptions({ kind: 'grid', group_by: 'label', sort_by: 'mood', sort_dir: 'desc' })).toEqual({ kind: 'list', groupBy: 'label', sortBy: 'due', sortDir: 'desc' })
    expect(await db.tasks.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('skips ops for entities this build does not know instead of failing the batch', async () => {
    const db = useDatabase(`unknown-${Date.now()}`)
    await applyOps([
      { id: 'u1', entity: 'widget' as Op['entity'], entityId: 'w', field: 'name', value: 'x', ts: 1, device: 'A' },
      op({ field: 'title', value: 'kept', ts: 1, device: 'A' }),
    ])
    expect((await db.tasks.get('t1'))?.title).toBe('kept')
    expect(await db.labels.count()).toBe(0)
  })

  it('keeps a newer local edit when an older remote op arrives late', async () => {
    const db = useDatabase(`late-${Date.now()}`)
    const id = await createTask({ title: 'local title' })
    const local = await db.tasks.get(id)
    const remote = op({ entityId: id, field: 'title', value: 'stale remote', ts: local!._clock.title.ts - 10, device: 'remote' })
    await applyOps([remote])
    expect((await db.tasks.get(id))?.title).toBe('local title')
  })
})

describe('mutate', () => {
  it('writes locally and enqueues one op per field with increasing timestamps', async () => {
    const db = useDatabase(`mutate-${Date.now()}`)
    const id = await createTask({ title: 'a' })
    await updateTask(id, { title: 'b', priority: 1 })
    const outbox = await db.outbox.toArray()
    const titleOps = outbox.filter((o) => o.field === 'title')
    expect(titleOps).toHaveLength(2)
    expect(titleOps[1].ts).toBeGreaterThan(titleOps[0].ts)
    expect((await db.tasks.get(id))?.priority).toBe(1)
    await mutate('task', id, { deleted_at: 5 })
    expect((await db.tasks.get(id))?.deleted_at).toBe(5)
  })

  it('round-trips estimate_minutes and labels through createTask, the outbox and applyOps', async () => {
    const db = useDatabase(`estimate-${Date.now()}`)
    const plain = await createTask({ title: 'no estimate' })
    expect((await db.tasks.get(plain))?.estimate_minutes).toBeNull()
    const id = await createTask({ title: 'Write report', estimate_minutes: 45, labels: ['call'] })
    const row = await db.tasks.get(id)
    expect(row?.estimate_minutes).toBe(45)
    expect(row?.labels).toEqual(['call'])
    const queued = (await db.outbox.toArray()).find((o) => o.entityId === id && o.field === 'estimate_minutes')
    expect(queued?.value).toBe(45)
    // The same op arriving from another device applies to a fresh row with the default elsewhere.
    const other = useDatabase(`estimate-remote-${Date.now()}`)
    await applyOps([{ ...queued!, device: 'remote' }])
    const remote = await other.tasks.get(id)
    expect(remote?.estimate_minutes).toBe(45)
    expect(remote?.priority).toBe(4)
  })

  it('keeps estimate and due independent under LWW (time-blocking: A estimates, B moves the block)', async () => {
    const a = op({ field: 'estimate_minutes', value: 45, ts: 300, device: 'A' })
    const b = op({ field: 'due', value: { date: '2026-10-13', time: '14:30' }, ts: 200, device: 'B' })
    const b2 = op({ field: 'due', value: { date: '2026-10-13', time: '11:00' }, ts: 100, device: 'A' })
    const results: unknown[] = []
    for (const order of [[a, b, b2], [b2, b, a], [b, a, b2]]) {
      const db = useDatabase(`lww-est-${Date.now()}-${n++}`)
      await applyOps(order)
      const row = await db.tasks.get('t1')
      results.push({ est: row?.estimate_minutes, due: row?.due })
    }
    expect(results).toEqual(Array(3).fill({ est: 45, due: { date: '2026-10-13', time: '14:30' } }))
  })

  it('clears an estimate with null', async () => {
    const db = useDatabase(`est-clear-${Date.now()}`)
    const id = await createTask({ title: 'x', estimate_minutes: 30 })
    await updateTask(id, { estimate_minutes: null })
    expect((await db.tasks.get(id))?.estimate_minutes).toBeNull()
  })

  it('round-trips recurrence and series_id; a plain task defaults both to null', async () => {
    const db = useDatabase(`recurrence-${Date.now()}`)
    const plain = await createTask({ title: 'once' })
    expect(await db.tasks.get(plain)).toMatchObject({ recurrence: null, series_id: null })
    // A plain task writes no recurrence op at all (older servers never see the field).
    expect((await db.outbox.toArray()).some((o) => o.entityId === plain && o.field === 'recurrence')).toBe(false)
    const id = await createTask({ title: 'Water plants', due: { date: '2026-10-12' }, recurrence: 'Every  3 Days' })
    expect(await db.tasks.get(id)).toMatchObject({ recurrence: 'every 3 days', series_id: null })
    const queued = (await db.outbox.toArray()).filter((o) => o.entityId === id)
    const other = useDatabase(`recurrence-remote-${Date.now()}`)
    await applyOps(queued.map((o) => ({ ...o, device: 'remote' })))
    expect(await other.tasks.get(id)).toMatchObject({ recurrence: 'every 3 days', series_id: null, due: { date: '2026-10-12' } })
    await applyOps([{ id: 'sid', entity: 'task', entityId: 'occ', field: 'series_id', value: id, ts: 1, device: 'remote' }])
    expect(await other.tasks.get('occ')).toMatchObject({ series_id: id, recurrence: null })
  })
})

describe('subtasks', () => {
  async function tree() {
    const db = useDatabase(`sub-${Date.now()}-${n++}`)
    resetDeviceId()
    const trip = await createTask({ title: 'Plan trip', project_id: 'travel' })
    const flights = await createSubtask(trip, 'Flights')
    const hotel = await createSubtask(trip, 'Hotel')
    const compare = await createSubtask(hotel, 'Compare prices')
    return { db, trip, flights, hotel, compare }
  }

  it('subtask inherits project', async () => {
    const { db, trip, hotel } = await tree()
    const t = (await db.tasks.get(hotel))!
    expect(t.project_id).toBe('travel')
    expect(t.parent_id).toBe(trip)
    expect(t.priority).toBe(4)
    expect(t.due).toBeNull()
    expect(t.completed_at).toBeNull()
  })

  it('setTaskParent rejects self, a descendant and a different-project parent', async () => {
    const { db, trip, flights, hotel, compare } = await tree()
    const other = await createTask({ title: 'Elsewhere', project_id: 'home' })
    await expect(setTaskParent(trip, trip)).rejects.toThrow()
    await expect(setTaskParent(trip, compare)).rejects.toThrow(/descendant/)
    await expect(setTaskParent(hotel, other)).rejects.toThrow(/same project/)
    expect((await db.tasks.get(trip))?.parent_id).toBeNull()
    expect((await db.tasks.get(hotel))?.parent_id).toBe(trip)
    // A legal move places the task last among its new siblings.
    await setTaskParent(hotel, flights)
    const moved = (await db.tasks.get(hotel))!
    expect(moved.parent_id).toBe(flights)
    await setTaskParent(compare, trip)
    const c = (await db.tasks.get(compare))!
    expect(c.parent_id).toBe(trip)
    expect(c.position).toBeGreaterThan((await db.tasks.get(flights))!.position)
    await setTaskParent(compare, null)
    expect((await db.tasks.get(compare))?.parent_id).toBeNull()
  })

  it('moving a parent to another project moves the subtree; moving a child detaches it', async () => {
    const { db, trip, flights, hotel, compare } = await tree()
    await updateTask(trip, { project_id: 'later' })
    for (const id of [trip, flights, hotel, compare]) expect((await db.tasks.get(id))?.project_id).toBe('later')
    expect((await db.tasks.get(compare))?.parent_id).toBe(hotel)
    await updateTask(compare, { project_id: null })
    const c = (await db.tasks.get(compare))!
    expect(c.project_id).toBeNull()
    expect(c.parent_id).toBeNull()
  })

  it('complete cascades', async () => {
    const { db, trip, flights, hotel, compare } = await tree()
    await setTaskCompleted(flights, true)
    await setTaskCompleted(trip, true)
    for (const id of [trip, flights, hotel, compare]) expect((await db.tasks.get(id))?.completed_at).not.toBeNull()
    const ops = (await db.outbox.toArray()).filter((o) => o.field === 'completed_at' && o.value !== null)
    expect(ops).toHaveLength(4) // one per task: flights alone, then trip + hotel + compare
  })

  it('reopen does not cascade', async () => {
    const { db, trip, flights, hotel, compare } = await tree()
    await setTaskCompleted(trip, true)
    await setTaskCompleted(trip, false)
    expect((await db.tasks.get(trip))?.completed_at).toBeNull()
    for (const id of [flights, hotel, compare]) expect((await db.tasks.get(id))?.completed_at).not.toBeNull()
  })

  it('offers to complete the parent only when its last open subtask is completed', async () => {
    const { trip, flights, hotel, compare } = await tree()
    await setTaskCompleted(flights, true)
    expect(await parentReadyToComplete(flights)).toBeNull()
    await setTaskCompleted(compare, true)
    expect((await parentReadyToComplete(compare))?.id).toBe(hotel)
    await setTaskCompleted(hotel, true)
    expect((await parentReadyToComplete(hotel))?.id).toBe(trip)
  })

  it('delete cascades', async () => {
    const { db, trip, flights, hotel, compare } = await tree()
    const keep = await createTask({ title: 'Unrelated', project_id: 'travel' })
    await deleteTask(trip)
    for (const id of [trip, flights, hotel, compare]) expect((await db.tasks.get(id))?.deleted_at).not.toBeNull()
    expect((await db.tasks.get(keep))?.deleted_at).toBeNull()
  })

  it('concurrent delete and edit keeps tombstone', async () => {
    const { db, trip, hotel } = await tree()
    // Device B renamed Hotel at the same moment device A deleted the subtree.
    const before = (await db.tasks.get(hotel))!
    await deleteTask(trip)
    const after = (await db.tasks.get(hotel))!
    await applyOps([op({ entityId: hotel, field: 'title', value: 'Hotel near the beach', ts: after._clock.deleted_at.ts, device: 'B' })])
    const t = (await db.tasks.get(hotel))!
    expect(t.deleted_at).toBe(after.deleted_at)
    expect(t.title).toBe('Hotel near the beach')
    expect(before.deleted_at).toBeNull()
  })
})

describe('projects', () => {
  async function forest() {
    const db = useDatabase(`proj-${Date.now()}-${n++}`)
    resetDeviceId()
    const home = await createProject({ name: 'Home' })
    const garden = await createProject({ name: 'Garden', parent_id: home })
    const lawn = await createProject({ name: 'Lawn', parent_id: garden })
    const beds = await createProject({ name: 'Beds', parent_id: garden })
    const work = await createProject({ name: 'Work' })
    return { db, home, garden, lawn, beds, work }
  }

  it('createProject nests under the given parent, last among siblings', async () => {
    const { db, home, garden, beds, lawn } = await forest()
    expect((await db.projects.get(garden))?.parent_id).toBe(home)
    expect((await db.projects.get(beds))!.position).toBeGreaterThan((await db.projects.get(lawn))!.position)
  })

  it('moveProject rejects self and a descendant target and sets parent_id through mutate', async () => {
    const { db, home, garden, lawn, work } = await forest()
    await expect(moveProject(home, home)).rejects.toThrow(/own parent/)
    await expect(moveProject(home, lawn)).rejects.toThrow(/descendant/)
    await expect(moveProject(home, 'nope')).rejects.toThrow(/not found/)
    expect((await db.projects.get(home))?.parent_id).toBeNull()
    await moveProject(lawn, work)
    const moved = (await db.projects.get(lawn))!
    expect(moved.parent_id).toBe(work)
    expect((await db.outbox.toArray()).some((o) => o.entity === 'project' && o.entityId === lawn && o.field === 'parent_id' && o.value === work)).toBe(true)
    // A move to the top level lands after the existing roots; to a parent, after its children.
    await moveProject(garden, null)
    const g = (await db.projects.get(garden))!
    expect(g.parent_id).toBeNull()
    expect(g.position).toBeGreaterThan((await db.projects.get(work))!.position)
    await moveProject(home, garden)
    expect((await db.projects.get(home))!.parent_id).toBe(garden)
    await updateProject(work, { archived: true })
    await expect(moveProject(home, work)).rejects.toThrow(/not found/)
  })

  it('archive cascades', async () => {
    const { db, home, garden, lawn, beds, work } = await forest()
    await archiveProject(home)
    for (const id of [home, garden, lawn, beds]) expect((await db.projects.get(id))?.archived).toBe(true)
    expect((await db.projects.get(work))?.archived).toBe(false)
    const ops = (await db.outbox.toArray()).filter((o) => o.field === 'archived' && o.value === true)
    expect(ops).toHaveLength(4)
    // Unarchiving the parent leaves the descendants archived.
    await updateProject(home, { archived: false })
    expect((await db.projects.get(garden))?.archived).toBe(true)
  })

  it('delete promotes sub-projects and moves open tasks to the Inbox', async () => {
    const { db, home, garden, lawn, beds } = await forest()
    const open = await createTask({ title: 'Mow', project_id: garden })
    const done = await createTask({ title: 'Rake', project_id: garden })
    await setTaskCompleted(done, true)
    await deleteProject(garden)
    expect((await db.projects.get(garden))?.deleted_at).not.toBeNull()
    expect((await db.projects.get(lawn))?.parent_id).toBe(home)
    expect((await db.projects.get(beds))?.parent_id).toBe(home)
    expect((await db.tasks.get(open))?.project_id).toBeNull()
    expect((await db.tasks.get(done))?.project_id).toBeNull()
    // Deleting a top-level project promotes its children to the top level.
    await deleteProject(home)
    expect((await db.projects.get(lawn))?.parent_id).toBeNull()
  })
})

describe('getDeviceId', () => {
  it('returns one id even when called concurrently on first launch', async () => {
    useDatabase(`device-${Date.now()}`)
    resetDeviceId()
    const ids = await Promise.all([getDeviceId(), getDeviceId(), getDeviceId()])
    expect(new Set(ids).size).toBe(1)
    resetDeviceId()
    expect(await getDeviceId()).toBe(ids[0])
  })
})

describe('wins', () => {
  it('breaks timestamp ties by device id', () => {
    expect(wins(5, 'B', { ts: 5, device: 'A' })).toBe(true)
    expect(wins(5, 'A', { ts: 5, device: 'B' })).toBe(false)
    expect(wins(4, 'Z', { ts: 5, device: 'A' })).toBe(false)
    expect(wins(1, 'A')).toBe(true)
  })
})

describe('project sharing', () => {
  async function sharedProject(role: 'owner' | 'editor' = 'owner') {
    const shared = await createProject({ name: 'Home' })
    await db.memberships.put({ projectId: shared, role, ownerId: 'alice', members: [] })
    return shared
  }

  it('move across scopes creates copy and tombstone', async () => {
    const shared = await sharedProject('editor')
    const parent = await createTask({ title: 'Trip', project_id: shared, priority: 2, labels: ['l1'] })
    const child = await createSubtask(parent, 'Hotel')
    await db.outbox.clear()
    const copyId = await updateTask(parent, { project_id: null })
    expect(copyId).not.toBe(parent)
    // Originals stay in the shared project, tombstoned for every member.
    expect((await db.tasks.get(parent))?.deleted_at).not.toBeNull()
    expect((await db.tasks.get(parent))?.project_id).toBe(shared)
    expect((await db.tasks.get(child))?.deleted_at).not.toBeNull()
    // Copies with new ids land in the Inbox, keeping fields and the tree.
    const copy = await db.tasks.get(copyId)
    expect(copy).toMatchObject({ title: 'Trip', project_id: null, priority: 2, labels: ['l1'], deleted_at: null, parent_id: null })
    const childCopy = (await db.tasks.where('parent_id').equals(copyId).toArray())[0]
    expect(childCopy).toMatchObject({ title: 'Hotel', project_id: null, deleted_at: null })
    // No op ever changes the original's project_id (the server would refuse it).
    const ops = await db.outbox.toArray()
    expect(ops.some((o) => o.entityId === parent && o.field === 'project_id')).toBe(false)
    // A move inside one scope stays a plain project_id change.
    const other = await createProject({ name: 'Personal' })
    const same = await updateTask(copyId, { project_id: other })
    expect(same).toBe(copyId)
    expect((await db.tasks.get(copyId))?.project_id).toBe(other)
  })

  it('delete shared project copies open tasks to Inbox', async () => {
    const shared = await sharedProject('owner')
    const a = await createTask({ title: 'Open A', project_id: shared })
    await createSubtask(a, 'Open child')
    await createTask({ title: 'Open B', project_id: shared })
    const done = await createTask({ title: 'Done', project_id: shared })
    await setTaskCompleted(done, true)
    await deleteProject(shared)
    expect((await db.projects.get(shared))?.deleted_at).not.toBeNull()
    const all = await db.tasks.toArray()
    // Every task of the shared project is tombstoned in place (members see tombstones).
    expect(all.filter((t) => t.project_id === shared).every((t) => t.deleted_at)).toBe(true)
    // The owner's Inbox lists copies of the three open tasks, tree intact.
    const inbox = all.filter((t) => t.project_id === null && !t.deleted_at)
    expect(inbox.map((t) => t.title).sort()).toEqual(['Open A', 'Open B', 'Open child'])
    const copyA = inbox.find((t) => t.title === 'Open A')
    expect(inbox.find((t) => t.title === 'Open child')?.parent_id).toBe(copyA?.id)
  })

  it('only the owner deletes a shared project', async () => {
    const shared = await sharedProject('editor')
    await expect(deleteProject(shared)).rejects.toThrow(/owner/)
    expect((await db.projects.get(shared))?.deleted_at).toBeNull()
  })
})

describe('task assignment', () => {
  const member = (userId: string) => ({ userId, name: userId, email: `${userId}@example.com`, role: 'editor' as const })

  it('new task defaults assignee_id to null', async () => {
    const id = await createTask({ title: 'Plain' })
    expect((await db.tasks.get(id))?.assignee_id).toBeNull()
    // A plain task sends no assignee op; an assigned one sends exactly one.
    expect((await db.outbox.toArray()).some((o) => o.field === 'assignee_id')).toBe(false)
    const assigned = await createTask({ title: 'Mine', assignee_id: 'me' })
    expect((await db.tasks.get(assigned))?.assignee_id).toBe('me')
    expect((await db.outbox.toArray()).filter((o) => o.field === 'assignee_id').map((o) => o.value)).toEqual(['me'])
    // A row created from ops without the field (older peer) also reads null.
    await applyOps([op({ entityId: 'remote', field: 'title', value: 'x', ts: 1, device: 'Z' })])
    expect((await db.tasks.get('remote'))?.assignee_id).toBeNull()
    // Assignment is an ordinary LWW field.
    await applyOps([
      op({ entityId: 'remote', field: 'assignee_id', value: 'bob', ts: 5, device: 'A' }),
      op({ entityId: 'remote', field: 'assignee_id', value: 'dan', ts: 6, device: 'C' }),
    ])
    expect((await db.tasks.get('remote'))?.assignee_id).toBe('dan')
  })

  it('copy across scopes drops non-member assignee', async () => {
    await setCurrentUserId('me')
    const shared = await createProject({ name: 'Team' })
    const other = await createProject({ name: 'Other team' })
    await db.memberships.bulkPut([
      { projectId: shared, role: 'editor', ownerId: 'alice', members: [member('alice'), member('me'), member('bob')] },
      { projectId: other, role: 'editor', ownerId: 'alice', members: [member('alice'), member('me')] },
    ])
    const bobs = await createTask({ title: 'Bob does it', project_id: shared, assignee_id: 'bob' })
    const alices = await createTask({ title: 'Alice does it', project_id: shared, assignee_id: 'alice' })
    const mine = await createTask({ title: 'I do it', project_id: shared, assignee_id: 'me' })
    const nobody = await createTask({ title: 'Nobody', project_id: shared })
    await db.outbox.clear()
    // Into the Inbox: only my own assignment survives.
    const bobCopy = await updateTask(bobs, { project_id: null })
    const myCopy = await updateTask(mine, { project_id: null })
    expect((await db.tasks.get(bobCopy))?.assignee_id).toBeNull()
    expect((await db.tasks.get(myCopy))?.assignee_id).toBe('me')
    // Into another shared project: kept when the assignee is a member there.
    const aliceCopy = await updateTask(alices, { project_id: other })
    expect((await db.tasks.get(aliceCopy))?.assignee_id).toBe('alice')
    // An unassigned copy sends no assignee op at all.
    const nobodyCopy = await updateTask(nobody, { project_id: null })
    const ops = await db.outbox.toArray()
    expect(ops.some((o) => o.entityId === nobodyCopy && o.field === 'assignee_id')).toBe(false)
    expect(ops.some((o) => o.field === 'assignee_id' && o.value === undefined)).toBe(false)
  })
})
