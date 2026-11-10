// Task progress (OpenSpec change task-progress, tasks 2.1 and 2.2): a parent's share
// from its direct subtasks and a project's from its tasks, the rule the All projects
// table already uses, worked out once per snapshot and patched per write.
import { describe, expect, it } from 'vitest'
import { percentOf, progressPart, projectProgressOf, shareOf } from './progress'
import { summarizeProjects } from './projectHealth'
import { patchProgress, progressMap, progressOf } from './subtasks'
import { noteChanges, type TaskChange } from './taskDelta'
import type { Project, Task } from './types'

const NOW = Date.UTC(2026, 10, 10, 12)

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: 'p', parent_id: null, priority: 4, due: null, labels: [],
    position: 0, created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null,
    series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...extra,
  }
}
const done = (id: string, extra: Partial<Task> = {}) => task(id, { completed_at: NOW, ...extra })
const project = (id: string, extra: Partial<Project> = {}): Project =>
  ({ id, name: id, color: 'grey', position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {}, ...extra })

describe('subtask progress', () => {
  // "Plan trip" with four direct subtasks, one of them with a subtask of its own.
  const trip = task('trip')
  const kids = [done('flights', { parent_id: 'trip' }), task('hotel', { parent_id: 'trip' }), task('visa', { parent_id: 'trip' }), done('bags', { parent_id: 'trip' })]
  const deeper = [done('compare', { parent_id: 'hotel' }), done('book', { parent_id: 'hotel' })]

  it('counts the direct subtasks only, as the count beside the title always has', () => {
    const all = [trip, ...kids, ...deeper]
    expect(progressOf(trip, all)).toEqual({ done: 2, total: 4 })
    expect(progressMap(all).get('trip')).toEqual({ done: 2, total: 4 })
    // The subtask with subtasks has its own share; it adds nothing more to its parent.
    expect(progressMap(all).get('hotel')).toEqual({ done: 2, total: 2 })
    expect(shareOf(progressMap(all).get('trip'))).toBe(0.5)
  })

  it('leaves out a deleted subtask', () => {
    const all = [trip, ...kids, done('old', { parent_id: 'trip', deleted_at: NOW })]
    expect(progressMap(all).get('trip')).toEqual({ done: 2, total: 4 })
  })

  it('keeps counting under a completed parent', () => {
    const all = [done('trip'), ...kids]
    expect(progressMap(all).get('trip')).toEqual({ done: 2, total: 4 })
  })

  it('has no share without subtasks', () => {
    expect(progressMap([trip]).get('trip')).toBeUndefined()
    expect(shareOf(undefined)).toBeNull()
    expect(shareOf({ done: 0, total: 0 })).toBeNull()
  })

  it('updates the share from the changed rows', () => {
    const before = [trip, ...kids]
    const prev = progressMap(before)
    const visa = kids[2]
    const changes: TaskChange[] = [{ id: 'visa', before: visa, after: { ...visa, completed_at: NOW } }]
    expect(patchProgress(prev, changes).get('trip')).toEqual({ done: 3, total: 4 })
    expect(percentOf(shareOf(patchProgress(prev, changes).get('trip'))!)).toBe(75)
  })
})

describe('project progress', () => {
  it('counts completed over completed and open tasks, every level of subtask included', () => {
    const tasks = [task('a'), done('b'), task('c', { parent_id: 'a' }), done('d', { parent_id: 'c' })]
    expect(projectProgressOf(tasks).get('p')).toEqual({ done: 2, total: 4 })
  })

  it('leaves out deleted, skipped and sample tasks, and counts a recurring series once', () => {
    const tasks = [
      task('open'), done('closed'),
      done('trashed', { deleted_at: NOW }), task('sample', { sample: true }), done('skipped', { skipped: true }),
      task('daily', { series_id: 's', recurrence: 'FREQ=DAILY' }), done('daily-1', { series_id: 's' }), done('daily-2', { series_id: 's' }),
    ]
    expect(tasks.map(progressPart)).toEqual(['open', 'done', null, null, null, 'open', null, null])
    expect(projectProgressOf(tasks).get('p')).toEqual({ done: 1, total: 3 })
  })

  it('is the All projects table\'s progress for the project\'s own tasks', () => {
    const tasks = [task('a'), done('b'), done('c'), task('d', { series_id: 's' }), done('e', { series_id: 's' }), task('f', { sample: true }), task('x', { project_id: 'q' })]
    const projects = [project('p'), project('q')]
    const table = summarizeProjects({ projects, tasks, today: '2026-11-10', now: NOW, rollUp: () => false })
    for (const id of ['p', 'q']) expect(shareOf(projectProgressOf(tasks).get(id))).toBe(table.get(id)!.progress)
  })

  it('has no entry for a project without a counted task, or for an Inbox task', () => {
    const tasks = [task('inbox', { project_id: null }), task('s', { project_id: 'empty', sample: true })]
    expect([...projectProgressOf(tasks).keys()]).toEqual([])
  })

  it('patches the project figures from a write the way working them out in full does', () => {
    const before = [task('a'), task('b'), done('c'), task('m', { project_id: 'q' })]
    const first = projectProgressOf(before)
    expect(first.get('p')).toEqual({ done: 1, total: 3 })
    // Complete a, move b to q, trash c.
    const after = [done('a'), task('b', { project_id: 'q' }), done('c', { deleted_at: NOW }), before[3]]
    noteChanges(before, after, before.map((b, i) => ({ id: b.id, before: b, after: after[i] })).slice(0, 3))
    const patched = projectProgressOf(after)
    expect(patched).not.toBe(first)
    expect([...patched.entries()].sort()).toEqual([...projectProgressOf([...after]).entries()].sort())
    expect(patched.get('p')).toEqual({ done: 1, total: 1 })
    expect(patched.get('q')).toEqual({ done: 0, total: 2 })
  })
})
