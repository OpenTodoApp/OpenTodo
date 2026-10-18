// The reviews (OpenSpec changes stats-and-review 1.4, 3.1 and open-loops-method
// 5.2): the synced `review` row, every scenario of `weekly-review` "Review steps",
// the project walk, the rhythms and today's focus.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, resetDeviceId } from './ops'
import { areasOf, dailyDue, finishDailyCheck, finishReview, firstUnfinished, focusTasks, markProjectReviewed, monthlyDue, reviewDue, reviewSteps, toggleFocus, walkProjects, type ReviewInput } from './review'
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
const NOW = Date.UTC(2026, 9, 14, 12)
const DAY = 86_400_000
const inputOf = (tasks: Task[], projects: Project[] = [], memberships: Membership[] = [], reviewedAt: [string, number][] = []): ReviewInput =>
  ({ tasks, projects, memberships: new Map(memberships.map((m) => [m.projectId, m])), me: 'me', today: TODAY, completedThisWeek: 0, reviewedAt: new Map(reviewedAt), now: NOW })
const steps = (tasks: Task[], projects: Project[] = [], memberships: Membership[] = [], reviewedAt: [string, number][] = []) => reviewSteps(inputOf(tasks, projects, memberships, reviewedAt))

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

  it('Projects: the walk holds every project the user can edit, never reviewed first; done once each was reviewed this week and has a next action', () => {
    const member = (projectId: string, role: Membership['role']): Membership => ({ projectId, role, ownerId: 'ana', members: [] })
    const projects = [project('garage', 'Garage', { position: 1 }), project('taxes', 'Taxes', { position: 2 }), project('v', 'Viewed'), project('e', 'Edited', { position: 3 }), project('old', 'old', { archived: true })]
    const tasks = [task('g1', { project_id: 'garage', completed_at: 5 }), task('t1', { project_id: 'taxes' }), task('e1', { project_id: 'e' })]
    const s = steps(tasks, projects, [member('v', 'viewer'), member('e', 'editor')], [['taxes', NOW - DAY]])
    expect(s.walk.map((w) => [w.project.name, w.needsNext, w.canArchive])).toEqual([['Garage', true, true], ['Edited', false, false], ['Taxes', false, true]])
    expect(s.walk[2].nextAction?.id).toBe('t1')
    expect([s.left.projects, s.done.projects]).toEqual([2, false])
    const all = steps([...tasks, task('g2', { project_id: 'garage' })], projects, [member('v', 'viewer'), member('e', 'editor')], [['taxes', NOW - DAY], ['garage', NOW], ['e', NOW - 2 * DAY]])
    expect(all.done.projects).toBe(true)
    // A stamp older than a week counts as not reviewed.
    expect(steps(tasks, projects, [], [['garage', NOW - 9 * DAY]]).walk.map((w) => w.project.id)).toEqual(['v', 'taxes', 'e', 'garage'])
  })

  it('Waiting lists what is delegated or blocked, Someday what is parked, oldest first', () => {
    const s = steps([
      task('tap', { project_id: 'p', assignee_id: 'ana' }), task('parts', { project_id: 'p' }), task('fit', { project_id: 'p', blocked_by: ['parts'] }),
      task('bread', { project_id: 'p', start: 'someday', created_at: 50 }), task('italian', { start: 'someday', created_at: 10 }),
    ], [project('p')])
    expect(s.waiting.map((x) => x.id)).toEqual(['tap', 'fit'])
    expect(s.someday.map((x) => x.id)).toEqual(['italian', 'bread'])
    expect([s.done.waiting, s.done.someday, s.done.sweep]).toEqual([true, true, true])
  })

  it('a project stamp is personal and written offline', async () => {
    await markProjectReviewed('garage', 7000)
    expect((await db.prefs.get('garage'))?.reviewed_at).toBe(7000)
    const queued = (await db.outbox.toArray()).map(({ entity, entityId, field, value }) => ({ entity, entityId, field, value }))
    expect(queued).toEqual([{ entity: 'project_prefs', entityId: 'garage', field: 'reviewed_at', value: 7000 }])
    expect(walkProjects(inputOf([], [project('garage')], [], [['garage', 7000]]))[0].reviewedAt).toBe(7000)
  })

  it('Look ahead lists the next seven days and is always done', () => {
    const s = steps([task('today', { due: { date: TODAY } }), task('in6', { due: { date: '2026-10-20' } }), task('in7', { due: { date: '2026-10-21' } })])
    expect(s.ahead.map((t) => t.id)).toEqual(['today', 'in6'])
    expect(s.done.ahead).toBe(true)
  })

  it('opens on the first step that is not done', () => {
    const all = { clear: true, sweep: true, back: true, waiting: true, projects: true, ahead: true, someday: true }
    expect(firstUnfinished({ ...all, back: false, projects: false })).toBe('back')
    expect(firstUnfinished(all)).toBe('ahead')
  })
})

describe('rhythms (open-loops-method D5)', () => {
  it('the Daily check is due until it is done on the local date; the Monthly look after thirty days', () => {
    expect(dailyDue(0, TODAY)).toBe(true)
    expect(dailyDue(new Date(2026, 9, 14, 8).getTime(), TODAY)).toBe(false)
    expect(dailyDue(new Date(2026, 9, 13, 23).getTime(), TODAY)).toBe(true)
    expect(monthlyDue(NOW - 31 * DAY, NOW)).toBe(true)
    expect(monthlyDue(NOW - 20 * DAY, NOW)).toBe(false)
  })

  it('Daily and weekly on different devices keep both times', async () => {
    await finishDailyCheck(100)
    await applyOps([{ id: 'w', entity: 'review', entityId: 'me', field: 'completed_at', value: 200, ts: Date.now() + 1000, device: 'laptop' }])
    const row = await db.review.get('me')
    expect([row?.daily_at, row?.completed_at]).toEqual([100, 200])
  })

  it('Pick a focus: three at most; a completed task frees its place; a focus from yesterday is empty', async () => {
    const tasks = ['a', 'b', 'c', 'd'].map((id) => task(id))
    let row = await db.review.get('me')
    for (const id of ['a', 'b', 'c']) { expect(await toggleFocus(row, TODAY, tasks, id)).toBe('added'); row = await db.review.get('me') }
    expect(await toggleFocus(row, TODAY, tasks, 'd')).toBe('full')
    expect(focusTasks(row, TODAY, tasks).map((x) => x.id)).toEqual(['a', 'b', 'c'])
    const done = tasks.map((x) => (x.id === 'b' ? { ...x, completed_at: 5 } : x))
    expect(focusTasks(row, TODAY, done).map((x) => x.id)).toEqual(['a', 'c'])
    expect(await toggleFocus(row, TODAY, done, 'd')).toBe('added')
    expect(focusTasks(row, '2026-10-15', tasks)).toEqual([])
  })

  it('Areas: a top-level project with sub-projects, and those that need attention', () => {
    const projects = [project('home', 'Home'), project('garage', 'Garage', { parent_id: 'home' }), project('garden', 'Garden', { parent_id: 'home' }), project('work', 'Work')]
    const areas = areasOf(inputOf([task('g', { project_id: 'garden', created_at: NOW - DAY })], projects))
    expect(areas.map((a) => [a.project.name, a.children.length, a.attention.map((w) => w.project.name)])).toEqual([['Home', 2, ['Garage']]])
  })
})
