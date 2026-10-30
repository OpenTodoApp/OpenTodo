// The re-plan packer (OpenSpec change replan-the-day, task 1.2): every scenario of the
// spec's "Missed blocks" and "packs" requirements, with the clock as an input.
import { describe, expect, it } from 'vitest'
import { afterDeadline, missedBlocks, replan, replanChanges, type ReplanInput } from './replan'
import type { CalendarEvent, Membership, Task } from './types'

const TODAY = '2026-10-14'
const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3))

function task(id: string, time: string | null, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: time ? { date: TODAY, time } : { date: TODAY }, labels: [], position: 0,
    created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, deadline: null, assignee_id: null, _clock: {}, ...extra,
  } as unknown as Task
}

const ev = (id: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, subscriptionId: 's', uid: id, summary: id, location: '', start: { date: TODAY, time: start }, end: { date: TODAY, time: end }, allDay: false, free: false, ...extra,
})

function input(now: string | number, tasks: Task[], extra: Partial<ReplanInput> = {}): ReplanInput {
  return { today: TODAY, now: typeof now === 'number' ? now : hm(now), tasks, projects: [], memberships: new Map(), me: 'me', runningTaskId: null, endHour: 22, events: [], ...extra }
}

const at = (r: ReturnType<typeof replan>) => Object.fromEntries(r.moves.map((m) => [m.id, `${String(Math.floor(m.to / 60)).padStart(2, '0')}:${String(m.to % 60).padStart(2, '0')}`]))

const shared = (role: Membership['role']): Map<string, Membership> => new Map([['p1', { projectId: 'p1', role, ownerId: 'owner', members: [] }]])

describe('missed blocks', () => {
  it('behind at half past one: three missed, the 13:00 block in progress is not', () => {
    const tasks = [
      task('a', '09:00', { estimate_minutes: 60 }), task('b', '10:30', { estimate_minutes: 30 }), task('c', '11:00'),
      task('d', '13:00', { estimate_minutes: 60 }), task('undated', null), task('done', '08:00', { completed_at: 1 }),
    ]
    expect(missedBlocks(input('13:30', tasks)).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('a block ending exactly now is missed', () => {
    expect(missedBlocks(input('10:00', [task('a', '09:00', { estimate_minutes: 60 })])).map((m) => m.id)).toEqual(['a'])
  })

  it('nothing behind when every block ends after now', () => {
    expect(missedBlocks(input('08:00', [task('a', '09:00')]))).toEqual([])
  })

  it('leaves out a viewer’s tasks, another member’s tasks and the running timer', () => {
    const tasks = [
      task('viewer', '09:00', { project_id: 'p1' }),
      task('running', '09:30'),
      task('other', '10:00', { project_id: 'p2', assignee_id: 'ana' }),
      task('mine', '10:30', { project_id: 'p2', assignee_id: 'me' }),
      task('unassigned', '11:00', { project_id: 'p2' }),
    ]
    const memberships = new Map([...shared('viewer'), ['p2', { projectId: 'p2', role: 'editor', ownerId: 'owner', members: [] } as Membership]])
    expect(missedBlocks(input('13:00', tasks, { memberships, runningTaskId: 'running' })).map((m) => m.id)).toEqual(['mine', 'unassigned'])
  })

  it('leaves out archived projects and other days', () => {
    const tasks = [task('arch', '09:00', { project_id: 'old' }), task('yesterday', '09:00', { due: { date: '2026-10-13', time: '09:00' } })]
    expect(missedBlocks(input('13:00', tasks, { projects: [{ id: 'old', archived: true }] }))).toEqual([])
  })

  it('sorts by time, then priority, then id', () => {
    const tasks = [task('z', '09:00', { priority: 2 }), task('y', '09:00', { priority: 1 }), task('x', '09:00', { priority: 2 }), task('w', '08:00')]
    expect(missedBlocks(input('13:00', tasks)).map((m) => m.id)).toEqual(['w', 'y', 'x', 'z'])
  })
})

describe('replan packs', () => {
  it('around a meeting: the next mark is 13:30 and the meeting fills it', () => {
    const r = replan(input('13:20', [task('A', '09:00', { estimate_minutes: 60 }), task('B', '10:00', { estimate_minutes: 30 })], { events: [ev('m', '13:30', '14:30')] }))
    expect(at(r)).toEqual({ A: '14:30', B: '15:30' })
    expect(r.unfit).toEqual([])
  })

  it('keeps the order: a small task is not jumped ahead, it fills the earlier hole', () => {
    // Free 15:00-15:30 and 16:00-22:00: a block sits at 15:30-16:00.
    const tasks = [task('A', '09:00', { estimate_minutes: 90 }), task('B', '10:00', { estimate_minutes: 15, priority: 1 }), task('wall', '15:30', { estimate_minutes: 30 })]
    expect(at(replan(input('15:00', tasks)))).toEqual({ A: '16:00', B: '15:00' })
  })

  it('lists what does not fit before the grid end', () => {
    const tasks = ['a', 'b', 'c'].map((id, i) => task(id, `0${i + 7}:00`, { estimate_minutes: 30 }))
    const r = replan(input('21:10', tasks))
    expect(at(r)).toEqual({ a: '21:15' })
    expect(r.unfit.map((u) => u.id)).toEqual(['b', 'c'])
  })

  it('after the grid end nothing moves today', () => {
    const r = replan(input('23:00', [task('a', '09:00'), task('b', '10:00')]))
    expect(r.moves).toEqual([])
    expect(r.unfit.map((u) => u.id)).toEqual(['a', 'b'])
  })

  it('with the day start past midnight and now after midnight, nothing fits', () => {
    const r = replan(input(24 * 60 + 30, [task('a', '21:00')]))
    expect(r.moves).toEqual([])
    expect(r.unfit.map((u) => u.id)).toEqual(['a'])
  })

  it('calendars hidden: the caller passes no events, so the time is free', () => {
    const tasks = [task('a', '09:00', { estimate_minutes: 60 })]
    expect(at(replan(input('15:00', tasks, { events: [ev('m', '15:00', '16:00')] })))).toEqual({ a: '16:00' })
    expect(at(replan(input('15:00', tasks, { events: [] })))).toEqual({ a: '15:00' })
  })

  it('free and all-day events are not obstacles', () => {
    const events = [ev('free', '15:00', '16:00', { free: true }), { ...ev('allday', '', ''), allDay: true, start: { date: TODAY }, end: { date: '2026-10-15' } }]
    expect(at(replan(input('15:00', [task('a', '09:00')], { events })))).toEqual({ a: '15:00' })
  })

  it('an event ending off the grid marks moves the block to the next mark', () => {
    expect(at(replan(input('15:00', [task('a', '09:00')], { events: [ev('m', '15:00', '15:40')] })))).toEqual({ a: '15:45' })
  })

  it('is deterministic for equal input', () => {
    const tasks = [task('b', '09:00'), task('a', '09:00'), task('c', '11:00', { estimate_minutes: 45 })]
    const one = replan(input('14:05', tasks, { events: [ev('m', '15:00', '16:00')] }))
    const two = replan(input('14:05', [...tasks].reverse(), { events: [ev('m', '15:00', '16:00')] }))
    expect(two).toEqual(one)
    // b (30 min) does not fit 14:45-15:00 before the meeting; the 15-minute hole stays empty.
    expect(at(one)).toEqual({ a: '14:15', b: '16:00', c: '16:30' })
  })
})

describe('replanChanges', () => {
  const live = (tasks: Task[]) => new Map(tasks.map((tk) => [tk.id, tk]))
  it('writes due edits only, moves unfit to tomorrow, skips what changed meanwhile', () => {
    const a = task('a', '09:00'), b = task('b', '10:00'), c = task('c', '11:00'), d = task('d', '12:00')
    const proposal = { moves: [{ id: 'a', start: hm('09:00'), length: 30, priority: 4, to: hm('21:00') }, { id: 'b', start: hm('10:00'), length: 30, priority: 4, to: hm('21:30') }], unfit: [{ id: 'c', start: hm('11:00'), length: 30, priority: 4 }, { id: 'd', start: hm('12:00'), length: 30, priority: 4 }] }
    const stored = new Map([a, b, c, d].map((tk) => [tk.id, tk.due]))
    const changedB = { ...b, due: { date: TODAY, time: '18:00' } }
    const doneD = { ...d, completed_at: 5 }
    const r = replanChanges(proposal, { today: TODAY, choice: 'tomorrow', stored, live: live([a, changedB, c, doneD]), memberships: new Map() })
    expect(r.changes).toEqual([
      { entity: 'task', entityId: 'a', patch: { due: { date: TODAY, time: '21:00' } } },
      { entity: 'task', entityId: 'c', patch: { due: { date: '2026-10-15', time: '11:00' } } },
    ])
    expect(r.skipped).toBe(2)
    expect(replanChanges(proposal, { today: TODAY, choice: 'leave', stored, live: live([a, b, c, d]), memberships: new Map() }).changes.map((x) => x.entityId)).toEqual(['a', 'b'])
  })

  it('keeps a zoned time fixed to its zone', () => {
    // 09:00 New York is 15:00 Berlin; proposed at 16:00 Berlin, it becomes 10:00 New York.
    const raw = task('z', null, { due: { date: TODAY, time: '09:00', tz: 'America/New_York' } })
    const proposal = { moves: [{ id: 'z', start: hm('15:00'), length: 30, priority: 4, to: hm('16:00') }], unfit: [] }
    const r = replanChanges(proposal, { today: TODAY, choice: 'leave', stored: new Map([['z', raw.due]]), live: live([raw]), memberships: new Map(), zone: 'Europe/Berlin' })
    expect(r.changes[0].patch.due).toEqual({ date: TODAY, time: '10:00', tz: 'America/New_York' })
  })

  it('skips a task that became read-only', () => {
    const a = task('a', '09:00', { project_id: 'p1' })
    const proposal = { moves: [{ id: 'a', start: hm('09:00'), length: 30, priority: 4, to: hm('21:00') }], unfit: [] }
    expect(replanChanges(proposal, { today: TODAY, choice: 'leave', stored: new Map([['a', a.due]]), live: live([a]), memberships: shared('viewer') }).skipped).toBe(1)
  })

  it('warns when tomorrow is after the deadline', () => {
    expect(afterDeadline({ deadline: TODAY }, TODAY)).toBe(true)
    expect(afterDeadline({ deadline: '2026-10-15' }, TODAY)).toBe(false)
    expect(afterDeadline({ deadline: null }, TODAY)).toBe(false)
  })
})
