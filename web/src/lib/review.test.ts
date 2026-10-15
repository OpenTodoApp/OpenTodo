import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, finishReview, resetDeviceId } from './ops'
import { firstUnfinished, reviewDue, reviewSteps } from './review'
import type { Membership, Project, Task } from './types'

const task = (p: Partial<Task> & { id: string }): Task => ({
  project_id: null, section_id: null, parent_id: null, title: p.id, description: '', priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, ...p,
}) as Task
const project = (id: string, extra: Partial<Project> = {}): Project => ({ id, name: id, color: '', position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null, ...extra }) as Project
const today = '2026-10-14'

describe('review steps (stats-and-review D3)', () => {
  it('Get clear lists the open Inbox tasks and is done once they are handled', () => {
    const inbox = ['a', 'b', 'c'].map((id) => task({ id }))
    let s = reviewSteps(inbox, [], new Map(), 'u1', today)
    expect(s.inbox).toHaveLength(3)
    expect(s.done['get-clear']).toBe(false)
    s = reviewSteps([{ ...inbox[0], project_id: 'p' }, { ...inbox[1], completed_at: 1 }, { ...inbox[2], deleted_at: 1 }], [project('p')], new Map(), 'u1', today)
    expect(s.done['get-clear']).toBe(true)
  })

  it('Look back shows the overdue tasks; a new date removes one', () => {
    const late = [task({ id: 'x', project_id: 'p', due: { date: '2026-10-12' } }), task({ id: 'y', project_id: 'p', due: { date: '2026-10-13' } })]
    expect(reviewSteps(late, [project('p')], new Map(), 'u1', today).overdue.map((t) => t.id)).toEqual(['x', 'y'])
    expect(reviewSteps([late[0], { ...late[1], due: { date: '2026-10-20' } }], [project('p')], new Map(), 'u1', today).overdue.map((t) => t.id)).toEqual(['x'])
  })

  it('Next actions lists Garage (only completed tasks) and not Taxes (one open task)', () => {
    const tasks = [task({ id: 'g1', project_id: 'garage', completed_at: 5 }), task({ id: 't1', project_id: 'taxes' })]
    const s = reviewSteps(tasks, [project('garage'), project('taxes'), project('old', { archived: true })], new Map(), 'u1', today)
    expect(s.nextActions.map((p) => p.id)).toEqual(['garage'])
  })

  it('a shared project the user only views is not listed', () => {
    const m = new Map<string, Membership>([['shared', { projectId: 'shared', role: 'viewer', ownerId: 'u2', members: [] }]])
    expect(reviewSteps([], [project('shared')], m, 'u1', today).nextActions).toEqual([])
    m.set('shared', { ...m.get('shared')!, role: 'editor' })
    expect(reviewSteps([], [project('shared')], m, 'u1', today).nextActions.map((p) => p.id)).toEqual(['shared'])
  })

  it('Look ahead covers seven days and opens on the first unfinished step', () => {
    const s = reviewSteps([task({ id: 'soon', project_id: 'p', due: { date: '2026-10-20' } }), task({ id: 'later', project_id: 'p', due: { date: '2026-10-21' } })], [project('p')], new Map(), 'u1', today)
    expect(s.ahead.map((t) => t.id)).toEqual(['soon'])
    expect(firstUnfinished(s.done)).toBe('look-ahead')
    expect(firstUnfinished({ 'get-clear': true, 'look-back': false, 'next-actions': false, 'look-ahead': true })).toBe('look-back')
  })

  it('is due after seven days or when never done', () => {
    const now = Date.UTC(2026, 9, 14)
    expect(reviewDue(0, now)).toBe(true)
    expect(reviewDue(now - 9 * 86400000, now)).toBe(true)
    expect(reviewDue(now - 2 * 86400000, now)).toBe(false)
  })
})

let n = 0
describe('review entity (stats-and-review D4)', () => {
  beforeEach(() => {
    useDatabase(`review-${Date.now()}-${n++}`)
    resetDeviceId()
  })

  it('applies a remote op and reads it back', async () => {
    await applyOps([{ id: 'r1', entity: 'review', entityId: 'me', field: 'completed_at', value: 1760000000000, ts: 10, device: 'laptop' }])
    expect((await db.review.get('me'))?.completed_at).toBe(1760000000000)
  })

  it('finishing offline applies at once and waits in the outbox', async () => {
    await finishReview(1760000500000)
    expect((await db.review.get('me'))?.completed_at).toBe(1760000500000)
    const queued = (await db.outbox.toArray()).map(({ entity, entityId, field, value }) => ({ entity, entityId, field, value }))
    expect(queued).toEqual([{ entity: 'review', entityId: 'me', field: 'completed_at', value: 1760000500000 }])
  })
})
