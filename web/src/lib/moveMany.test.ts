// OpenSpec change drag-ticked-together (GitHub issue 1498): several ticked tasks
// dropped together among a list's rows, as one batch with one Undo.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, resetDeviceId } from './ops'
import { GAP, compareByPosition, planMoveMany } from './ordering'
import { planTasksMove } from './move'
import { moveTasksUndoable } from './undoActions'
import { undoBatch } from './undo'
import type { Op, Task } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`move-many-${Date.now()}-${n++}`)
  resetDeviceId()
})

const ops = (entity: 'task' | 'project', id: string, fields: Record<string, unknown>): Op[] =>
  Object.entries(fields).map(([field, value]) => ({ id: crypto.randomUUID(), entity, entityId: id, field, value, ts: 1, device: 'seed' }))

/** A project P with A–E at the top level; `subs` adds subtasks: [id, parent]. */
async function seed(subs: [string, string][] = []): Promise<void> {
  const all = [...ops('project', 'p', { name: 'P', position: 1, created_at: 1 })]
  ;['A', 'B', 'C', 'D', 'E'].forEach((id, i) => all.push(...ops('task', id, { title: id, project_id: 'p', position: (i + 1) * 1000, created_at: 1 })))
  subs.forEach(([id, parent], i) => all.push(...ops('task', id, { title: id, project_id: 'p', parent_id: parent, position: (i + 1) * 1000, created_at: 1 })))
  await applyOps(all)
}

/** The project as indented lines, in display order. */
async function tree(): Promise<string[]> {
  const all = (await db.tasks.toArray()).filter((t) => !t.deleted_at)
  const out: string[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const t of all.filter((x) => (x.parent_id ?? null) === parent).sort(compareByPosition)) {
      out.push('  '.repeat(depth) + t.id)
      walk(t.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

async function drop(ids: string[], target: Parameters<typeof planTasksMove>[1]): Promise<void> {
  const r = await moveTasksUndoable(ids, target)
  expect(r?.entry).toBeTruthy()
}

describe('planMoveMany', () => {
  it('puts the block between its neighbours, in order', () => {
    const list = [{ id: 'a', position: 1000 }, { id: 'b', position: 2000 }, { id: 'c', position: 3000 }, { id: 'd', position: 4000 }]
    const plan = planMoveMany(list, ['d', 'b'], { after: 'a' })!
    const pos = Object.fromEntries(plan.map((c) => [c.id, c.position]))
    expect(pos.d).toBeGreaterThan(1000)
    expect(pos.b).toBeGreaterThan(pos.d)
    expect(pos.b).toBeLessThan(3000)
    expect(plan.slice(0, 2).map((c) => c.id)).toEqual(['d', 'b'])
  })

  it('renumbers a window when the gap is too small, and refuses a moved anchor', () => {
    const list = [{ id: 'a', position: 1 }, { id: 'b', position: 1 }, { id: 'x', position: 5 }]
    const plan = planMoveMany(list, ['x'], { after: 'a' })!
    expect(plan.find((c) => c.id === 'x')).toBeTruthy()
    expect(planMoveMany(list, ['x', 'b'], { after: 'x' })).toBeNull()
    expect(planMoveMany([], ['x', 'y'], 'top', { fallback: 0 })).toEqual([{ id: 'x', position: 0 }, { id: 'y', position: GAP }])
  })
})

describe('several ticked tasks dropped together', () => {
  it('Reorder three at once: B and D above A; one Undo puts them back', async () => {
    await seed()
    const r = await moveTasksUndoable(['B', 'D'], { parent_id: null, at: { before: 'A' } })
    expect(await tree()).toEqual(['B', 'D', 'A', 'C', 'E'])
    expect(r?.label).toBe('2 tasks moved')
    await undoBatch(r!.entry!.id)
    expect(await tree()).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('Nest several under a task: C and E become A\'s last subtasks', async () => {
    await seed()
    await drop(['C', 'E'], { parent_id: 'A', at: 'bottom' })
    expect(await tree()).toEqual(['A', '  C', '  E', 'B', 'D'])
  })

  it('A parent carries its subtree', async () => {
    await seed([['B1', 'B'], ['B2', 'B']])
    await drop(['B', 'D'], { parent_id: null, at: { after: 'E' } })
    expect(await tree()).toEqual(['A', 'C', 'E', 'B', '  B1', '  B2', 'D'])
  })

  it('A ticked subtask pops out as a sibling right after its parent', async () => {
    await seed([['B1', 'B'], ['B2', 'B']])
    await drop(['B', 'B1'], { parent_id: null, at: { after: 'E' } })
    expect(await tree()).toEqual(['A', 'C', 'D', 'E', 'B', '  B2', 'B1'])
  })

  it('Dropped onto one of the ticked: they gather after the nearest task that stays', async () => {
    await seed()
    await drop(['B', 'C', 'E'], { parent_id: null, at: { after: 'C' } })
    expect(await tree()).toEqual(['A', 'B', 'C', 'E', 'D'])
  })

  it('Not into a carried subtree: a target under a moved task climbs out of it', async () => {
    await seed([['B1', 'B'], ['B2', 'B']])
    await drop(['B', 'D'], { parent_id: 'B1', at: 'bottom' })
    expect(await tree()).toEqual(['A', 'B', '  B1', '  B2', 'D', 'C', 'E'])
  })

  it('refuses tasks of several lists, a completed one, and writes one op per changed field', async () => {
    await seed()
    await applyOps([...ops('task', 'X', { title: 'X', project_id: null, position: 1, created_at: 1 })])
    expect(await planTasksMove(['A', 'X'], { parent_id: null, at: 'top' })).toBeNull()
    await applyOps([...ops('task', 'D', { completed_at: 5 })])
    expect(await planTasksMove(['A', 'D'], { parent_id: null, at: 'top' })).toBeNull()
    const before = await db.outbox.count()
    await drop(['B', 'C'], { parent_id: 'A', at: 'bottom' })
    const queued = (await db.outbox.toArray()).slice(before)
    expect(queued.map((o) => `${o.entityId}.${o.field}`).sort()).toEqual(['B.parent_id', 'B.position', 'C.parent_id', 'C.position'])
  })

  it('Offline: the list shows the move at once and the ops wait in the outbox', async () => {
    await seed()
    const before = await db.outbox.count()
    await drop(['E', 'D'], { parent_id: null, at: 'top' })
    expect(await tree()).toEqual(['E', 'D', 'A', 'B', 'C'])
    expect(await db.outbox.count()).toBe(before + 2)
    const rows = (await db.tasks.toArray()) as Task[]
    expect(rows.find((t) => t.id === 'E')?.position).toBeLessThan(rows.find((t) => t.id === 'D')!.position)
  })
})
