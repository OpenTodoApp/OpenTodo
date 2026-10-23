// The reviews (OpenSpec changes stats-and-review 1.4, 3.1 and open-loops-method
// 5.2): the synced `review` row, every scenario of `weekly-review` "Review steps",
// the project walk, the rhythms and today's focus.
import { beforeEach, describe, expect, it } from 'vitest'
import { setDayStart } from './dates'
import { db, useDatabase } from './db'
import { applyOps, createTask, resetDeviceId, updateTask } from './ops'
import { compute, periodFor } from './stats'
import { undoBatch } from './undo'
import { applyCarryOver, areasOf, carryOverLabel, carryOverOf, closeDay, closedDayOf, reopenDay, dailyDue, dayClosed, daySummary, planCarryOver, yesterdaysNote, type CarryDecision, type CarryTask, finishDailyCheck, finishReview, firstUnfinished, focusTasks, markProjectReviewed, monthlyDue, reviewAgo, reviewDue, reviewSteps, toggleFocus, walkProjects, type ReviewInput } from './review'
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

  it('with a 04:00 day start an evening check still counts at 00:30, and a review at 01:00 was yesterday (day-boundary D4)', () => {
    setDayStart(240)
    try {
      const evening = new Date(2026, 9, 14, 21).getTime()
      // At 00:30 on the 15th the logical today is still the 14th: not due.
      expect(dailyDue(evening, '2026-10-14')).toBe(false)
      // After 04:00 the logical today is the 15th: due again.
      expect(dailyDue(evening, '2026-10-15')).toBe(true)
      // A check done at 01:00 on the 15th belongs to the 14th.
      expect(dailyDue(new Date(2026, 9, 15, 1).getTime(), '2026-10-14')).toBe(false)
      expect(reviewAgo(new Date(2026, 9, 15, 1).getTime(), new Date(2026, 9, 15, 10).getTime())).toBe('yesterday')
      expect(reviewAgo(new Date(2026, 9, 14, 21).getTime(), new Date(2026, 9, 15, 2).getTime())).toBe('today')
    } finally {
      setDayStart(0)
    }
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

describe('Close the day (close-the-day 2.1–2.4)', () => {
  const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime()
  const sumInput = (tasks: Task[], projects: Project[] = [], memberships: Membership[] = []) =>
    ({ tasks, projects, memberships: new Map(memberships.map((m) => [m.projectId, m])), me: 'me', today: TODAY })

  it('dayClosed: closed today vs yesterday vs never; the logical day counts', () => {
    expect(dayClosed({ closed_at: at(14, 18, 42) }, TODAY)).toBe(true)
    expect(dayClosed({ closed_at: at(13, 21) }, TODAY)).toBe(false)
    expect(dayClosed({ closed_at: 0 }, TODAY)).toBe(false)
    expect(dayClosed(undefined, TODAY)).toBe(false)
    setDayStart(240)
    try {
      // 01:30 on the 15th before a 04:00 day start still closes the 14th.
      expect(dayClosed({ closed_at: at(15, 1, 30) }, TODAY)).toBe(true)
    } finally { setDayStart(0) }
  })

  it('closedDayOf (close-the-day-v2 D1): the stored day wins over the stamp; without it, the logical day of the stamp', () => {
    // Opened at 23:59 on the 14th, closed at 00:02 on the 15th: the 14th is closed, not the 15th.
    const late = { closed_at: at(15, 0, 2), closed_day: TODAY }
    expect([closedDayOf(late), dayClosed(late, TODAY), dayClosed(late, '2026-10-15')]).toEqual([TODAY, true, false])
    expect(yesterdaysNote({ ...late, tomorrow_note: 'Start with the invoice' }, '2026-10-15')).toBe('Start with the invoice')
    // A close written before the field existed, and one whose field is not a date.
    expect(closedDayOf({ closed_at: at(15, 0, 2), closed_day: '' })).toBe('2026-10-15')
    expect(closedDayOf({ closed_at: at(15, 0, 2), closed_day: 'soon' })).toBe('2026-10-15')
    expect(closedDayOf({ closed_at: 0, closed_day: TODAY })).toBeNull()
  })

  it('yesterdaysNote: shown only for an earlier day, empty is null, a close today hides it', () => {
    expect(yesterdaysNote({ closed_at: at(13, 21), tomorrow_note: '  Start with the invoice ' }, TODAY)).toBe('Start with the invoice')
    expect(yesterdaysNote({ closed_at: at(10, 21), tomorrow_note: 'Older' }, TODAY)).toBe('Older')
    expect(yesterdaysNote({ closed_at: at(13, 21), tomorrow_note: '   ' }, TODAY)).toBeNull()
    expect(yesterdaysNote({ closed_at: at(14, 7), tomorrow_note: 'Today' }, TODAY)).toBeNull()
    expect(yesterdaysNote({ closed_at: 0, tomorrow_note: 'x' }, TODAY)).toBeNull()
    expect(yesterdaysNote(null, TODAY)).toBeNull()
  })

  it('closeDay writes the time, the day and the trimmed note as one op triple through the outbox', async () => {
    await closeDay('  Start with the invoice  ', TODAY, 7000)
    const row = await db.review.get('me')
    expect([row?.closed_at, row?.closed_day, row?.tomorrow_note]).toEqual([7000, TODAY, 'Start with the invoice'])
    const queued = (await db.outbox.toArray()).map(({ field, value }) => [field, value]).sort()
    expect(queued).toEqual([['closed_at', 7000], ['closed_day', TODAY], ['tomorrow_note', 'Start with the invoice']])
  })

  it('Two closes offline: each field by its own latest write', async () => {
    await applyOps([
      { id: 'p1', entity: 'review', entityId: 'me', field: 'closed_at', value: at(14, 18), ts: 100, device: 'phone' },
      { id: 'p2', entity: 'review', entityId: 'me', field: 'tomorrow_note', value: 'Call Ana', ts: 100, device: 'phone' },
      { id: 'l1', entity: 'review', entityId: 'me', field: 'closed_at', value: at(14, 18, 30), ts: 200, device: 'laptop' },
      { id: 'l2', entity: 'review', entityId: 'me', field: 'tomorrow_note', value: '', ts: 200, device: 'laptop' },
    ])
    const row = await db.review.get('me')
    expect([row?.closed_at, row?.tomorrow_note]).toEqual([at(14, 18, 30), ''])
  })

  it('A day with a focus: 8 planned, 5 done, focus 2 of 3', () => {
    const open = ['o1', 'o2', 'o3'].map((id) => task(id, { due: { date: TODAY } }))
    const done = ['d1', 'd2', 'd3', 'd4', 'd5'].map((id) => task(id, { due: { date: TODAY }, completed_at: at(14, 10) }))
    const s = daySummary(sumInput([...open, ...done]), { focus_date: TODAY, focus: 'd1,d2,o1' })
    expect([s.planned, s.done, s.focusDone, s.focusTotal]).toEqual([8, 5, 2, 3])
    expect(s.unfinished.map((x) => x.task.id).sort()).toEqual(['o1', 'o2', 'o3'])
  })

  it('Nothing was planned: zero everywhere; a focus from yesterday counts nothing', () => {
    const s = daySummary(sumInput([task('later', { due: { date: '2026-10-20' } })]), { focus_date: '2026-10-13', focus: 'later' })
    expect([s.planned, s.done, s.focusTotal, s.unfinished.length]).toEqual([0, 0, 0, 0])
  })

  it('deleted tasks and skipped habit occurrences count nowhere; done agrees with Statistics for this week', () => {
    const tasks = [
      task('gone', { due: { date: TODAY }, deleted_at: 5 }),
      task('gone-done', { completed_at: at(14, 9), deleted_at: 6 }),
      task('skip', { completed_at: at(14, 9), skipped: true, series_id: 's' }),
      task('real', { completed_at: at(14, 11) }),
      task('yesterday', { completed_at: at(13, 11) }),
      task('open', { due: { date: '2026-10-12' } }),
    ]
    const s = daySummary(sumInput(tasks), null)
    expect([s.planned, s.done]).toEqual([2, 1])
    expect(s.unfinished.map((x) => x.task.id)).toEqual(['open'])
    const week = compute({ tasks, projects: [], shared: new Set(), me: 'me', today: TODAY }, periodFor('this-week', TODAY, 1), 1)
    expect(week.perDay.find((d) => d.date === TODAY)?.count).toBe(s.done)
  })

  it('a task in a project where the user is a viewer is listed but not editable, and writes nothing', () => {
    const tasks = [task('v', { project_id: 'shared', due: { date: TODAY } })]
    const s = daySummary(sumInput(tasks, [project('shared')], [{ projectId: 'shared', role: 'viewer' } as Membership]), null)
    expect(s.unfinished.map((x) => [x.task.id, x.editable])).toEqual([['v', false]])
    expect(planCarryOver(new Map(), s.unfinished, TODAY)).toEqual([])
  })

  const carry = (tasks: Task[]): CarryTask[] => tasks.map((x) => ({ task: x, editable: true }))

  it('Default carry-over: the time of day is kept, overdue and started tasks get tomorrow without a time and leave Today', () => {
    const tasks = carry([
      task('timed', { due: { date: TODAY, time: '14:00' } }),
      task('overdue', { due: { date: '2026-10-12' } }),
      task('started', { start: '2026-10-13' }),
    ])
    const changes = planCarryOver(new Map(), tasks, TODAY)
    expect(changes.map((c) => [c.entityId, c.patch])).toEqual([
      ['timed', { due: { date: '2026-10-15', time: '14:00' } }],
      ['overdue', { due: { date: '2026-10-15' } }],
      ['started', { due: { date: '2026-10-15' }, start: null }],
    ])
    expect(carryOverLabel([{ kind: 'tomorrow' }, { kind: 'tomorrow' }, { kind: 'day', date: '2026-10-16' }])).toBe('3 tasks rescheduled')
  })

  it('Mixed decisions: Someday clears due and evening, Keep writes nothing, Friday is written; one change per task', () => {
    const tasks = carry([task('a', { due: { date: TODAY }, evening: true }), task('b', { due: { date: TODAY } }), task('c', { due: { date: TODAY } })])
    const decisions = new Map<string, CarryDecision>([['a', { kind: 'someday' }], ['b', { kind: 'keep' }], ['c', { kind: 'day', date: '2026-10-16' }]])
    const changes = planCarryOver(decisions, tasks, TODAY)
    expect(changes.map((c) => [c.entityId, c.patch])).toEqual([
      ['a', { start: 'someday', due: null, evening: false }],
      ['c', { due: { date: '2026-10-16' } }],
    ])
    expect(carryOverLabel([{ kind: 'someday' }, { kind: 'day', date: '2026-10-16' }])).toBe('2 tasks carried over')
  })

  it('applyCarryOver writes one undo entry; undo restores the previous dues and skips a task dated by hand since', async () => {
    const ids = [await createTask({ title: 'One', due: { date: TODAY } }), await createTask({ title: 'Two', due: { date: '2026-10-12' } }), await createTask({ title: 'Three', due: { date: TODAY, time: '09:00' } })]
    const rows = (await db.tasks.bulkGet(ids)) as Task[]
    const before = await db.assistantUndo.count()
    const { entry, label, count } = await applyCarryOver(new Map(), carry(rows), TODAY)
    expect([label, count, (await db.assistantUndo.count()) - before]).toEqual(['3 tasks rescheduled', 3, 1])
    expect(((await db.tasks.bulkGet(ids)) as Task[]).map((x) => x.due?.date)).toEqual(['2026-10-15', '2026-10-15', '2026-10-15'])
    await new Promise((r) => setTimeout(r, 2))
    await updateTask(ids[1], { due: { date: '2026-10-20' } })
    const result = await undoBatch(entry!.id)
    expect(result.skipped).toEqual(['Two'])
    expect(((await db.tasks.bulkGet(ids)) as Task[]).map((x) => x.due)).toEqual([{ date: TODAY }, { date: '2026-10-20' }, { date: TODAY, time: '09:00' }])
  })

  it('Done already (close-the-day-v2 D3): a task completes and a weekly series rolls, in the same batch as the rest', async () => {
    const plain = await createTask({ title: 'Plain', due: { date: TODAY } })
    const weekly = await createTask({ title: 'Weekly', due: { date: TODAY }, recurrence: 'every wednesday' })
    const moved = await createTask({ title: 'Moved', due: { date: TODAY } })
    const rows = (await db.tasks.bulkGet([plain, weekly, moved])) as Task[]
    const decisions = new Map<string, CarryDecision>([[plain, { kind: 'done' }], [weekly, { kind: 'done' }]])
    const before = await db.assistantUndo.count()
    const { entry, label } = await applyCarryOver(decisions, carry(rows), TODAY, rows)
    expect([label, (await db.assistantUndo.count()) - before]).toEqual(['3 tasks carried over', 1])
    expect((await db.tasks.get(plain))!.completed_at).not.toBeNull()
    expect(await db.tasks.get(weekly)).toMatchObject({ completed_at: null, due: { date: '2026-10-21' } })
    expect((await db.tasks.get(moved))!.due).toEqual({ date: '2026-10-15' })
    await undoBatch(entry!.id)
    expect([(await db.tasks.get(plain))!.completed_at, (await db.tasks.get(weekly))!.due, (await db.tasks.get(moved))!.due]).toEqual([null, { date: TODAY }, { date: TODAY }])
  })

  it('Two batches in one evening: the record joins them, and Reopen puts both back', async () => {
    const a = await createTask({ title: 'A', due: { date: TODAY } })
    const b = await createTask({ title: 'B', due: { date: TODAY } })
    await applyCarryOver(new Map<string, CarryDecision>([[b, { kind: 'keep' }]]), carry((await db.tasks.bulkGet([a, b])) as Task[]), TODAY)
    await applyCarryOver(new Map<string, CarryDecision>([[b, { kind: 'day', date: '2026-10-16' }]]), carry([(await db.tasks.get(b)) as Task]), TODAY)
    const record = carryOverOf(await db.review.get('me'))
    expect(record?.items.map((it) => [it.id, it.field, it.before, it.after])).toEqual([
      [a, 'due', { date: TODAY }, { date: '2026-10-15' }],
      [b, 'due', { date: TODAY }, { date: '2026-10-16' }],
    ])
    await closeDay('', TODAY, at(14, 21))
    const r = await reopenDay(TODAY)
    expect(r.restored).toBe(2)
    expect([(await db.tasks.get(a))!.due, (await db.tasks.get(b))!.due]).toEqual([{ date: TODAY }, { date: TODAY }])
    expect(await db.review.get('me')).toMatchObject({ closed_at: 0, closed_day: '' })
  })
})
