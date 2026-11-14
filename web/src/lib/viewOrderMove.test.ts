// OpenSpec change view-manual-order, task 2.2: a move written on the label or the
// view as one undoable batch, never on the tasks.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { createProject, createTask, mutate, resetDeviceId, setTaskCompleted, updateTask } from './ops'
import { createLabel } from './labels'
import { createView } from './views'
import { undoBatch } from './undo'
import { dropInViewGroup, moveInViewOrder, stepInViewOrder } from './viewOrderMove'
import type { Task } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`view-order-${Date.now()}-${n++}`)
  resetDeviceId()
})

async function tasksOf(ids: string[]): Promise<Task[]> {
  return (await db.tasks.bulkGet(ids)).filter((x): x is Task => !!x)
}

describe('moveInViewOrder', () => {
  it('writes the label page order in one op, switches nothing else and leaves task positions alone', async () => {
    const label = await createLabel({ name: 'errand' })
    const ids = [await createTask({ title: 'Pharmacy', labels: [label] }), await createTask({ title: 'Bakery', labels: [label] }), await createTask({ title: 'Post office', labels: [label] })]
    const before = new Map((await tasksOf(ids)).map((x) => [x.id, x.position]))
    await db.outbox.clear()
    const r = await moveInViewOrder({ entity: 'label', id: label }, await tasksOf(ids), ids[2], { before: ids[0] })
    expect(r?.label).toBe('Order changed')
    expect((await db.labels.get(label))?.manual_order).toEqual([ids[2]])
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => `${o.entity}.${o.field}`)).toEqual(['label.manual_order'])
    for (const x of await tasksOf(ids)) expect(x.position).toBe(before.get(x.id))
    await undoBatch(r!.entry!.id)
    expect((await db.labels.get(label))?.manual_order).toEqual([])
  })

  it('switches a view in another order to Manual order in the same batch, undone together', async () => {
    const view = await createView({ name: 'Urgent', query: 'p1', sort_by: 'due' })
    const ids = [await createTask({ title: 'A', priority: 1 }), await createTask({ title: 'B', priority: 1 })]
    const r = await moveInViewOrder({ entity: 'view', id: view }, await tasksOf(ids), ids[1], { before: ids[0] })
    expect(await db.views.get(view)).toMatchObject({ manual_order: [ids[1]], sort_by: 'position', sort_dir: 'asc' })
    await undoBatch(r!.entry!.id)
    expect(await db.views.get(view)).toMatchObject({ manual_order: [], sort_by: 'due', sort_dir: 'asc' })
  })

  it('drops completed and deleted tasks no longer shown, keeps open ones', async () => {
    const label = await createLabel({ name: 'call' })
    const [a, b, c, d] = [await createTask({ title: 'A' }), await createTask({ title: 'B' }), await createTask({ title: 'C' }), await createTask({ title: 'D' })]
    await updateLabelOrder(label, [a, b, c, d])
    await setTaskCompleted(b, true)
    await updateTask(c, { deleted_at: Date.now() })
    // The page now shows a and d only; d moves to the top.
    await moveInViewOrder({ entity: 'label', id: label }, await tasksOf([a, d]), d, { before: a })
    expect((await db.labels.get(label))?.manual_order).toEqual([d, a])
  })

  it('a task of a project the user only views can be ordered on their own page', async () => {
    await db.memberships.put({ projectId: 'launch', role: 'viewer', ownerId: 'ana', members: [] })
    const label = await createLabel({ name: 'follow-up' })
    const a = await createTask({ title: 'Brief', project_id: 'launch' })
    const b = await createTask({ title: 'Deck', project_id: 'launch' })
    const r = await stepInViewOrder({ entity: 'label', id: label }, await tasksOf([a, b]), await tasksOf([a, b]), b, -1)
    expect(r?.entry).toBeTruthy()
    expect((await db.labels.get(label))?.manual_order).toEqual([b])
  })

  it('writes nothing at the edge of the group', async () => {
    const label = await createLabel({ name: 'home' })
    const a = await createTask({ title: 'A' })
    await db.outbox.clear()
    expect(await stepInViewOrder({ entity: 'label', id: label }, await tasksOf([a]), await tasksOf([a]), a, -1)).toBeNull()
    expect(await db.outbox.count()).toBe(0)
  })
})

async function updateLabelOrder(id: string, order: string[]) {
  await mutate('label', id, { manual_order: order })
}

// OpenSpec change view-project-drops, tasks 1.2 and 1.3: a drop across project groups
// or onto a task moves the task and places it in the view's order, in one batch.
describe('dropInViewGroup', () => {
  async function setup() {
    const home = await createProject({ name: 'Home' })
    const work = await createProject({ name: 'Work' })
    const view = await createView({ name: 'This week', query: 'p4', group_by: 'project' })
    const paint = await createTask({ title: 'Buy paint', project_id: home })
    const step = await createTask({ title: 'Pick a colour', project_id: home, parent_id: paint })
    const report = await createTask({ title: 'Report', project_id: work })
    const deck = await createTask({ title: 'Deck', project_id: work })
    return { home, work, view, paint, step, report, deck, host: { entity: 'view' as const, id: view } }
  }

  it('moves the task with its subtasks to the group\'s project and places it, undone together', async () => {
    const s = await setup()
    const shown = await tasksOf([s.paint, s.report, s.deck])
    const r = await dropInViewGroup(s.host, shown, s.paint, { projectId: s.work, projectName: 'Work', at: { after: s.report } })
    expect(r?.label).toBe('Moved to Work')
    expect((await db.tasks.get(s.paint))?.project_id).toBe(s.work)
    expect((await db.tasks.get(s.step))?.project_id).toBe(s.work)
    const order = (await db.views.get(s.view))?.manual_order as string[]
    expect(order.indexOf(s.paint)).toBe(order.indexOf(s.report) + 1)
    await undoBatch(r!.entry!.id)
    expect((await db.tasks.get(s.paint))?.project_id).toBe(s.home)
    expect((await db.tasks.get(s.step))?.project_id).toBe(s.home)
    expect((await db.views.get(s.view))?.manual_order).toEqual([])
  })

  it('nests onto a task of another project as its last subtask, without touching the view order', async () => {
    const s = await setup()
    const flights = await createTask({ title: 'Book flights', project_id: s.home })
    const existing = await createTask({ title: 'Ask for leave', project_id: s.work, parent_id: s.report })
    const r = await dropInViewGroup(s.host, await tasksOf([flights, s.report]), flights, { projectId: s.work, projectName: 'Work', parentId: s.report })
    const moved = await db.tasks.get(flights)
    expect(moved).toMatchObject({ project_id: s.work, parent_id: s.report })
    expect(moved!.position).toBeGreaterThan((await db.tasks.get(existing))!.position)
    expect((await db.views.get(s.view))?.manual_order).toEqual([])
    await undoBatch(r!.entry!.id)
    expect(await db.tasks.get(flights)).toMatchObject({ project_id: s.home, parent_id: null })
  })

  it('makes a subtask dragged out to the top level a top-level task of the project', async () => {
    const s = await setup()
    await dropInViewGroup(s.host, await tasksOf([s.paint, s.step]), s.step, { projectId: s.home, projectName: 'Home', at: { after: s.paint } })
    expect(await db.tasks.get(s.step)).toMatchObject({ project_id: s.home, parent_id: null })
  })

  it('refuses a parent that is the task itself or one of its subtasks', async () => {
    const s = await setup()
    await db.outbox.clear()
    expect(await dropInViewGroup(s.host, [], s.paint, { projectId: s.home, projectName: 'Home', parentId: s.step })).toBeNull()
    expect(await dropInViewGroup(s.host, [], s.paint, { projectId: s.home, projectName: 'Home', parentId: s.paint })).toBeNull()
    expect(await db.outbox.count()).toBe(0)
  })

  it('refuses a drop into a project the person only views', async () => {
    const s = await setup()
    await db.memberships.put({ projectId: 'launch', role: 'viewer', ownerId: 'ana', members: [] })
    await db.outbox.clear()
    expect(await dropInViewGroup(s.host, [], s.paint, { projectId: 'launch', projectName: 'Launch', at: { after: s.report } })).toBeNull()
    expect((await db.tasks.get(s.paint))?.project_id).toBe(s.home)
    expect(await db.outbox.count()).toBe(0)
  })
})
