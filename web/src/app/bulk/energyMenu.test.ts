// The row menu's Energy submenu (OpenSpec change task-energy, task 3.3): offered
// only while Energy levels is on and the task is editable; a pick is one batch
// the toast can undo, back to no energy for a task that never had one.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createTask, resetDeviceId } from '../../lib/ops'
import type { Membership, Task } from '../../lib/types'
import { undoBatch } from '../../lib/undo'
import { energyUndoable } from '../../lib/undoActions'
import { energyItem } from './BulkActions'

let n = 0
beforeEach(() => {
  useDatabase(`energy-menu-${Date.now()}-${n++}`)
  resetDeviceId()
})

const task = (over: Partial<Task> = {}) => ({ id: 't1', project_id: null, energy: '', ...over }) as Task

describe('Energy submenu', () => {
  it('is offered only with the switch on, with the common level checked', () => {
    const none = new Map<string, Membership>()
    expect(energyItem(['t1'], { tasks: [task()], memberships: none, energy: false })).toEqual([])
    const [menu] = energyItem(['t1'], { tasks: [task({ energy: 'low' })], memberships: none, energy: true })
    expect(menu.kind).toBe('submenu')
    const items = (menu as Extract<typeof menu, { kind: 'submenu' }>).items
    expect(items.map((i) => i.label)).toEqual(['Deep', 'Medium', 'Low', 'No energy'])
    expect(items.map((i) => (i as { checked?: boolean }).checked)).toEqual([false, false, true, false])
  })

  it('is not offered on a viewer’s task', () => {
    const viewer = new Map<string, Membership>([['p1', { projectId: 'p1', role: 'viewer', ownerId: 'o', members: [] }]])
    expect(energyItem(['t1'], { tasks: [task({ project_id: 'p1' })], memberships: viewer, energy: true })).toEqual([])
  })

  it('a pick writes once and Undo restores no energy', async () => {
    const id = await createTask({ title: 'Inbox zero' })
    const r = await energyUndoable([id], 'low')
    expect(r.label).toBe('Energy set to Low')
    expect(((await db.tasks.get(id)) as Task).energy).toBe('low')
    const u = await undoBatch(r.entry!.id)
    expect(u.restored).toBe(1)
    expect(((await db.tasks.get(id)) as Task).energy).toBe('')
    expect((await energyUndoable([id], null)).entry).toBeNull()
  })
})
