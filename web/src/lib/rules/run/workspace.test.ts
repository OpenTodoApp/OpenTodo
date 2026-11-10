// A routine of one workspace on the device (routine-conditions D1), as
// internal/rules/workspace.go plans it on the server: the world holds that
// workspace's rows only, a move into another workspace's project fails, and
// what it creates without a project lands in its Inbox.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { planRoutine, type Row, type RunWorld } from '.'
import { inWorkspace } from './load'
import type { RoutineStep } from '../../types'

const PERSONAL = { id: 'ws-personal', name: 'Personal', default: true }
const WORK = { id: 'ws-work', name: 'Work', default: false }

const task = (id: string, more: Row = {}): Row => ({ id, title: id, labels: [], priority: 4, project_id: null, parent_id: null, due: null, completed_at: null, deleted_at: null, position: 1, ...more })

function world(): RunWorld {
  return {
    userId: 'alice', today: '2026-10-21', now: Date.UTC(2026, 9, 21, 12), weekStart: 1, offset: 0, dayStart: '', labels: [], views: [], timeEntries: [],
    memberships: new Map(), encrypted: true,
    projects: [{ id: 'site', name: 'Website', workspace_id: WORK.id, parent_id: null, deleted_at: null }, { id: 'home', name: 'Home', workspace_id: null, parent_id: null, deleted_at: null }],
    sections: [{ id: 's1', project_id: 'site', name: 'Doing', deleted_at: null }, { id: 's2', project_id: 'home', name: 'Later', deleted_at: null }],
    tasks: [task('w1', { project_id: 'site', priority: 1 }), task('w2', { workspace_id: WORK.id }), task('p1', { project_id: 'home', priority: 1 }), task('p2')],
  }
}

const rule = (steps: unknown[]) => ({ id: 'r1', name: 'Routine', steps: steps as RoutineStep[], trigger: { kind: 'manual' } })

describe('a routine of one workspace on the device', () => {
  it('reads only that workspace', () => {
    const w = inWorkspace(world(), WORK.id, [PERSONAL, WORK])!
    expect(w.tasks.map((t) => t.id)).toEqual(['w1', 'w2'])
    expect(w.projects.map((p) => p.id)).toEqual(['site'])
    expect(w.sections.map((s) => s.id)).toEqual(['s1'])
    expect([...w.elsewhere!]).toEqual(['home'])
    expect(inWorkspace(world(), PERSONAL.id, [PERSONAL, WORK])!.tasks.map((t) => t.id)).toEqual(['p1', 'p2'])
    expect(inWorkspace(world(), 'gone', [PERSONAL, WORK])).toBeNull()
  })

  it('finds only its tasks and creates in its Inbox', async () => {
    const w = inWorkspace(world(), WORK.id, [PERSONAL, WORK])!
    const plan = await planRoutine(w, rule([
      { id: 'a', kind: 'find_tasks', in: { condition: { literal: { priority: { not_in: [2, 3, 4] } } } } },
      { id: 'b', kind: 'create_tasks', in: { title: { literal: 'Follow up' } } },
    ]), { key: 'manual:run-1', runId: 'run-1' })
    expect(plan.records[0].ids).toEqual(['w1'])
    expect(plan.changes.find((c) => c.create)?.patch.workspace_id).toBe(WORK.id)
  })

  it('refuses a move into another workspace’s project', async () => {
    const w = inWorkspace(world(), WORK.id, [PERSONAL, WORK])!
    const plan = await planRoutine(w, rule([
      { id: 'a', kind: 'change_tasks', in: { tasks: { literal: { task: 'w2' } }, set: { literal: { section: { project_id: 'home', section_id: null } } } } },
    ]), { key: 'manual:run-2', runId: 'run-2' })
    expect(plan.outcome).toBe('failed')
    expect(plan.records[0].error).toBe('other_workspace')
  })
})
