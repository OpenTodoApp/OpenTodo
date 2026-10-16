// The weekly review (OpenSpec change stats-and-review, tasks 1.4 and 3.1): the
// synced `review` row and every scenario of `weekly-review` "Review steps" and
// "Projects without a next action".
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, resetDeviceId } from './ops'
import { finishReview, firstUnfinished, reviewDue, reviewSteps } from './review'
import type { Membership, Project, Task } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`review-${Date.now()}-${n++}`)
  resetDeviceId()
})

describe('review entity (design D4)', () => {
  it('applies a remote op and reads it back', async () => {
    await applyOps([{ id: 'r1', entity: 'review', entityId: 'me', field: 'completed_at', value: 1234, ts: 10, device: 'laptop' }])
    expect((await db.review.get('me'))?.completed_at).toBe(1234)
  })

  it('finishing offline applies at once and waits in the outbox', async () => {
    await finishReview(5000)
    expect((await db.review.get('me'))?.completed_at).toBe(5000)
    const queued = (await db.outbox.toArray()).map(({ entity, entityId, field, value }) => ({ entity, entityId, field, value }))
    expect(queued).toEqual([{ entity: 'review', entityId: 'me', field: 'completed_at', value: 5000 }])
  })

  it('two finishes converge on the later one', async () => {
    await applyOps([
      { id: 'b', entity: 'review', entityId: 'me', field: 'completed_at', value: 2000, ts: 20, device: 'phone' },
      { id: 'a', entity: 'review', entityId: 'me', field: 'completed_at', value: 1000, ts: 10, device: 'laptop' },
    ])
    expect((await db.review.get('me'))?.completed_at).toBe(2000)
  })

  it('is due after seven days or when never finished', () => {
    const now = Date.UTC(2026, 9, 14)
    expect(reviewDue(0, now)).toBe(true)
    expect(reviewDue(now - 9 * 86_400_000, now)).toBe(true)
    expect(reviewDue(now - 2 * 86_400_000, now)).toBe(false)
  })
})

const TODAY = '2026-10-14'
function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [],
    position: 0, created_at: 1, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null,
    series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...extra,
  }
}
const project = (id: string, name = id, extra: Partial<Project> = {}): Project =>
  ({ id, name, color: '', position: 0, archived: false, parent_id: null, created_at: 1, deleted_at: null, _clock: {}, ...extra })
const steps = (tasks: Task[], projects: Project[] = [], memberships: Membership[] = []) =>
  reviewSteps({ tasks, projects, memberships: new Map(memberships.map((m) => [m.projectId, m])), me: 'me', today: TODAY, completedThisWeek: 0 })

describe('review steps', () => {
  it('Get clear lists the Inbox and is done once it is empty', () => {
    const inbox = [task('a', { position: 2 }), task('b', { position: 1 }), task('c', { position: 3 })]
    const s = steps(inbox)
    expect(s.inbox.map((t) => t.id)).toEqual(['b', 'a', 'c'])
    expect([s.left.clear, s.done.clear]).toEqual([3, false])
    const after = steps([{ ...inbox[0], project_id: 'p' }, { ...inbox[1], completed_at: 5 }, { ...inbox[2], deleted_at: 5 }], [project('p')])
    expect(after.done.clear).toBe(true)
  })

  it('Look back shows the overdue tasks; a completion or a new date removes them', () => {
    const a = task('a', { project_id: 'p', due: { date: '2026-10-10' } })
    const b = task('b', { project_id: 'p', due: { date: '2026-10-12' } })
    const s = steps([a, b], [project('p')])
    expect(s.overdue.map((t) => t.id)).toEqual(['a', 'b'])
    expect(s.done.back).toBe(false)
    expect(steps([{ ...a, completed_at: 5 }, { ...b, due: { date: '2026-10-20' } }], [project('p')]).done.back).toBe(true)
  })

  it('Next actions lists a project with only completed tasks, not one with an open task', () => {
    const s = steps([task('g1', { project_id: 'garage', completed_at: 5 }), task('t1', { project_id: 'taxes' })], [project('garage', 'Garage'), project('taxes', 'Taxes')])
    expect(s.nextActions.map((n) => [n.project.name, n.canArchive])).toEqual([['Garage', true]])
    // A new task in Garage removes it.
    expect(steps([task('g1', { project_id: 'garage', completed_at: 5 }), task('g2', { project_id: 'garage' })], [project('garage', 'Garage')]).done.next).toBe(true)
  })

  it('a viewer’s shared project is not listed; an editor’s is, without Archive; archived and trashed projects are not', () => {
    const member = (projectId: string, role: Membership['role']): Membership => ({ projectId, role, ownerId: 'ana', members: [] })
    const s = steps([], [project('v'), project('e'), project('old', 'old', { archived: true }), project('gone', 'gone', { deleted_at: 1 })], [member('v', 'viewer'), member('e', 'editor')])
    expect(s.nextActions.map((n) => [n.project.id, n.canArchive])).toEqual([['e', false]])
  })

  it('Look ahead lists the next seven days and is always done', () => {
    const s = steps([task('today', { due: { date: TODAY } }), task('in6', { due: { date: '2026-10-20' } }), task('in7', { due: { date: '2026-10-21' } })])
    expect(s.ahead.map((t) => t.id)).toEqual(['today', 'in6'])
    expect(s.done.ahead).toBe(true)
  })

  it('opens on the first step that is not done', () => {
    expect(firstUnfinished({ clear: true, back: false, next: false, ahead: true })).toBe('back')
    expect(firstUnfinished({ clear: true, back: true, next: true, ahead: true })).toBe('ahead')
  })
})
