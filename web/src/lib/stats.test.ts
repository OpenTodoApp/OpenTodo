// Statistics definitions (OpenSpec change stats-and-review, tasks 1.1 and 1.2):
// every scenario of `statistics` "What is counted", "Excluded rows", "Whose tasks
// count in shared projects" and "Periods and week start", plus the fixture the
// server's digest evaluates too.
import { afterEach, describe, expect, it } from 'vitest'
import fixture from '../../../internal/digest/testdata/stats_fixture.json'
import { runFilter } from './filter'
import { comparisonOf, compute, dayInZone, periodFor, type PeriodKind } from './stats'
import type { Project, Task } from './types'
import { logicalToday, setDayStart } from './dates'
import { readDayStart } from './userPrefs'

/** Local-time Unix ms for a calendar date at an hour. */
const at = (iso: string, hour = 12) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, hour).getTime()
}

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [],
    position: 0, created_at: at('2026-09-01'), completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null,
    series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...extra,
  }
}
const project = (id: string, name = id, extra: Partial<Project> = {}) =>
  ({ id, name, archived: false, deleted_at: null, ...extra })

const TODAY = '2026-10-14' // a Wednesday
const run = (tasks: Task[], opts: { kind?: PeriodKind; weekStart?: number; projects?: ReturnType<typeof project>[]; shared?: string[]; me?: string } = {}) => {
  const weekStart = opts.weekStart ?? 1
  const period = periodFor(opts.kind ?? 'this-week', TODAY, weekStart)
  return compute({ tasks, projects: opts.projects ?? [], shared: new Set(opts.shared ?? []), me: opts.me ?? 'me', today: TODAY }, period, weekStart)
}

describe('periods and week start', () => {
  it('Sunday start: this week from Sunday to today, last week the seven days before', () => {
    expect(periodFor('this-week', TODAY, 0)).toMatchObject({ start: '2026-10-11', end: TODAY })
    expect(periodFor('last-week', TODAY, 0)).toMatchObject({ start: '2026-10-04', end: '2026-10-10' })
  })

  it('agrees with the filter periods this week and last week', () => {
    const done = ['2026-10-03', '2026-10-04', '2026-10-10', '2026-10-11', '2026-10-14'].map((d) => task(d, { completed_at: at(d) }))
    for (const weekStart of [0, 1, 6]) {
      for (const [kind, q] of [['this-week', 'completed = this week'], ['last-week', 'completed = last week']] as const) {
        const filter = runFilter(q, done, { today: TODAY, labels: [], projects: [], weekStart })
        const ids = filter.ok ? filter.tasks.map((t) => t.id).sort() : []
        const p = periodFor(kind, TODAY, weekStart)
        expect(done.filter((t) => { const d = t.id; return d >= p.start && d <= p.end }).map((t) => t.id).sort()).toEqual(ids)
      }
    }
  })

  it('four weeks (the Monthly look): three full weeks before the current one plus the current week', () => {
    expect(periodFor('4-weeks', TODAY, 1)).toMatchObject({ start: '2026-09-21', end: TODAY, weeks: 4 })
    expect(comparisonOf(periodFor('4-weeks', TODAY, 1), 1)).toEqual({ start: '2026-08-24', end: '2026-09-20' })
  })

  it('Month to date: 1–10 October against 1–10 September', () => {
    const p = periodFor('this-month', '2026-10-10', 1)
    expect(p).toMatchObject({ start: '2026-10-01', end: '2026-10-10', unit: 'day' })
    expect(comparisonOf(p, 1)).toEqual({ start: '2026-09-01', end: '2026-09-10' })
  })

  it('a month to date longer than the previous month stops at its end', () => {
    expect(comparisonOf(periodFor('this-month', '2026-03-31', 1), 1)).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  it('this quarter: calendar quarter to date, weekly, against the same days of the previous quarter', () => {
    const p = periodFor('this-quarter', '2026-11-04', 1)
    expect(p).toMatchObject({ start: '2026-10-01', end: '2026-11-04', unit: 'week' })
    expect(comparisonOf(p, 1)).toEqual({ start: '2026-07-01', end: '2026-08-04' })
    expect(periodFor('this-quarter', '2026-01-01', 1)).toMatchObject({ start: '2026-01-01', end: '2026-01-01' })
    expect(comparisonOf(periodFor('this-quarter', '2026-01-01', 1), 1)).toEqual({ start: '2025-10-01', end: '2025-10-01' })
  })

  it('this year: from 1 January, monthly, against the same days of the previous year', () => {
    const p = periodFor('this-year', TODAY, 1)
    expect(p).toMatchObject({ start: '2026-01-01', end: TODAY, unit: 'month' })
    expect(comparisonOf(p, 1)).toEqual({ start: '2025-01-01', end: '2025-10-14' })
  })

  it('this week to date against the same days of last week; last week against the full week before', () => {
    expect(comparisonOf(periodFor('this-week', TODAY, 1), 1)).toEqual({ start: '2026-10-05', end: '2026-10-07' })
    expect(comparisonOf(periodFor('last-week', TODAY, 1), 1)).toEqual({ start: '2026-09-28', end: '2026-10-04' })
    expect(comparisonOf(periodFor('this-week', TODAY, 0), 0)).toEqual({ start: '2026-10-04', end: '2026-10-07' })
  })

  it('per-day chart of this week has one bar per day from the week start to today', () => {
    expect(run([], { weekStart: 1 }).perDay.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14'])
  })
})

describe('what is counted', () => {
  it('recurring occurrences count one per record, and are not new tasks', () => {
    const records = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].map((d) =>
      task(`occ-${d}`, { series_id: 's', due: { date: d }, created_at: at(d), completed_at: at(d) }))
    const s = run([task('s', { recurrence: 'every day', due: { date: '2026-10-15' } }), ...records], { kind: 'last-week' })
    expect(s.completed).toBe(5)
    expect(s.created).toBe(0)
    expect(s.late).toBe(0)
  })

  it('subtasks count like any task', () => {
    expect(run([task('a', { completed_at: at('2026-10-13') }), task('b', { parent_id: 'a', completed_at: at('2026-10-13') })]).completed).toBe(2)
  })

  it('slipped and late: open after its due day vs completed after it, both listed with their project', () => {
    // Friday 2026-10-09; a week from Monday 2026-10-05, seen on Friday.
    const friday = '2026-10-09'
    const open = task('open', { project_id: 'p', due: { date: '2026-10-06' } })
    const late = task('late', { project_id: 'p', due: { date: '2026-10-06' }, completed_at: at('2026-10-08') })
    const period = periodFor('this-week', friday, 1)
    const s = compute({ tasks: [open, late], projects: [project('p', 'Garage')], shared: new Set(), me: 'me', today: friday }, period, 1)
    expect([s.slipped, s.late]).toEqual([1, 1])
    expect(s.slippedTasks.map((t) => [t.id, t.project_id])).toEqual([['open', 'p']])
    expect(s.lateTasks.map((t) => t.id)).toEqual(['late'])
  })

  it('a task due today is neither slipped nor overdue', () => {
    const s = run([task('t', { due: { date: TODAY } })])
    expect([s.slipped, s.overdue]).toEqual([0, 0])
  })

  it('overdue now: open, due before today, outside archived projects', () => {
    const s = run([
      task('a', { due: { date: '2026-10-01' } }),
      task('b', { due: { date: '2026-10-01' }, project_id: 'old' }),
      task('c', { due: { date: '2026-10-01' }, completed_at: at('2026-10-02') }),
    ], { projects: [project('old', 'Old', { archived: true })] })
    expect(s.overdueTasks.map((t) => t.id)).toEqual(['a'])
  })

  it('created counts tasks created in the period', () => {
    expect(run([task('a', { created_at: at('2026-10-13') }), task('b')]).created).toBe(1)
  })
})

describe('excluded rows', () => {
  it('a trashed task does not count, and counts again once restored', () => {
    const t = task('t', { completed_at: at('2026-10-12') })
    expect(run([{ ...t, deleted_at: at('2026-10-13') }]).completed).toBe(0)
    expect(run([t]).completed).toBe(1)
    expect(run([{ ...t, project_id: 'gone' }], { projects: [project('gone', 'Gone', { deleted_at: 1 })] }).completed).toBe(0)
  })

  it('a skipped habit occurrence is in no number', () => {
    const done = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((d) => task(d, { series_id: 'h', due: { date: d }, completed_at: at(d) }))
    const skipped = task('skip', { series_id: 'h', due: { date: '2026-10-09' }, completed_at: at('2026-10-10'), skipped: true })
    const s = run([...done, skipped], { kind: 'last-week' })
    expect([s.completed, s.late, s.slipped]).toEqual([4, 0, 0])
  })
})

describe('whose tasks count in shared projects', () => {
  const shared = { shared: ['s'], projects: [project('s', 'Household')] }
  const done = (id: string, extra: Partial<Task>) => task(id, { project_id: 's', completed_at: at('2026-10-13'), ...extra })
  it('who completed decides; older rows fall back to the assignee', () => {
    const s = run([
      done('mine-by-me', { assignee_id: 'ana', completed_by: 'me' }),
      done('by-ana', { assignee_id: 'me', completed_by: 'ana' }),
      done('old-ana', { assignee_id: 'ana' }),
      done('old-mine', { assignee_id: 'me' }),
      done('old-unassigned', {}),
    ], shared)
    expect(s.completed).toBe(3)
  })

  it('open tasks of other members are not overdue for me', () => {
    const s = run([task('o', { project_id: 's', assignee_id: 'ana', due: { date: '2026-10-01' } }), task('u', { project_id: 's', due: { date: '2026-10-01' } })], shared)
    expect(s.overdueTasks.map((t) => t.id)).toEqual(['u'])
  })

  it('outside shared projects every row is mine', () => {
    expect(run([task('x', { completed_at: at('2026-10-13'), completed_by: 'someone-else' })]).completed).toBe(1)
  })
})

describe('breakdowns', () => {
  it('five projects by count, then other, in descending order', () => {
    const tasks: Task[] = []
    const counts = [7, 6, 5, 4, 3, 2, 1]
    counts.forEach((n, i) => { for (let k = 0; k < n; k++) tasks.push(task(`p${i}-${k}`, { project_id: `p${i}`, completed_at: at('2026-10-01') })) })
    const s = run(tasks, { kind: '4-weeks', projects: counts.map((_, i) => project(`p${i}`, `Project ${i}`)) })
    expect(s.perProject.map((p) => [p.name, p.count])).toEqual([['Project 0', 7], ['Project 1', 6], ['Project 2', 5], ['Project 3', 4], ['Project 4', 3], ['Other', 3]])
  })

  it('per weekday starts on the first day of the week', () => {
    const s = run([task('a', { completed_at: at('2026-10-11') })], { kind: '4-weeks', weekStart: 0 })
    expect(s.perWeekday[0]).toEqual({ weekday: 0, count: 1 })
    expect(s.perWeekday.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})

describe('shared fixture (same numbers as the server digest)', () => {
  for (const c of fixture.cases) {
    it(c.name, () => {
      // A case with a day start (day-boundary D6) counts instants by the logical day in the fixture's zone.
      const dayOf = dayInZone(fixture.timeZone, readDayStart({ day_start: (c as { dayStart?: string }).dayStart ?? '' }))
      const period = periodFor(c.period as PeriodKind, fixture.today, c.weekStart)
      expect([period.start, period.end]).toEqual([c.start, c.end])
      const s = compute({
        tasks: fixture.tasks as unknown as Task[], projects: fixture.projects, shared: new Set(fixture.shared), me: fixture.me, today: fixture.today, dayOf,
      }, period, c.weekStart)
      expect({ completed: s.completed, created: s.created, late: s.late, slipped: s.slipped, overdue: s.overdue, perDay: s.perDay.map((d) => d.count) }).toEqual(c.expected)
    })
  }
})

describe('day start (day-boundary D4)', () => {
  afterEach(() => setDayStart(0))

  it('Completed after midnight is not late: a 01:30 completion counts for the previous day', () => {
    setDayStart(240)
    const due = { date: '2026-10-14' }
    const s = run([task('late-night', { due, completed_at: new Date(2026, 9, 15, 1, 30).getTime() })], { kind: 'this-week' })
    expect(s.completed).toBe(1)
    expect(s.late).toBe(0)
    expect(s.perDay.find((d) => d.date === '2026-10-14')?.count).toBe(1)
    setDayStart(0)
    // With midnight it is a late completion on Thursday (outside "this week" up to Wednesday).
    expect(run([task('late-night', { due, completed_at: new Date(2026, 9, 15, 1, 30).getTime() })], { kind: 'this-week' }).completed).toBe(0)
  })

  it('Week end at the day start: 02:00 on Monday still belongs to the previous week', () => {
    setDayStart(240)
    const monday2am = new Date(2026, 9, 19, 2, 0).getTime()
    const today = logicalToday(240, monday2am)
    expect(today).toBe('2026-10-18')
    expect(periodFor('this-week', today, 1)).toMatchObject({ start: '2026-10-12', end: '2026-10-18' })
    const s = compute({ tasks: [task('now', { completed_at: monday2am })], projects: [], shared: new Set(), me: 'me', today }, periodFor('this-week', today, 1), 1)
    expect(s.completed).toBe(1)
  })
})

describe('time tracked (OpenSpec time-tracking 6.1)', () => {
  const entry = (id: string, taskId: string, user: string, start: number, minutes: number | null, deleted: number | null = null) =>
    ({ id, task_id: taskId, user_id: user, started_at: start, ended_at: minutes === null ? null : start + minutes * 60000, deleted_at: deleted })
  const tasks = [task('a', { project_id: 'client' }), task('b'), task('gone', { deleted_at: 1 }), task('shared', { project_id: 'team' })]
  const projects = [project('client', 'Client A'), project('team', 'Team')]
  const runWith = (entries: ReturnType<typeof entry>[], kind: PeriodKind = 'this-week', now = at(TODAY, 18)) =>
    compute({ tasks, projects, shared: new Set(['team']), me: 'me', today: TODAY, entries, now }, periodFor(kind, TODAY, 1), 1)

  it("Time tracked this week: 50 + 70 minutes are 2 h; another member's entry counts nothing", () => {
    const s = runWith([
      entry('m', 'a', 'me', at('2026-10-12', 9), 50), entry('w', 'b', 'me', at('2026-10-14', 9), 70),
      entry('o', 'shared', 'ana', at('2026-10-13', 9), 30), entry('d', 'gone', 'me', at('2026-10-13', 9), 30),
      entry('x', 'a', 'me', at('2026-10-13', 9), 30, 5),
    ])
    expect(s.trackedMinutes).toBe(120)
    expect(s.trackedEntries).toBe(2)
    expect(s.trackedPerDay.find((d) => d.date === '2026-10-12')!.minutes).toBe(50)
    expect(s.trackedPerProject).toEqual([{ id: '', name: 'Inbox', minutes: 70 }, { id: 'client', name: 'Client A', minutes: 50 }])
  })

  it('a running entry counts to now', () => {
    expect(runWith([entry('r', 'b', 'me', at(TODAY, 17), null)], 'this-week', at(TODAY, 17) + 25 * 60000).trackedMinutes).toBe(25)
  })

  it("Entry across midnight: Sunday 23:30 to Monday 00:30 counts for Sunday's week", () => {
    const start = new Date(2026, 9, 11, 23, 30).getTime()
    expect(runWith([entry('n', 'b', 'me', start, 60)], 'this-week').trackedMinutes).toBe(0)
    expect(runWith([entry('n', 'b', 'me', start, 60)], 'last-week').trackedMinutes).toBe(60)
  })

  it('Nothing tracked: zero, no entries, and the completion numbers are unchanged', () => {
    const s = runWith([])
    expect([s.trackedMinutes, s.trackedEntries, s.trackedPerProject]).toEqual([0, 0, []])
    expect(run(tasks).completed).toBe(s.completed)
  })
})
