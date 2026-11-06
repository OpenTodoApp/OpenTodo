// The row menu's Reorder items (OpenSpec change accessibility-aa D3): the single-pointer
// alternative to dragging a task row writes the same position ops as Alt+arrows and a
// drag, locally first, so it works offline and syncs like any other edit.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { applyOps, resetDeviceId } from '../../lib/ops'
import { compareByPosition } from '../../lib/ordering'
import { moveTaskBy, taskStepEdges } from '../../lib/move'
import type { Membership, Op } from '../../lib/types'
import { reorderItem, type ListReorder } from './BulkActions'

let n = 0
beforeEach(() => {
  useDatabase(`reorder-menu-${Date.now()}-${n++}`)
  resetDeviceId()
})

const seedOps = (entity: 'task' | 'project', id: string, fields: Record<string, unknown>): Op[] =>
  Object.entries(fields).map(([field, value]) => ({ id: crypto.randomUUID(), entity, entityId: id, field, value, ts: 1, device: 'seed' }))
const task = (id: string, position: number, extra: Record<string, unknown> = {}) => seedOps('task', id, { title: id, project_id: 'p', position, created_at: 1, ...extra })
const seed = (ops: Op[]) => applyOps([...seedOps('project', 'p', { name: 'P', position: 1, created_at: 1 }), ...ops])
const order = async () => (await db.tasks.toArray()).filter((t) => !t.parent_id && !t.completed_at).sort(compareByPosition).map((t) => t.title)

describe('taskStepEdges', () => {
  it('says first and last among the task’s own list, and null where it cannot move', async () => {
    await seed([...task('a', 1000), ...task('b', 2000), ...task('c', 3000), ...task('done', 4000, { completed_at: 5 }), ...task('sub', 10, { parent_id: 'b' })])
    expect(await taskStepEdges('a')).toEqual({ first: true, last: false })
    expect(await taskStepEdges('b')).toEqual({ first: false, last: false })
    expect(await taskStepEdges('c')).toEqual({ first: false, last: true })
    // A subtask is alone in its parent's list.
    expect(await taskStepEdges('sub')).toEqual({ first: true, last: true })
    expect(await taskStepEdges('done')).toBeNull()
    expect(await taskStepEdges('missing')).toBeNull()
  })

  it('is null for a viewer of a shared project', async () => {
    await seed([...task('a', 1000), ...task('b', 2000)])
    await db.memberships.put({ projectId: 'p', scope: 'project:p', role: 'viewer', members: [] } as unknown as Membership)
    expect(await taskStepEdges('b')).toBeNull()
  })
})

describe('the Reorder items', () => {
  const edges = { first: false, last: false }

  it('are absent outside a manual order, for an unknown edge, or without a task', () => {
    const r: ListReorder = { move: vi.fn(), edges: async () => edges }
    expect(reorderItem('a', null, edges)).toEqual([])
    expect(reorderItem('a', r, null)).toEqual([])
    expect(reorderItem(undefined, r, edges)).toEqual([])
    // Alone in its list: nowhere to go.
    expect(reorderItem('a', r, { first: true, last: true })).toEqual([])
  })

  it('offer Move up, Move down, Move to top and Move to bottom, the ends disabled with a reason', () => {
    const r: ListReorder = { move: vi.fn(), edges: async () => edges }
    const [sub] = reorderItem('a', r, { first: true, last: false })
    expect(sub.kind).toBe('submenu')
    const items = sub.kind === 'submenu' ? sub.items : []
    expect(items.map((i) => [i.id, i.kind === 'action' ? !!i.disabled : null])).toEqual([['move-up', true], ['move-down', false], ['move-top', true], ['move-bottom', false]])
    const up = items[0]
    expect(up.kind === 'action' && up.reason).toBe('Already first')
  })

  it('run the same move as the keyboard, written locally: offline it is in the outbox and the list order', async () => {
    await seed([...task('a', 1000), ...task('b', 2000), ...task('c', 3000)])
    const moved: Promise<boolean>[] = []
    const r: ListReorder = { move: (id, step) => { moved.push(moveTaskBy(id, step)) }, edges: taskStepEdges }
    const [sub] = reorderItem('c', r, await taskStepEdges('c'))
    const items = sub.kind === 'submenu' ? sub.items : []
    const top = items.find((i) => i.id === 'move-top')!
    if (top.kind === 'action') top.onSelect()
    await Promise.all(moved)
    expect(await order()).toEqual(['c', 'a', 'b'])
    // No server was asked: the position op waits in the outbox to sync, like any edit.
    expect((await db.outbox.toArray()).some((op) => op.entityId === 'c' && op.field === 'position')).toBe(true)
  })
})
