// OpenSpec change sort-projects-by-name (GitHub issue 1956): sort a project's
// sub-projects, or the top-level projects, by name once, with Undo; and moves step
// only over the projects of the current workspace.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, setMeta, useDatabase } from './db'
import { applyOps, resetDeviceId } from './ops'
import { compareByPosition, planSortByName } from './ordering'
import { moveProjectBy } from './move'
import { sortProjectsUndoable } from './undoActions'
import { topUndo, undoBatch } from './undo'
import { CURRENT_WORKSPACE_KEY } from './workspaces'
import type { Membership, Op, Workspace } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`project-sort-${Date.now()}-${n++}`)
  resetDeviceId()
})

const project = (id: string, fields: Record<string, unknown>): Op[] =>
  Object.entries({ name: id, created_at: 1, ...fields }).map(([field, value]) => ({ id: crypto.randomUUID(), entity: 'project', entityId: id, field, value, ts: 1, device: 'seed' }))

const names = async (parent: string | null) =>
  (await db.projects.toArray()).filter((p) => (p.parent_id ?? null) === parent).sort(compareByPosition).map((p) => p.name)

describe('planSortByName', () => {
  const row = (id: string, name: string, position: number) => ({ id, name, position })

  it('sorts A to Z with numbers by value, ignoring case', () => {
    const list = [row('a', '0010 Lee', 1000), row('b', 'beta', 2000), row('c', '0002 Kim', 3000), row('d', '10', 4000), row('e', 'Alpha', 5000), row('f', '2', 6000)]
    const plan = planSortByName(list, { locale: 'en' })
    const at = new Map(list.map((r) => [r.id, plan.find((c) => c.id === r.id)?.position ?? r.position]))
    expect([...list].sort((x, y) => at.get(x.id)! - at.get(y.id)!).map((r) => r.name)).toEqual(['2', '0002 Kim', '10', '0010 Lee', 'Alpha', 'beta'])
    // The places are the ones the list held: no new numbers.
    expect(new Set(plan.map((c) => c.position))).toEqual(new Set(plan.map((c) => c.position).filter((p) => list.some((r) => r.position === p))))
  })

  it('writes nothing for a sorted list, and keeps a project the user may not move in its place', () => {
    expect(planSortByName([row('a', 'A', 1), row('b', 'B', 2)])).toEqual([])
    const plan = planSortByName([row('c', 'C', 1), row('x', 'Shared', 2), row('a', 'A', 3)], { writable: (r) => r.id !== 'x' })
    expect(plan).toEqual([{ id: 'a', position: 1 }, { id: 'c', position: 3 }])
  })

  it('renumbers when positions are equal', () => {
    const plan = planSortByName([row('b', 'B', 5), row('a', 'A', 5)])
    expect(plan).toEqual([{ id: 'b', position: 1005 }])
  })
})

describe('sortProjectsUndoable', () => {
  it('sorts only the sub-projects, as one batch of position ops, and Undo restores the order', async () => {
    await applyOps([
      ...project('clients', { name: 'Clients', position: 1 }),
      ...project('zeta', { name: 'Zeta', position: 2 }),
      ...project('c10', { name: '0010 Lee', parent_id: 'clients', position: 1000 }),
      ...project('c2', { name: '0002 Kim', parent_id: 'clients', position: 2000 }),
      ...project('c1', { name: '0001 Ito', parent_id: 'clients', position: 3000 }),
    ])
    const r = await sortProjectsUndoable('clients', 'en')
    expect(r.label).toBe('Sorted by name')
    expect(await names('clients')).toEqual(['0001 Ito', '0002 Kim', '0010 Lee'])
    expect(await names(null)).toEqual(['Clients', 'Zeta'])
    const ops = await db.outbox.toArray()
    expect(ops.every((o) => o.field === 'position' && ['c10', 'c1'].includes(o.entityId))).toBe(true)
    expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
    expect((await sortProjectsUndoable('clients', 'en')).entry).toBeNull()
    await undoBatch(topUndo(await db.assistantUndo.toArray())!.id)
    expect(await names('clients')).toEqual(['0010 Lee', '0002 Kim', '0001 Ito'])
  })

  it('sorts the top level, leaving a shared project the user may not move in its place', async () => {
    await applyOps([...project('w', { name: 'Work', position: 1 }), ...project('s', { name: 'Shared', position: 2 }), ...project('h', { name: 'Home', position: 3 })])
    await db.memberships.put({ projectId: 's', scope: 'project:s', role: 'editor', members: [] } as unknown as Membership)
    await sortProjectsUndoable(null, 'en')
    expect(await names(null)).toEqual(['Home', 'Shared', 'Work'])
    expect((await db.outbox.toArray()).some((o) => o.entityId === 's')).toBe(false)
  })
})

describe('moves within the current workspace', () => {
  it('Move down steps over no project of another workspace', async () => {
    const ws = (id: string, isDefault: boolean): Workspace => ({ id, name: id, icon: '', color: '', default: isDefault, role: 'owner', ownerId: 'me' })
    await db.workspaces.bulkPut([ws('personal', true), ws('family', false)])
    await setMeta(CURRENT_WORKSPACE_KEY, 'personal')
    await applyOps([
      ...project('a', { name: 'A', position: 1000 }),
      ...project('f', { name: 'Family', position: 2000, workspace_id: 'family' }),
      ...project('b', { name: 'B', position: 3000 }),
    ])
    expect(await moveProjectBy('a', 1)).toBe(true)
    const here = (await db.projects.toArray()).filter((p) => p.id !== 'f').sort(compareByPosition).map((p) => p.name)
    expect(here).toEqual(['B', 'A'])
    expect(await moveProjectBy('a', 1)).toBe(false) // already last in this workspace
  })
})
