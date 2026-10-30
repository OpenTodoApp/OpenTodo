// OpenSpec change view-manual-order, task 2.2: a move written on the label or the
// view as one undoable batch, never on the tasks.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { createTask, mutate, resetDeviceId, setTaskCompleted, updateTask } from './ops'
import { createLabel } from './labels'
import { createView } from './views'
import { undoBatch } from './undo'
import { moveInViewOrder, stepInViewOrder } from './viewOrderMove'
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
