// OpenSpec `manual-ordering`: order rule, fractional insertion, renumbering, moves
// through mutate() and convergence of concurrent reorders.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, createTask, resetDeviceId } from './ops'
import {
  GAP, compareByPosition, compareDueThenPriority, needsRenumber, planMove, planStep, positionBetween, renumber, type PositionChange,
} from './ordering'
import { moveProjectBy, moveProjectTo, moveTask, moveTaskBy } from './move'
import { buildTree } from './tree'
import type { Membership, Op, Task } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`ordering-${Date.now()}-${n++}`)
  resetDeviceId()
})

const seedOps = (entity: 'task' | 'project' | 'section', id: string, fields: Record<string, unknown>): Op[] =>
  Object.entries(fields).map(([field, value]) => ({ id: crypto.randomUUID(), entity, entityId: id, field, value, ts: 1, device: 'seed' }))

function taskOps(id: string, position: number, extra: Record<string, unknown> = {}): Op[] {
  return seedOps('task', id, { title: id, project_id: 'p', position, created_at: 1, ...extra })
}

async function seed(ops: Op[]): Promise<void> {
  await applyOps([...seedOps('project', 'p', { name: 'P', position: 1, created_at: 1 }), ...ops])
}

/** Titles of the open top-level tasks of `section` (null = none) in display order. */
async function order(filter: (t: Task) => boolean = (t) => !t.parent_id): Promise<string[]> {
  const all = (await db.tasks.toArray()).filter((t) => !t.deleted_at && !t.completed_at && filter(t))
  return all.sort(compareByPosition).map((t) => t.title)
}

async function outbox(): Promise<Op[]> {
  return db.outbox.toArray()
}

const L = (...ps: number[]) => ps.map((p, i) => ({ id: String.fromCharCode(97 + i), position: p }))

describe('order helpers', () => {
  it('sorts by position, then id', () => {
    const list = [{ id: 'b', position: 5 }, { id: 'a', position: 5 }, { id: 'c', position: 1 }]
    expect(list.sort(compareByPosition).map((x) => x.id)).toEqual(['c', 'a', 'b'])
  })

  it('midpoint 1500 between 1000 and 2000; GAP before the first and after the last', () => {
    expect(positionBetween(1000, 2000)).toBe(1500)
    expect(positionBetween(null, 1000)).toBe(1000 - GAP)
    expect(positionBetween(2000, null)).toBe(2000 + GAP)
  })

  it('detects an exhausted gap', () => {
    expect(needsRenumber(1000, 2000)).toBe(false)
    expect(needsRenumber(null, 5)).toBe(false)
    expect(needsRenumber(7, 7)).toBe(true)
    expect(needsRenumber(9, 7)).toBe(true)
    const a = 2 ** 40
    expect(needsRenumber(a, a + 2 ** -12)).toBe(true) // adjacent doubles: no value between
  })

  it('renumber preserves order with even spacing from the smallest position', () => {
    const list = [{ id: 'z', position: 10 }, { id: 'y', position: 10 }, { id: 'x', position: 3 }]
    const changes = renumber(list)
    const after = list.map((s) => ({ ...s, position: changes.find((c) => c.id === s.id)?.position ?? s.position }))
    expect(after.sort(compareByPosition).map((s) => s.id)).toEqual(['x', 'y', 'z'])
    expect(after.map((s) => s.position)).toEqual([3, 3 + GAP, 3 + 2 * GAP])
    expect(changes.find((c) => c.id === 'x')).toBeUndefined() // unchanged items are not written
  })

  it('planMove: one change in the common case, none when already there', () => {
    expect(planMove(L(1000, 2000, 3000), 'c', 1)).toEqual([{ id: 'c', position: 1500 }])
    expect(planMove(L(1000, 2000, 3000), 'c', 'top')).toEqual([{ id: 'c', position: 0 }])
    expect(planMove(L(1000, 2000, 3000), 'a', 'bottom')).toEqual([{ id: 'a', position: 4000 }])
    expect(planMove(L(1000, 2000, 3000), 'b', 1)).toEqual([])
    expect(planMove(L(1000, 2000), 'new', { before: 'b' })).toEqual([{ id: 'new', position: 1500 }])
    expect(planMove(L(1000, 2000), 'new', { after: 'b' })).toEqual([{ id: 'new', position: 3000 }])
    expect(planMove(L(1000), 'new', { before: 'missing' })).toBeNull()
    expect(planMove([], 'new', 0, { fallback: 42 })).toEqual([{ id: 'new', position: 42 }])
  })

  it('planMove renumbers the smallest window when neighbours are identical', () => {
    // b and c share a position: dropping d between them cannot bisect (board-view note).
    const list = L(1000, 2000, 2000, 3000, 9000)
    const plan = planMove([...list, { id: 'x', position: 5 }], 'x', { after: 'b' }) as PositionChange[]
    expect(plan[0].id).toBe('x')
    const pos = new Map([...list, { id: 'x', position: 5 }].map((s) => [s.id, s.position]))
    for (const c of plan) pos.set(c.id, c.position)
    const sorted = [...pos.entries()].sort((p, q) => p[1] - q[1] || (p[0] < q[0] ? -1 : 1)).map(([id]) => id)
    expect(sorted).toEqual(['a', 'b', 'x', 'c', 'd', 'e'])
    expect(new Set(pos.values()).size).toBe(6)
    expect(plan.length).toBeLessThanOrEqual(3) // a window, not the whole list
    expect(plan.some((c) => c.id === 'e')).toBe(false)
  })

  it('planMove renumbers after about twenty bisections of the same gap', () => {
    const base = 1.7e12
    let list = [{ id: 'lo', position: base }, { id: 'hi', position: base + 1 }]
    let renumbered = 0
    for (let i = 0; i < 60; i++) {
      const id = `m${i}`
      const plan = planMove(list, id, { after: 'lo' }) as PositionChange[]
      if (plan.length > 1) renumbered++
      const pos = new Map(list.map((s) => [s.id, s.position]))
      for (const c of plan) pos.set(c.id, c.position)
      list = [...pos.entries()].map(([id, position]) => ({ id, position }))
      const sorted = [...list].sort(compareByPosition).map((s) => s.id)
      expect(sorted[0]).toBe('lo')
      expect(sorted[1]).toBe(id)
      expect(new Set(list.map((s) => s.position)).size).toBe(list.length)
    }
    expect(renumbered).toBeGreaterThan(0)
  })

  it('planMove never rewrites items that are not writable', () => {
    const list = L(1000, 1000, 1000)
    expect(planMove(list, 'x', { after: 'a' }, { writable: (s) => s.id !== 'b' && s.id !== 'a' })).toBeNull()
    const plan = planMove(list, 'x', { after: 'b' }, { writable: (s) => s.id !== 'b' && s.id !== 'a' }) as PositionChange[]
    expect(plan.map((c) => c.id).sort()).toEqual(['c', 'x'])
  })

  it('planStep: edges do nothing, steps and jumps move', () => {
    const list = L(1000, 2000, 3000)
    expect(planStep(list, 'a', -1)).toBeNull()
    expect(planStep(list, 'c', 1)).toBeNull()
    expect(planStep(list, 'a', 'top')).toBeNull()
    expect(planStep(list, 'b', -1)).toEqual([{ id: 'b', position: 0 }])
    expect(planStep(list, 'a', 1)).toEqual([{ id: 'a', position: 2500 }])
    expect(planStep(list, 'a', 'bottom')).toEqual([{ id: 'a', position: 4000 }])
  })

  it('Upcoming tie-break by position', () => {
    const due = { date: '2026-10-11' }
    const tasks = [
      { id: 'a', position: 30, due, priority: 4 },
      { id: 'b', position: 10, due, priority: 4 },
      { id: 'c', position: 20, due, priority: 1 },
      { id: 'd', position: 5, due: { date: '2026-10-12' }, priority: 1 },
    ]
    expect(tasks.sort(compareDueThenPriority).map((t) => t.id)).toEqual(['c', 'b', 'a', 'd'])
  })

  it('tree siblings use the same rule (position, then id)', () => {
    const t = buildTree([{ id: 'b', position: 1, created_at: 1 }, { id: 'a', position: 1, created_at: 2 }])
    expect(t.roots.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('moving tasks through mutate()', () => {
  it('one op per move', async () => {
    await seed([...taskOps('a', 1000), ...taskOps('b', 2000), ...taskOps('c', 3000)])
    expect(await moveTask('c', { parent_id: null, at: { before: 'b' } })).toBe(true)
    const ops = await outbox()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ entityId: 'c', field: 'position', value: 1500 })
    expect(await order()).toEqual(['a', 'c', 'b'])
  })

  it('drag the third task above the first; the others keep their order', async () => {
    await seed([...taskOps('a', 1000), ...taskOps('b', 2000), ...taskOps('c', 3000), ...taskOps('d', 4000)])
    await moveTask('c', { parent_id: null, at: 'top' })
    expect(await order()).toEqual(['c', 'a', 'b', 'd'])
  })

  it('a no-op drop queues nothing', async () => {
    await seed([...taskOps('a', 1000), ...taskOps('b', 2000)])
    expect(await moveTask('b', { parent_id: null, at: { after: 'a' } })).toBe(false)
    expect(await outbox()).toHaveLength(0)
  })

  it('exhausted gap renumbers only that list', async () => {
    const a = 2 ** 40
    await seed([
      ...seedOps('section', 's1', { name: 'Doing', project_id: 'p', position: 1, created_at: 1 }),
      ...taskOps('a', a), ...taskOps('b', a + 2 ** -12), ...taskOps('c', a + 1),
      ...taskOps('x', a, { section_id: 's1' }), ...taskOps('y', a, { section_id: 's1' }),
    ])
    expect(await moveTask('c', { parent_id: null, section_id: null, at: { after: 'a' } })).toBe(true)
    const ops = await outbox()
    expect(ops.length).toBeGreaterThan(1)
    expect(ops.every((o) => ['a', 'b', 'c'].includes(o.entityId) && o.field === 'position')).toBe(true)
    expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
    expect(await order((t) => !t.section_id)).toEqual(['a', 'c', 'b'])
    expect(await order((t) => t.section_id === 's1')).toEqual(['x', 'y'])
  })

  it('cross-container move shares one timestamp', async () => {
    await seed([
      ...seedOps('section', 'doing', { name: 'Doing', project_id: 'p', position: 2, created_at: 1 }),
      ...seedOps('section', 'backlog', { name: 'Backlog', project_id: 'p', position: 1, created_at: 1 }),
      ...taskOps('t', 1000, { section_id: 'backlog' }),
      ...taskOps('d1', 1000, { section_id: 'doing' }), ...taskOps('d2', 2000, { section_id: 'doing' }),
    ])
    expect(await moveTask('t', { parent_id: null, section_id: 'doing', at: { before: 'd2' } })).toBe(true)
    const ops = await outbox()
    expect(ops.map((o) => o.field).sort()).toEqual(['position', 'section_id'])
    expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
    expect(await order((t) => t.section_id === 'doing')).toEqual(['d1', 't', 'd2'])
  })

  it('reorders subtasks within their parent and re-parents by drop', async () => {
    await seed([
      ...taskOps('parent', 1000), ...taskOps('other', 2000),
      ...taskOps('s1', 10, { parent_id: 'parent' }), ...taskOps('s2', 20, { parent_id: 'parent' }),
    ])
    expect(await moveTaskBy('s2', -1)).toBe(true)
    expect(await order((t) => t.parent_id === 'parent')).toEqual(['s2', 's1'])
    expect(await moveTask('s1', { parent_id: 'other', at: 'bottom' })).toBe(true)
    expect((await db.tasks.get('s1'))?.parent_id).toBe('other')
    // Never under itself or its own subtree.
    expect(await moveTask('parent', { parent_id: 's2', at: 'bottom' })).toBe(false)
    expect(await moveTask('parent', { parent_id: 'parent', at: 'bottom' })).toBe(false)
  })

  it('keyboard edges do nothing', async () => {
    await seed([...taskOps('a', 1000), ...taskOps('b', 2000)])
    expect(await moveTaskBy('a', -1)).toBe(false)
    expect(await moveTaskBy('b', 'bottom')).toBe(false)
    expect(await outbox()).toHaveLength(0)
    expect(await moveTaskBy('b', -1)).toBe(true)
    expect(await order()).toEqual(['b', 'a'])
  })

  it('viewers cannot reorder a shared project', async () => {
    await seed([...taskOps('a', 1000), ...taskOps('b', 2000)])
    const m: Membership = { projectId: 'p', scope: 'project:p', role: 'viewer', members: [] } as unknown as Membership
    await db.memberships.put(m)
    expect(await moveTaskBy('b', -1)).toBe(false)
    expect(await moveTask('b', { parent_id: null, at: 'top' })).toBe(false)
    expect(await outbox()).toHaveLength(0)
  })

  it('new tasks are appended after a task moved to the bottom', async () => {
    const now = Date.now()
    await seed([...taskOps('a', now + 50_000)])
    const id = await createTask({ title: 'new', project_id: 'p' })
    expect((await db.tasks.get(id))!.position).toBeGreaterThan(now + 50_000)
  })
})

describe('moving projects', () => {
  async function seedProjects() {
    await applyOps([
      ...seedOps('project', 'work', { name: 'Work', position: 1000, created_at: 1 }),
      ...seedOps('project', 'home', { name: 'Home', position: 2000, created_at: 1 }),
      ...seedOps('project', 'garden', { name: 'Garden', position: 3000, created_at: 1 }),
      ...seedOps('project', 'beds', { name: 'Beds', position: 10, parent_id: 'garden', created_at: 1 }),
    ])
  }
  const top = async () => (await db.projects.toArray()).filter((p) => !p.parent_id).sort(compareByPosition).map((p) => p.name)

  it('Alt+Down swaps with the next project of the same level', async () => {
    await seedProjects()
    expect(await moveProjectBy('home', 1)).toBe(true)
    expect(await top()).toEqual(['Work', 'Garden', 'Home'])
    expect(await outbox()).toHaveLength(1)
    expect(await moveProjectBy('beds', 1)).toBe(false) // only child: edge
  })

  it('drag re-parents and places in one batch, never under a descendant', async () => {
    await seedProjects()
    expect(await moveProjectTo('beds', { parent_id: null, at: { before: 'work' } })).toBe(true)
    expect(await top()).toEqual(['Beds', 'Work', 'Home', 'Garden'])
    expect(new Set((await outbox()).map((o) => o.ts)).size).toBe(1)
    await moveProjectTo('beds', { parent_id: 'garden', at: 'bottom' })
    expect(await moveProjectTo('garden', { parent_id: 'beds', at: 'bottom' })).toBe(false)
  })

  it('a shared project the user only edits tasks in cannot be moved', async () => {
    await seedProjects()
    await db.memberships.put({ projectId: 'home', scope: 'project:home', role: 'editor', members: [] } as unknown as Membership)
    expect(await moveProjectBy('home', -1)).toBe(false)
    expect(await moveProjectBy('work', 1)).toBe(true) // own project moves past it with one op
    expect((await outbox()).every((o) => o.entityId === 'work')).toBe(true)
  })
})

describe('convergence under concurrent reordering', () => {
  const base = [...seedOps('project', 'p', { name: 'P', position: 1, created_at: 1 }),
    // t1 and t2 share a position (concurrent inserts into one gap): the id breaks the tie.
    ...['t1', 't2', 't3', 't4', 't5'].flatMap((id, i) => taskOps(id, Math.max(1, i) * 1000))]

  /** Run `edit` on a fresh device holding `base`; returns the ops it queued. */
  async function onDevice(name: string, edit: () => Promise<unknown>): Promise<Op[]> {
    useDatabase(`${name}-${Date.now()}-${n++}`)
    resetDeviceId()
    await applyOps(base)
    await edit()
    return db.outbox.toArray()
  }

  /** Apply base + both op sets in every delivery order; every replica must agree. */
  async function converge(a: Op[], b: Op[]): Promise<string[]> {
    const results: string[][] = []
    for (const ops of [[...a, ...b], [...b, ...a], [...b].reverse().concat([...a].reverse())]) {
      useDatabase(`replica-${Date.now()}-${n++}`)
      await applyOps(base)
      for (const o of ops) await applyOps([o])
      results.push(await order())
    }
    for (const r of results) expect(r).toEqual(results[0])
    expect(new Set(results[0]).size).toBe(5)
    return results[0]
  }

  it('two devices move different tasks', async () => {
    const a = await onDevice('A', () => moveTask('t3', { parent_id: null, at: 'top' }))
    const b = await onDevice('B', () => moveTask('t2', { parent_id: null, at: 'bottom' }))
    expect(await converge(a, b)).toEqual(['t3', 't1', 't4', 't5', 't2'])
  })

  it('two devices move the same task: the greater timestamp wins', async () => {
    const a = await onDevice('A', () => moveTask('t3', { parent_id: null, at: 'top' }))
    const b = await onDevice('B', () => moveTask('t3', { parent_id: null, at: 'bottom' }))
    expect(b[0].ts).toBeGreaterThan(a[0].ts)
    expect(await converge(a, b)).toEqual(['t1', 't2', 't4', 't5', 't3'])
  })

  it('renumber concurrent with a move', async () => {
    // Device A drops t5 between t1 and t2, whose equal positions force a renumber; B moves t4 meanwhile.
    const a = await onDevice('A', () => moveTask('t5', { parent_id: null, at: { after: 't1' } }))
    expect(a.length).toBeGreaterThan(1)
    const b = await onDevice('B', () => moveTask('t4', { parent_id: null, at: 'top' }))
    // Same order on every replica, every task once (converge checks both). Intent may
    // interleave (design D4): A's renumber moved t1 below B's "top", so t4 is second.
    expect(await converge(a, b)).toEqual(['t1', 't4', 't5', 't2', 't3'])
  })
})
