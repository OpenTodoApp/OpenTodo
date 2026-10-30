import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta, useDatabase } from './db'
import {
  applyOps, archiveProject, createProject, createSubtask, createTask, deleteProject, deleteTask, getDeviceId, moveProject, mutate,
  createTasks, mutateMany, planTasks, PlaintextTooLongError, resetDeviceId, setTaskCompleted, setTaskParent, updateProject, updateTask,
} from './ops'
import { compareByPosition } from './ordering'
import { inboxTasks } from './inbox'
import { HLC_META, hlcLast, wins } from './hlc'
import { parentReadyToComplete } from './subtasks'
import type { Comment, Op } from './types'
import { viewOptions } from './views'
import { membershipMap, scopeOf, setCurrentUserId } from './sharing'
import {
  canDeleteComment, canEditComment, commentCounts, createComment, deleteComment, editComment, mentionAt, mentionCandidates, mentionsInBody, mentionToken,
  threadOrder, threadVisible,
} from './comments'
import { visibleTasks } from './trash'
import { publishEncryption } from './e2ee'
import { MAX_PLAINTEXT_BYTES } from './crypto'
import { createSection, deleteSection, moveTaskToSection, projectSections, renameSection, reorderSection } from './sections'

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

  it('stamps a local edit after a received op even when this device\'s clock runs behind', async () => {
    // Another device's clock is a minute ahead of this one. Without the clock's
    // receive rule the local edit would carry an older timestamp and lose to
    // the value it replaces, here and on the server.
    const db = useDatabase(`receive-${Date.now()}`)
    const ahead = Date.now() + 60_000
    await applyOps([op({ field: 'title', value: 'theirs', ts: ahead, device: 'ffffffff' })])
    expect(hlcLast()).toBeGreaterThanOrEqual(ahead)
    expect(await getMeta<number>(HLC_META, 0)).toBeGreaterThanOrEqual(ahead)
    await mutate('task', 't1', { title: 'mine' })
    expect((await db.tasks.get('t1'))?.title).toBe('mine')
    const sent = (await db.outbox.toArray()).find((o) => o.field === 'title')
    expect(sent!.ts).toBeGreaterThan(ahead)
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

  it('defaults ical_extra to null and never writes it for app-created tasks (caldav)', async () => {
    const id = await createTask({ title: 'plain' })
    expect((await db.tasks.get(id))?.ical_extra).toBeNull()
    expect((await db.outbox.toArray()).some((o) => o.field === 'ical_extra')).toBe(false)
    // A task first seen through a single remote op still gets the default.
    await applyOps([op({ entityId: 'remote', field: 'title', value: 'from CalDAV', ts: 5, device: 'caldav:p1' })])
    expect((await db.tasks.get('remote'))?.ical_extra).toBeNull()
  })

  it('keepsIcalExtraOnTitleEdit: the opaque calendar remainder survives local edits', async () => {
    const extra = 'BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nEND:VALARM'
    await applyOps([
      op({ field: 'title', value: 'Water plants', ts: 10, device: 'caldav:p1' }),
      op({ field: 'ical_extra', value: extra, ts: 10, device: 'caldav:p1' }),
    ])
    await updateTask('t1', { title: 'Water the plants' })
    await setTaskCompleted('t1', true)
    const row = await db.tasks.get('t1')
    expect(row).toMatchObject({ title: 'Water the plants', ical_extra: extra })
    expect(row?.completed_at).not.toBeNull()
    expect((await db.outbox.toArray()).some((o) => o.field === 'ical_extra')).toBe(false)
  })
})

describe('task positions', () => {
  beforeEach(() => { useDatabase(`positions-${Date.now()}-${Math.random()}`) })

  it('tasks created at the same moment, before either is written, get distinct positions in order', async () => {
    // One millisecond for all three, as a paste of three lines can be.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 26, 9, 0))
    const ids = await Promise.all(['A', 'B', 'C'].map((title) => createTask({ title })))
    const positions = await Promise.all(ids.map(async (id) => (await db.tasks.get(id))!.position))
    expect(new Set(positions).size).toBe(3)
    // One more after they are written still goes last.
    const d = await createTask({ title: 'D' })
    expect((await db.tasks.get(d))!.position).toBeGreaterThan(Math.max(...positions))
  })
})

describe('add position (add-position 2.1)', () => {
  const titles = async (filter: (t: { project_id: string | null; section_id?: string | null; parent_id: string | null; deleted_at: number | null }) => boolean) =>
    (await db.tasks.toArray()).filter(filter).sort(compareByPosition).map((t) => t.title)

  it('a top task sorts first in a project, a section and the Inbox; bottom is unchanged', async () => {
    const p = await createProject({ name: 'Home' })
    const s = await createSection(p, 'Doing')
    await createTask({ title: 'p1', project_id: p })
    await createTask({ title: 'p2', project_id: p })
    await createTask({ title: 's1', project_id: p, section_id: s })
    await createTask({ title: 'i1' })
    await createTask({ title: 'i2' })
    await createTask({ title: 'p-top', project_id: p, placement: 'top' })
    await createTask({ title: 's-top', project_id: p, section_id: s, placement: 'top' })
    await createTask({ title: 'i-top', placement: 'top' })
    await createTask({ title: 'i-bottom', placement: 'bottom' })
    await createTask({ title: 'i-default' })
    expect(await titles((t) => t.project_id === p && !t.section_id)).toEqual(['p-top', 'p1', 'p2'])
    expect(await titles((t) => t.section_id === s)).toEqual(['s-top', 's1'])
    const inbox = inboxTasks((await db.tasks.toArray()).filter((t) => !t.deleted_at)).sort(compareByPosition).map((t) => t.title)
    expect(inbox).toEqual(['i-top', 'i1', 'i2', 'i-bottom', 'i-default'])
  })

  it('a batch of three keeps its order at the top', async () => {
    await createTask({ title: 'old' })
    const planned = await planTasks([{ title: 'A' }, { title: 'B' }, { title: 'C' }], 'top')
    await mutateMany(planned.map((p) => p.change))
    expect(await titles(() => true)).toEqual(['A', 'B', 'C', 'old'])
  })

  it('quick adds at the top before either is written: the later one is above', async () => {
    await createTask({ title: 'old' })
    const [a, b] = await Promise.all([createTask({ title: 'A', placement: 'top' }), createTask({ title: 'B', placement: 'top' })])
    const pa = (await db.tasks.get(a))!.position
    const pb = (await db.tasks.get(b))!.position
    expect(pa).not.toBe(pb)
    expect((await titles(() => true)).at(-1)).toBe('old')
  })

  it('a subtask appends even with top', async () => {
    const parent = await createTask({ title: 'parent' })
    await createTask({ title: 'sub1', parent_id: parent })
    await createTask({ title: 'sub2', parent_id: parent, placement: 'top' })
    expect(await titles((t) => t.parent_id === parent)).toEqual(['sub1', 'sub2'])
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

  it('delete promotes sub-projects and keeps tasks with the trashed project', async () => {
    const { db, home, garden, lawn, beds } = await forest()
    const open = await createTask({ title: 'Mow', project_id: garden })
    const done = await createTask({ title: 'Rake', project_id: garden })
    await setTaskCompleted(done, true)
    await deleteProject(garden)
    expect((await db.projects.get(garden))?.deleted_at).not.toBeNull()
    expect((await db.projects.get(lawn))?.parent_id).toBe(home)
    expect((await db.projects.get(beds))?.parent_id).toBe(home)
    expect((await db.tasks.get(open))?.project_id).toBe(garden)
    expect((await db.tasks.get(done))?.project_id).toBe(garden)
    // Deleting a top-level project promotes its children to the top level.
    await deleteProject(home)
    expect((await db.projects.get(lawn))?.parent_id).toBeNull()
  })

  it('delete project hides tasks without task ops', async () => {
    const { db, garden } = await forest()
    const open = await createTask({ title: 'Mow', project_id: garden })
    const inbox = await createTask({ title: 'Call' })
    await db.outbox.clear()
    await deleteProject(garden)
    const ops = await db.outbox.toArray()
    expect(ops.filter((o) => o.entity === 'task')).toHaveLength(0)
    const visible = (await visibleTasks()).map((t) => t.id)
    expect(visible).toContain(inbox)
    expect(visible).not.toContain(open)
    // Not in the Inbox either, and not counted.
    expect((await db.tasks.get(open))?.deleted_at).toBeNull()
    expect((await visibleTasks()).filter((t) => t.project_id === null).map((t) => t.id)).toEqual([inbox])
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

describe('task origin (task-origin 1.4)', () => {
  const ORIGIN = { kind: 'issue' as const, provider: 'github', id: 'o/r#7', url: 'https://github.com/o/r/issues/7' }

  it('a task created without one reads null and sends no origin op', async () => {
    const id = await createTask({ title: 'Plain' })
    expect((await db.tasks.get(id))?.origin).toBeNull()
    expect((await db.outbox.toArray()).some((o) => o.field === 'origin')).toBe(false)
  })

  it('createTask writes the origin in the same batch as the task', async () => {
    const id = await createTask({ title: 'Fix the login timeout', origin: ORIGIN })
    expect((await db.tasks.get(id))?.origin).toEqual(ORIGIN)
    const ops = await db.outbox.toArray()
    expect(ops.find((o) => o.field === 'origin')?.value).toEqual(ORIGIN)
  })

  it('a copy across sharing scopes keeps the origin; one without an origin sends none', async () => {
    const shared = await createProject({ name: 'Home' })
    await db.memberships.put({ projectId: shared, role: 'editor', ownerId: 'alice', members: [] })
    const withOrigin = await createTask({ title: 'Captured', project_id: shared, origin: ORIGIN })
    const plain = await createTask({ title: 'Typed', project_id: shared })
    await db.outbox.clear()
    const copy = await updateTask(withOrigin, { project_id: null })
    expect((await db.tasks.get(copy))?.origin).toEqual(ORIGIN)
    await db.outbox.clear()
    const plainCopy = await updateTask(plain, { project_id: null })
    expect((await db.tasks.get(plainCopy))?.origin).toBeNull()
    expect((await db.outbox.toArray()).some((o) => o.field === 'origin')).toBe(false)
  })

  it('origin converges whole by last-writer-wins', async () => {
    const page = { kind: 'url', url: 'https://a.example/x' }
    await applyOps([
      op({ field: 'title', value: 'T', ts: 1, device: 'A' }),
      op({ field: 'origin', value: page, ts: 5, device: 'A' }),
      op({ field: 'origin', value: ORIGIN, ts: 6, device: 'B' }),
      op({ field: 'title', value: 'Renamed', ts: 7, device: 'A' }),
    ])
    expect((await db.tasks.get('t1'))?.origin).toEqual(ORIGIN)
    expect((await db.tasks.get('t1'))?.title).toBe('Renamed')
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

describe('comments (comments-and-activity)', () => {
  const member = (userId: string, role: 'owner' | 'editor' | 'viewer' = 'editor') => ({ userId, name: userId, email: `${userId}@example.com`, role })
  const comment = (id: string, created: number, parent: string | null = null, deleted: number | null = null): Comment => ({
    id, task_id: 't', parent_id: parent, body: id, author_id: 'me', mentions: [], created_at: created, edited_at: null, deleted_at: deleted, _clock: {},
  })

  it('creates comment ops in task scope', async () => {
    await setCurrentUserId('me')
    const shared = await createProject({ name: 'Team' })
    await db.memberships.put({ projectId: shared, role: 'viewer', ownerId: 'alice', members: [member('alice', 'owner'), member('me', 'viewer')] })
    const task = await createTask({ title: 'Plan', project_id: shared })
    await db.outbox.clear()
    const id = await createComment({ taskId: task, body: '  Looks **good** @alice ', mentions: ['alice', 'alice'] })
    const row = await db.comments.get(id)
    expect(row).toMatchObject({ task_id: task, author_id: 'me', body: 'Looks **good** @alice', parent_id: null, mentions: ['alice'], edited_at: null, deleted_at: null })
    // One op per field, the placing fields first; the task's scope decides where they live.
    const ops = await db.outbox.toArray()
    expect(ops.every((o) => o.entity === 'comment' && o.entityId === id)).toBe(true)
    expect(ops.slice(0, 2).map((o) => o.field)).toEqual(['task_id', 'author_id'])
    expect(scopeOf((await db.tasks.get(task))?.project_id, await membershipMap())).toBe(`project:${shared}`)
    expect(await commentCounts()).toEqual(new Map([[task, 1]]))
    // Edit and delete are author-side ops; deleted comments stop counting.
    await editComment(id, 'Better')
    expect((await db.comments.get(id))?.edited_at).toBeGreaterThan(0)
    await deleteComment(id)
    expect((await commentCounts()).get(task)).toBeUndefined()
    await expect(createComment({ taskId: task, body: '   ' })).rejects.toThrow()
  })

  it('thread order with deleted parent', () => {
    const list = [
      comment('r2', 40, 'a'), comment('b', 20), comment('a', 10, null, 99), comment('r1', 30, 'a'), comment('rr', 50, 'r1'),
      comment('orphan', 15, 'missing'), comment('x', 60, 'y'), comment('y', 70, 'x'),
    ]
    const threads = threadOrder(list)
    expect(threads.map((t) => [t.root.id, t.replies.map((r) => r.id)])).toEqual([
      ['a', ['r1', 'r2', 'rr']], ['orphan', []], ['b', []], ['x', []], ['y', []],
    ])
    // The deleted parent keeps its place so replies stay visible under a placeholder.
    expect(threads[0].root.deleted_at).toBe(99)
    expect(threadVisible(threads[0])).toBe(true)
    expect(threadVisible({ root: comment('d', 1, null, 5), replies: [] })).toBe(false)
  })

  it('mirrors the server rules for edit and delete', () => {
    const c = comment('c', 1)
    expect(canEditComment(c, 'me')).toBe(true)
    expect(canEditComment(c, 'bob')).toBe(false)
    expect(canDeleteComment(c, 'bob', 'admin')).toBe(true)
    expect(canDeleteComment(c, 'bob', 'editor')).toBe(false)
    expect(canDeleteComment(c, 'bob', 'viewer')).toBe(false)
    expect(canDeleteComment({ ...c, deleted_at: 3 }, 'me', 'owner')).toBe(false)
  })

  it('adopts the server-filtered mentions that carry the local clock', async () => {
    await applyOps([op({ entity: 'comment', entityId: 'c1', field: 'mentions', value: ['bob', 'ghost'], ts: 100, device: 'A' })])
    await applyOps([op({ entity: 'comment', entityId: 'c1', field: 'mentions', value: ['bob'], ts: 100, device: 'A' })])
    expect((await db.comments.get('c1'))?.mentions).toEqual(['bob'])
    // Other fields keep plain last-writer-wins: an equal clock changes nothing.
    await applyOps([op({ entity: 'comment', entityId: 'c1', field: 'body', value: 'one', ts: 100, device: 'A' })])
    await applyOps([op({ entity: 'comment', entityId: 'c1', field: 'body', value: 'two', ts: 100, device: 'A' })])
    expect((await db.comments.get('c1'))?.body).toBe('one')
  })

  it('mention helpers', () => {
    expect(mentionAt('hi @Bo', 6)).toEqual({ query: 'Bo', start: 3 })
    expect(mentionAt('mail a@b', 8)).toBeNull()
    const members = [member('bob'), member('bobby'), member('alice'), member('me')]
    expect(mentionCandidates(members, 'bo', 'me').map((m) => m.userId)).toEqual(['bob', 'bobby'])
    expect(mentionCandidates(members, '', 'me').map((m) => m.userId)).toEqual(['alice', 'bob', 'bobby'])
    expect(mentionToken({ name: 'Bob Smith', email: 'b@x' })).toBe('BobSmith')
    const picked = new Map([['bob', 'bob'], ['alice', 'alice']])
    expect(mentionsInBody('thanks @bob!', picked)).toEqual(['bob'])
    expect(mentionsInBody('thanks @bobby', picked)).toEqual([])
  })
})

describe('sections (board-view)', () => {
  const sop = (entityId: string, field: string, value: unknown, ts: number, device = 'Z'): Op => ({
    id: crypto.randomUUID(), entity: 'section', entityId, field, value, ts, device,
  })

  it('applies section ops into the sections table and defaults section_id to null', async () => {
    await applyOps([sop('s1', 'name', 'Doing', 1), sop('s1', 'project_id', 'p1', 1), sop('s1', 'name', 'stale', 0)])
    expect(await db.sections.get('s1')).toMatchObject({ id: 's1', name: 'Doing', project_id: 'p1', position: 0, deleted_at: null })
    expect(await db.tasks.count()).toBe(0)
    const id = await createTask({ title: 'Plain' })
    expect((await db.tasks.get(id))?.section_id).toBeNull()
    expect((await db.outbox.toArray()).some((o) => o.field === 'section_id')).toBe(false)
    // A row from an older peer without the field also reads null.
    await applyOps([op({ entityId: 'remote', field: 'title', value: 'x', ts: 1, device: 'Z' })])
    expect((await db.tasks.get('remote'))?.section_id).toBeNull()
  })

  it('new task has empty notes_doc (collaborative-rich-text) and plain notes stay plain', async () => {
    const id = await createTask({ title: 'Plain', description: 'just text' })
    const t = await db.tasks.get(id)
    expect(t?.notes_doc).toBe('')
    expect(t?.description).toBe('just text')
    // No document op is sent until the note is edited as rich text.
    expect((await db.outbox.toArray()).some((o) => o.field === 'notes_doc')).toBe(false)
    await updateTask(id, { description: 'still plain' })
    expect((await db.tasks.get(id))?.notes_doc).toBe('')
    // A row from an older peer without the field also reads ''.
    await applyOps([op({ entityId: 'older', field: 'title', value: 'x', ts: 1, device: 'Z' })])
    expect((await db.tasks.get('older'))?.notes_doc).toBe('')
  })

  it('unknown entity is ignored', async () => {
    const future = { id: 'f1', entity: 'checklist', entityId: 'c1', field: 'name', value: 'x', ts: 1, device: 'Z' } as unknown as Op
    await expect(applyOps([future, op({ entityId: 'known', field: 'title', value: 'kept', ts: 1, device: 'Z' })])).resolves.toBeUndefined()
    expect((await db.tasks.get('known'))?.title).toBe('kept')
    expect(await db.tasks.get('c1')).toBeUndefined()
  })

  it('create, rename and reorder sections offline as ops', async () => {
    const p = await createProject({ name: 'Work' })
    const backlog = await createSection(p, ' Backlog ')
    const doing = await createSection(p, 'Doing')
    expect((await projectSections(p)).map((s) => s.name)).toEqual(['Backlog', 'Doing'])
    await renameSection(doing, 'In progress')
    expect((await db.sections.get(doing))?.name).toBe('In progress')
    expect(await reorderSection(doing, -1)).toBe(true)
    expect(await reorderSection(doing, -1)).toBe(false)
    expect((await projectSections(p)).map((s) => s.id)).toEqual([doing, backlog])
    const fields = (await db.outbox.toArray()).filter((o) => o.entityId === doing).map((o) => o.field)
    expect(fields).toEqual(expect.arrayContaining(['name', 'project_id', 'position', 'created_at', 'deleted_at']))
    await expect(createSection(p, '  ')).rejects.toThrow()
  })

  it('delete section moves tasks to no section', async () => {
    const p = await createProject({ name: 'Work' })
    const doing = await createSection(p, 'Doing')
    const a = await createTask({ title: 'A', project_id: p, section_id: doing })
    const b = await createTask({ title: 'B', project_id: p, section_id: doing })
    const done = await createTask({ title: 'Done', project_id: p, section_id: doing })
    await setTaskCompleted(done, true)
    await db.outbox.clear()
    await deleteSection(doing)
    expect((await db.sections.get(doing))?.deleted_at).toBeTypeOf('number')
    expect((await db.tasks.get(a))?.section_id).toBeNull()
    expect((await db.tasks.get(b))?.section_id).toBeNull()
    // Completed tasks keep their reference; one op per open task plus the tombstone, one timestamp.
    expect((await db.tasks.get(done))?.section_id).toBe(doing)
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => `${o.entity}.${o.field}`).sort()).toEqual(['section.deleted_at', 'task.section_id', 'task.section_id'])
    expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
  })

  it('move writes section and end-of-column position in one mutation', async () => {
    const p = await createProject({ name: 'Work' })
    const doing = await createSection(p, 'Doing')
    const first = await createTask({ title: 'First', project_id: p, section_id: doing })
    await updateTask(first, { position: 5_000_000_000_000 })
    const t = await createTask({ title: 'Mover', project_id: p })
    await db.outbox.clear()
    await moveTaskToSection(t, doing)
    const moved = await db.tasks.get(t)
    expect(moved?.section_id).toBe(doing)
    expect(moved?.position).toBe(5_000_000_001_000)
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => o.field).sort()).toEqual(['position', 'section_id'])
    expect(ops[0].ts).toBe(ops[1].ts)
    // Back to "No section"; a section of another project is refused.
    const other = await createSection(await createProject({ name: 'Other' }), 'X')
    await expect(moveTaskToSection(t, other)).rejects.toThrow()
    await moveTaskToSection(t, null)
    expect((await db.tasks.get(t))?.section_id).toBeNull()
  })

  it('concurrent moves resolve to newer', async () => {
    const p = await createProject({ name: 'Work' })
    const doing = await createSection(p, 'Doing')
    const t = await createTask({ title: 'Contested', project_id: p })
    await moveTaskToSection(t, doing)
    const local = await db.tasks.get(t)
    // Another device moved it to "Done" later; its two ops win together.
    const later = (local?._clock.section_id.ts ?? 0) + 10
    await applyOps([
      op({ entityId: t, field: 'section_id', value: 'done', ts: later, device: 'B' }),
      op({ entityId: t, field: 'position', value: 42, ts: later, device: 'B' }),
    ])
    expect(await db.tasks.get(t)).toMatchObject({ section_id: 'done', position: 42 })
    // An older move arriving afterwards changes nothing.
    await applyOps([
      op({ entityId: t, field: 'section_id', value: doing, ts: later - 5, device: 'C' }),
      op({ entityId: t, field: 'position', value: 7, ts: later - 5, device: 'C' }),
    ])
    expect(await db.tasks.get(t)).toMatchObject({ section_id: 'done', position: 42 })
  })

  it('project change clears section', async () => {
    const a = await createProject({ name: 'A' })
    const b = await createProject({ name: 'B' })
    const doing = await createSection(a, 'Doing')
    const t = await createTask({ title: 'Ship', project_id: a, section_id: doing })
    await db.outbox.clear()
    await updateTask(t, { project_id: b })
    expect(await db.tasks.get(t)).toMatchObject({ project_id: b, section_id: null })
    expect((await db.outbox.toArray()).map((o) => o.field).sort()).toEqual(['project_id', 'section_id'])
    // Picking a section of the new project in the same edit keeps it.
    const later = await createSection(a, 'Later')
    await updateTask(t, { project_id: a, section_id: later })
    expect((await db.tasks.get(t))?.section_id).toBe(later)
  })
})

describe('mutateMany origin (in-app-assistant)', () => {
  it("stamps device assistant:<device-id> on a confirmed assistant batch and the plain id otherwise", async () => {
    const { mutateMany } = await import('./ops')
    const id = await createTask({ title: 'Water plants' })
    await db.outbox.clear()
    await mutateMany([{ entity: 'task', entityId: id, patch: { priority: 1 } }], { origin: 'assistant' })
    await mutate('task', id, { priority: 2 })
    const device = await getDeviceId()
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => o.device)).toEqual([`assistant:${device}`, device])
    const t = await db.tasks.get(id)
    expect(t!._clock.priority.device).toBe(device)
  })
})

describe('createTasks (paste-to-tasks 2.1)', () => {
  const byPosition = async () => (await db.tasks.toArray()).filter((t) => !t.deleted_at).sort(compareByPosition)

  it('positions increase in input order, appended after existing tasks, ids returned in order', async () => {
    await createTask({ title: 'old' })
    const ids = await createTasks([{ title: 'A' }, { title: 'B' }, { title: 'C' }])
    const rows = await byPosition()
    expect(rows.map((t) => t.title)).toEqual(['old', 'A', 'B', 'C'])
    expect(rows.slice(1).map((t) => t.id)).toEqual(ids)
  })

  it('at the top the block keeps its reading order above every task', async () => {
    await createTask({ title: 'old' })
    await createTasks([{ title: 'A' }, { title: 'B' }], 'top')
    expect((await byPosition()).map((t) => t.title)).toEqual(['A', 'B', 'old'])
  })

  it('writes every task and its typed reminders as one batch: one clock across the outbox', async () => {
    const ids = await createTasks([
      { title: 'Call Anna', due: { date: '2030-01-02', time: '10:00' }, reminders: [{ kind: 'offset', minutes: 30 }] },
      { title: 'Send invoice', priority: 1 },
    ])
    const ops = await db.outbox.toArray()
    expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
    expect(new Set(ops.filter((o) => o.entity === 'task').map((o) => o.entityId))).toEqual(new Set(ids))
    expect(ops.some((o) => o.entity === 'reminder' && o.field === 'task_id' && o.value === ids[0])).toBe(true)
    expect((await db.tasks.get(ids[1]))!.priority).toBe(1)
  })

  it('subtasks of one parent keep the pasted order', async () => {
    const parent = await createTask({ title: 'Plan trip' })
    await createTasks(['Passport', 'Charger', 'Tickets'].map((title) => ({ title, parent_id: parent })))
    expect((await byPosition()).filter((t) => t.parent_id === parent).map((t) => t.title)).toEqual(['Passport', 'Charger', 'Tickets'])
  })

  it('an over-long encrypted title refuses the whole batch before any op exists', async () => {
    publishEncryption({ enabled: true })
    try {
      const before = await db.outbox.count()
      await expect(createTasks([{ title: 'Fine' }, { title: 'x'.repeat(MAX_PLAINTEXT_BYTES + 1) }, { title: 'Also fine' }])).rejects.toBeInstanceOf(PlaintextTooLongError)
      expect(await db.outbox.count()).toBe(before)
      expect(await db.tasks.count()).toBe(0)
    } finally {
      publishEncryption({ enabled: false })
    }
  })
})
