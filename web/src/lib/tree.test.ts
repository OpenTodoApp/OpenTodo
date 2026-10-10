import { beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from './db'
import { applyOps, createSubtask, createTask, resetDeviceId, setTaskCompleted } from './ops'
import { breadcrumbOf, buildTaskTree, parentState, progressOf } from './subtasks'
import { ancestors, buildTree, descendants, effectiveParents, flattenTree, isDescendant } from './tree'
import type { Op, Task } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`tree-${Date.now()}-${n++}`)
  resetDeviceId()
})

function task(id: string, parent_id: string | null, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: 'p', parent_id, priority: 4, due: null, labels: [],
    position: n++, created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, _clock: {}, ...extra,
  }
}

const op = (entityId: string, field: string, value: unknown, ts: number, device: string): Op => ({
  id: crypto.randomUUID(), entity: 'task', entityId, field, value, ts, device,
})

describe('buildTree', () => {
  it('computes depth in depth-first order with siblings by position', () => {
    const items = [task('trip', null), task('flights', 'trip'), task('hotel', 'trip'), task('compare', 'hotel')]
    const flat = flattenTree(buildTree(items).roots)
    expect(flat.map((x) => [x.id, x.depth])).toEqual([['trip', 0], ['flights', 1], ['hotel', 1], ['compare', 2]])
  })

  it('shows a child whose parent is absent at the top level', () => {
    const items = [task('a', null), task('orphan', 'ghost')]
    const flat = flattenTree(buildTree(items).roots)
    expect(flat.map((x) => [x.id, x.depth, x.parent])).toEqual([['a', 0, null], ['orphan', 0, null]])
  })

  it('skips the children of collapsed nodes', () => {
    const items = [task('trip', null), task('hotel', 'trip'), task('compare', 'hotel'), task('other', null)]
    const flat = flattenTree(buildTree(items).roots, (id) => id === 'trip')
    expect(flat.map((x) => x.id)).toEqual(['trip', 'other'])
  })

  it('breaks a cycle identically for both op orders, at the member with the newest parent clock', async () => {
    // Device A makes X a child of Y at ts 100; device B makes Y a child of X at ts 200.
    const base = (id: string) => [
      op(id, 'title', id, 1, 'A'), op(id, 'project_id', 'p', 1, 'A'), op(id, 'created_at', 1, 1, 'A'), op(id, 'position', id === 'X' ? 1 : 2, 1, 'A'),
    ]
    const moveX = op('X', 'parent_id', 'Y', 100, 'A')
    const moveY = op('Y', 'parent_id', 'X', 200, 'B')
    const results: string[] = []
    for (const order of [[moveX, moveY], [moveY, moveX]]) {
      const db = useDatabase(`cycle-${Date.now()}-${n++}`)
      await applyOps([...base('X'), ...base('Y')])
      for (const o of order) await applyOps([o])
      const items = await db.tasks.toArray()
      const flat = flattenTree(buildTree(items).roots)
      results.push(JSON.stringify(flat.map((x) => [x.id, x.depth, x.parent])))
    }
    expect(new Set(results).size).toBe(1)
    // Y's parent change is newer, so Y is shown at the top level with X beneath it.
    expect(JSON.parse(results[0])).toEqual([['Y', 0, null], ['X', 1, 'Y']])
  })

  it('breaks a three-member cycle and keeps its tail reachable', () => {
    const items = [
      task('a', 'c', { _clock: { parent_id: { ts: 10, device: 'd' } } }),
      task('b', 'a', { _clock: { parent_id: { ts: 30, device: 'd' } } }),
      task('c', 'b', { _clock: { parent_id: { ts: 20, device: 'd' } } }),
      task('tail', 'a'),
    ]
    const parents = effectiveParents(items)
    expect(parents.get('b')).toBeNull()
    expect(parents.get('a')).toBe('c')
    expect(parents.get('c')).toBe('b')
    const flat = flattenTree(buildTree(items).roots)
    expect(flat).toHaveLength(4)
    expect(flat.map((x) => x.id)).toEqual(['b', 'c', 'a', 'tail'])
  })

  it('works for any record shape through the options', () => {
    const items = [{ key: 'r', up: null }, { key: 'c', up: 'r' }]
    const tree = buildTree(items, { id: (i) => i.key, parentId: (i) => i.up, compare: (a, b) => a.key.localeCompare(b.key) })
    expect(tree.roots.map((r) => r.id)).toEqual(['r'])
    expect(tree.roots[0].children[0].id).toBe('c')
  })
})

describe('descendants / isDescendant / ancestors', () => {
  const items = [task('trip', null), task('flights', 'trip'), task('hotel', 'trip'), task('compare', 'hotel'), task('other', null)]
  it('collects the whole subtree', () => {
    expect([...descendants('trip', items)].sort()).toEqual(['compare', 'flights', 'hotel'])
    expect(descendants('other', items).size).toBe(0)
  })
  it('answers ancestry questions, including self', () => {
    expect(isDescendant('compare', 'trip', items)).toBe(true)
    expect(isDescendant('trip', 'trip', items)).toBe(true)
    expect(isDescendant('trip', 'compare', items)).toBe(false)
    expect(isDescendant('other', 'trip', items)).toBe(false)
  })
  it('lists ancestors nearest first and survives a cycle', () => {
    const byId = new Map(items.map((t) => [t.id, t]))
    expect(ancestors('compare', byId).map((t) => t.id)).toEqual(['hotel', 'trip'])
    const loop = new Map([['a', task('a', 'b')], ['b', task('b', 'a')]])
    expect(ancestors('a', loop).map((t) => t.id)).toEqual(['b'])
  })
})

describe('progressOf', () => {
  it('counts direct, non-deleted children: 3/5', () => {
    const trip = task('trip', null)
    const kids = [1, 2, 3, 4, 5].map((i) => task(`k${i}`, 'trip', { completed_at: i <= 3 ? 1 : null }))
    const extra = [task('deleted', 'trip', { deleted_at: 1 }), task('grandchild', 'k1', { completed_at: 1 })]
    expect(progressOf(trip, [trip, ...kids, ...extra])).toEqual({ done: 3, total: 5 })
  })

  it('updates after a remote completion op is applied', async () => {
    const db = useDatabase(`progress-${Date.now()}-${n++}`)
    const trip = await createTask({ title: 'Plan trip', project_id: 'p' })
    const kids: string[] = []
    for (let i = 0; i < 5; i++) kids.push(await createSubtask(trip, `k${i}`))
    for (const k of kids.slice(0, 3)) await setTaskCompleted(k, true)
    const read = async () => progressOf({ id: trip }, await db.tasks.toArray())
    expect(await read()).toEqual({ done: 3, total: 5 })
    await applyOps([op(kids[3], 'completed_at', Date.now() + 1000, Date.now() + 1000, 'other-device')])
    expect(await read()).toEqual({ done: 4, total: 5 })
  })
})

describe('display state of inconsistent parents', () => {
  it('concurrent complete and add shows the new subtask at the top level with a breadcrumb', async () => {
    const db = useDatabase(`concurrent-${Date.now()}-${n++}`)
    const trip = await createTask({ title: 'Plan trip', project_id: 'p' })
    const flights = await createSubtask(trip, 'Flights')
    // Device A completes the parent (and, via cascade, Flights) while device B adds Insurance.
    const ts = Date.now() + 10
    await applyOps([op(trip, 'completed_at', ts, ts, 'A'), op(flights, 'completed_at', ts, ts, 'A')])
    const ins = crypto.randomUUID()
    await applyOps([
      op(ins, 'title', 'Insurance', ts, 'B'), op(ins, 'project_id', 'p', ts, 'B'), op(ins, 'parent_id', trip, ts, 'B'),
      op(ins, 'created_at', ts, ts, 'B'), op(ins, 'position', ts, ts, 'B'),
    ])
    const all = await db.tasks.toArray()
    const byId = new Map(all.map((t) => [t.id, t]))
    const insurance = byId.get(ins)!
    expect(insurance.completed_at).toBeNull()
    expect(parentState(insurance, byId)).toBe('completed')
    expect(breadcrumbOf(insurance, byId)).toBe('Plan trip')
    const open = all.filter((t) => !t.completed_at && !t.deleted_at && t.project_id === 'p')
    const flat = flattenTree(buildTaskTree(open).roots)
    expect(flat.map((x) => [x.id, x.depth])).toEqual([[ins, 0]])
  })

  it('reports missing and deleted parents', () => {
    const child = task('c', 'p1')
    expect(parentState(child, new Map([['c', child]]))).toBe('missing')
    expect(parentState(child, new Map([['c', child], ['p1', task('p1', null, { deleted_at: 1 })]]))).toBe('deleted')
    expect(parentState(child, new Map([['c', child], ['p1', task('p1', null)]]))).toBe('nested')
    expect(parentState(child, new Map([['c', child], ['p1', task('p1', null, { project_id: 'q' })]]))).toBe('elsewhere')
    expect(breadcrumbOf(child, new Map([['c', child]]))).toBeNull()
  })
})
