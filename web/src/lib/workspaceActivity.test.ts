// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from './db'
import { applyOps, resetDeviceId } from './ops'
import { setCurrentUserId } from './sharing'
import type { ActivityEvent, Op, Workspace } from './types'
import { filterWorkspace, localWorkspaceEvents, NO_FILTER, rangeOf, readFilter, writeFilter } from './workspaceActivity'
import type { WorkspaceState } from './workspaces'

let n = 0
let seq = 0
beforeEach(async () => {
  useDatabase(`workspace-activity-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId('alice')
})

const state: WorkspaceState = {
  current: 'work', defaultId: 'personal',
  list: [{ id: 'personal', default: true, name: 'Personal' }, { id: 'work', default: false, name: 'Work' }] as Workspace[],
}

const op = (entity: Op['entity'], entityId: string, field: string, value: unknown, ts: number, actor = 'alice'): Op =>
  ({ id: `o-${seq++}`, entity, entityId, field, value, ts, device: actor, actor })

const project = (id: string, workspace: string, ts: number) =>
  [op('project', id, 'name', id, ts), op('project', id, 'workspace_id', workspace, ts), op('project', id, 'created_at', ts, ts)]

const task = (id: string, where: { project?: string; workspace?: string }, ts: number, actor = 'alice') => [
  op('task', id, 'title', id, ts, actor),
  ...(where.project ? [op('task', id, 'project_id', where.project, ts, actor)] : []),
  ...(where.workspace ? [op('task', id, 'workspace_id', where.workspace, ts, actor)] : []),
  op('task', id, 'created_at', ts, ts, actor),
]

const ev = (id: string, kind: ActivityEvent['kind'], ts: number, extra: Partial<ActivityEvent> = {}): ActivityEvent =>
  ({ id, kind, actor: 'bob', entity: 'task', entityId: id, ts, opIds: [id], changes: [], ...extra })

describe('workspace activity', () => {
  it('lists the projects and the Inbox of the workspace, and only those', async () => {
    await applyOps([
      ...project('planning', 'work', 1000), ...project('home', 'personal', 1000),
      ...task('plan', { project: 'planning' }, 2000), ...task('idea', { workspace: 'work' }, 3000),
      ...task('milk', { project: 'home' }, 4000), ...task('stray', {}, 5000),
      // Time tracked on the plan: one event, no note.
      op('time_entry', 'e1', 'task_id', 'plan', 6000), op('time_entry', 'e1', 'started_at', 6000, 6000),
      op('time_entry', 'e1', 'ended_at', 6000 + 42 * 60_000, 6000), op('time_entry', 'e1', 'note', 'secret', 6000),
      op('time_entry', 'e1', 'created_at', 6000, 6000),
    ])
    const events = await localWorkspaceEvents('work', state)
    expect(events.map((e) => e.taskId ?? e.entityId)).toEqual(['plan', 'idea', 'plan', 'planning'])
    expect(events[0]).toMatchObject({ kind: 'time_tracked', minutes: 42, projectId: 'planning' })
    expect(JSON.stringify(events)).not.toContain('secret')
    expect(events[1].projectId).toBeUndefined()
    const personal = await localWorkspaceEvents('personal', state)
    expect(personal.map((e) => e.taskId ?? e.entityId)).toEqual(['stray', 'milk', 'home'])
  })

  it('filters by days, several kinds, project and person', () => {
    const day = (d: number, h: number) => new Date(2026, 10, d, h).getTime()
    const events = [
      ev('a', 'completed', day(16, 23), { projectId: 'p1' }), ev('b', 'commented', day(12, 9), { projectId: 'p2' }),
      ev('c', 'rescheduled', day(10, 0)), ev('d', 'time_tracked', day(9, 23), { projectId: 'p1', actor: 'alice' }),
    ]
    const ids = (f: Partial<typeof NO_FILTER>) => filterWorkspace(events, { ...NO_FILTER, ...f }).map((e) => e.id)
    expect(ids({})).toEqual(['a', 'b', 'c', 'd'])
    expect(ids({ from: '2026-11-10', to: '2026-11-16' })).toEqual(['a', 'b', 'c'])
    expect(ids({ kinds: ['completed', 'commented'] })).toEqual(['a', 'b'])
    expect(ids({ kinds: ['commented', 'completed', 'rescheduled', 'time'] })).toEqual(['a', 'b', 'c', 'd'])
    expect(ids({ project: 'p1' })).toEqual(['a', 'd'])
    expect(ids({ project: 'inbox' })).toEqual(['c'])
    expect(ids({ actor: 'alice' })).toEqual(['d'])
    expect(rangeOf({ from: '2026-11-10', to: '2026-11-10' })).toEqual({ from: day(10, 0), to: day(11, 0) - 1 })
  })

  it('remembers the filters per workspace on this device', () => {
    expect(readFilter('work')).toEqual(NO_FILTER)
    writeFilter('work', { ...NO_FILTER, from: '2026-11-10', to: '2026-11-16', kinds: ['completed', 'commented'] })
    expect(readFilter('work')).toEqual({ ...NO_FILTER, from: '2026-11-10', to: '2026-11-16', kinds: ['completed', 'commented'] })
    expect(readFilter('personal')).toEqual(NO_FILTER)
    // Unknown kinds and malformed days are dropped.
    writeFilter('odd', { ...NO_FILTER, from: 'yesterday', kinds: ['finished' as never, 'time'] })
    expect(readFilter('odd')).toEqual({ ...NO_FILTER, kinds: ['time'] })
  })
})
