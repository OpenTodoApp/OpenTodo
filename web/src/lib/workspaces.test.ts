// Workspace partition and directory cache (OpenSpec change workspaces, tasks 1.6 and 5.2).
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import fixture from '../../../internal/sync/testdata/workspaces_fixture.json'
import { db, useDatabase } from './db'
import { applyOps } from './ops'
import { currentWorkspaceId, Partition, resolveCurrent, storeWorkspaces, switchTo, workspaceIdFor, workspaceOf, type PartitionedKind } from './workspaces'
import type { Workspace, WorkspaceEntry } from './types'

describe('the shared partition fixture', () => {
  it('places every entity where the server does', () => {
    const p = new Partition(fixture.default, fixture.workspaces, fixture.projects, fixture.tasks)
    const got: Record<string, string> = {}
    const kinds: [PartitionedKind, { id: string; workspace_id?: string | null }[]][] = [
      ['project', fixture.projects], ['task', fixture.tasks], ['label', fixture.labels], ['view', fixture.views],
    ]
    for (const [kind, list] of kinds) for (const e of list) got[`${kind}:${e.id}`] = workspaceOf(kind, e, p)
    expect(got).toEqual(fixture.expected)
  })
})

const ws = (id: string, extra: Partial<Workspace> = {}): Workspace => ({ id, name: id, icon: '', color: '', default: false, role: 'owner', ownerId: 'me', ...extra })

describe('current workspace', () => {
  it('falls back to the default when the stored one is gone', () => {
    const list = [ws('w-p', { default: true }), ws('w-work')]
    expect(resolveCurrent('w-work', list)).toBe('w-work')
    expect(resolveCurrent('w-gone', list)).toBe('w-p')
    expect(resolveCurrent('', [])).toBe('')
  })

  it('writes null for the default workspace and the id otherwise', () => {
    const list = [ws('w-p', { default: true }), ws('w-work')]
    expect(workspaceIdFor('w-p', list)).toBeNull()
    expect(workspaceIdFor('', list)).toBeNull()
    expect(workspaceIdFor('w-work', list)).toBe('w-work')
  })
})

describe('directory cache', () => {
  afterEach(async () => {
    await db.delete()
  })

  it('replaces the cache with every response and reports the workspaces that left', async () => {
    useDatabase(`ws-${Math.random()}`)
    const entry = (id: string, isDefault = false): WorkspaceEntry => ({
      ...ws(id, { default: isDefault }), members: [{ userId: 'me', name: 'Me', role: 'owner' }, { userId: 'bob', name: 'Bob', role: 'member' }],
      groups: [{ id: `${id}-g`, name: 'Adults', members: ['bob'] }],
    })
    expect(await storeWorkspaces([entry('w-p', true), entry('w-fam')])).toEqual([])
    expect(await db.workspaces.count()).toBe(2)
    expect(await db.workspaceMembers.where('workspaceId').equals('w-fam').count()).toBe(2)
    expect((await db.groups.get('w-fam-g'))?.members).toEqual(['bob'])
    await switchTo('w-fam')
    expect(await currentWorkspaceId()).toBe('w-fam')
    expect(await storeWorkspaces([entry('w-p', true)])).toEqual(['w-fam'])
    expect(await db.workspaceMembers.where('workspaceId').equals('w-fam').count()).toBe(0)
    expect(await currentWorkspaceId()).toBe('w-p')
  })

  it('upgrades a v23 database without touching its rows', async () => {
    const name = `ws-upgrade-${Math.random()}`
    const old = new Dexie(name)
    old.version(23).stores({ projects: 'id, position', tasks: 'id, project_id', labels: 'id, position', views: 'id, position', rules: 'id, position' })
    await old.open()
    await old.table('projects').put({ id: 'p1', name: 'Home', position: 1 })
    await old.table('tasks').put({ id: 't1', title: 'Milk', project_id: null })
    old.close()
    const d = useDatabase(name)
    await d.open()
    expect(d.verno).toBe(24)
    expect(await d.projects.get('p1')).toMatchObject({ name: 'Home' })
    expect(await d.tasks.where('workspace_id').equals('x').count()).toBe(0)
    expect(await d.workspaces.count()).toBe(0)
    await d.delete()
  })
})

describe('random histories converge (task 1.7)', () => {
  it('workspace_id on the four entities converges whatever the order', async () => {
    let state = 7
    const rand = (n: number) => {
      state = (state * 1103515245 + 12345) % 2 ** 31
      return state % n
    }
    const kinds = ['project', 'label', 'view', 'task'] as const
    const values = [null, 'w-work', 'w-family']
    for (let round = 0; round < 5; round++) {
      const ops = Array.from({ length: 40 }, (_, i) => ({
        id: `r${round}-${i}`, entity: kinds[rand(4)], entityId: `e${rand(3)}`, field: 'workspace_id',
        // A device never writes two values at one timestamp, so (ts, device) is unique.
        value: values[rand(3)], ts: 1000 + rand(20) * 100 + i, device: `d${rand(3)}`,
      }))
      const results: string[] = []
      for (const order of [ops, [...ops].reverse(), [...ops].sort(() => rand(3) - 1)]) {
        const d = useDatabase(`ws-conv-${round}-${results.length}-${Math.random()}`)
        for (const op of order) await applyOps([op as never])
        const rows = await Promise.all([d.projects.toArray(), d.labels.toArray(), d.views.toArray(), d.tasks.toArray()])
        results.push(JSON.stringify(rows.map((list) => list.map((r) => [r.id, r.workspace_id ?? null]).sort())))
        await d.delete()
      }
      expect(new Set(results).size).toBe(1)
    }
  })
})
