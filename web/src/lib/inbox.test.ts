import { describe, expect, it } from 'vitest'
import vectors from './inbox.vectors.json'
import { inboxTasks, isInboxTask, isPlannedWithoutProject, type InboxFields } from './inbox'
import type { Due } from './types'

type VTask = { project_id: string | null; due: Due | null; start: string | null; completed_at: number | null; deleted_at: number | null }
type Vector = { name: string; task: VTask; parents?: VTask[]; parent_missing?: boolean; inbox: boolean }

/** The vector's task with its parents chained as p0 (nearest), p1, …; a missing parent is p0 with no entry. */
function chain(v: Vector): { task: InboxFields; parentOf: (id: string) => InboxFields | undefined } {
  const parents = (v.parents ?? []).map((p, i) => ({ ...p, parent_id: i + 1 < (v.parents ?? []).length ? `p${i + 1}` : null }))
  const byId = new Map(parents.map((p, i) => [`p${i}`, p]))
  const hasParent = parents.length > 0 || !!v.parent_missing
  return { task: { ...v.task, parent_id: hasParent ? 'p0' : null }, parentOf: (id) => byId.get(id) }
}

describe('Inbox membership (shared vectors with internal/inbox)', () => {
  for (const v of vectors as Vector[]) {
    it(v.name, () => {
      const { task, parentOf } = chain(v)
      expect(isInboxTask(task, parentOf)).toBe(v.inbox)
    })
  }

  it('lists a scheduled parent out of the Inbox together with its unscheduled subtasks', () => {
    const base = { project_id: null, due: null, start: null, completed_at: null, deleted_at: null }
    const tasks = [
      { ...base, id: 'parent', parent_id: null, due: { date: '2026-10-23' } },
      { ...base, id: 'child', parent_id: 'parent' },
      { ...base, id: 'loose', parent_id: null },
      { ...base, id: 'loose-child', parent_id: 'loose' },
    ]
    expect(inboxTasks(tasks).map((t) => t.id)).toEqual(['loose', 'loose-child'])
  })

  it('stops at a cycle in synced parents', () => {
    const base = { project_id: null, due: null, start: null, completed_at: null, deleted_at: null }
    const tasks = [{ ...base, id: 'a', parent_id: 'b' }, { ...base, id: 'b', parent_id: 'a' }]
    expect(inboxTasks(tasks).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('the planned line counts open, live, project-less scheduled tasks only', () => {
    const base = { project_id: null, due: null, start: null, completed_at: null, deleted_at: null }
    expect(isPlannedWithoutProject({ ...base, due: { date: '2026-10-23' } })).toBe(true)
    expect(isPlannedWithoutProject({ ...base, start: 'someday' })).toBe(true)
    expect(isPlannedWithoutProject(base)).toBe(false)
    expect(isPlannedWithoutProject({ ...base, project_id: 'p', due: { date: '2026-10-23' } })).toBe(false)
    expect(isPlannedWithoutProject({ ...base, due: { date: '2026-10-23' }, completed_at: 1 })).toBe(false)
  })
})
