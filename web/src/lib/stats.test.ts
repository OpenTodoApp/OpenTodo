// Statistics definitions (OpenSpec change stats-and-review, tasks 1.1 and 1.2):
// every scenario of `statistics` "What is counted", "Excluded rows", "Whose tasks
// count in shared projects" and "Periods and week start", plus the fixture the
// server's digest evaluates too.
import { describe, expect, it } from 'vitest'
import fixture from '../../../internal/digest/testdata/stats_fixture.json'
import { runFilter } from './filter'
import { compute, dayInZone, periodFor, type PeriodKind } from './stats'
import type { Project, Task } from './types'

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

  it('twelve weeks: eleven full weeks before the current one plus the current week, twelve week bars', () => {
    const p = periodFor('12-weeks', TODAY, 1)
    expect(p).toMatchObject({ start: '2026-07-27', end: TODAY, weeks: 12 })
    const s = run([], { kind: '12-weeks' })
    expect(s.perWeek).toHaveLength(12)
    expect(s.perWeek[11].start).toBe('2026-10-12')
    expect(periodFor('4-weeks', TODAY, 1)).toMatchObject({ start: '2026-09-21', weeks: 4 })
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
  const dayOf = dayInZone(fixture.timeZone)
  for (const c of fixture.cases) {
    it(c.name, () => {
      const period = periodFor(c.period as PeriodKind, fixture.today, c.weekStart)
      expect([period.start, period.end]).toEqual([c.start, c.end])
      const s = compute({
        tasks: fixture.tasks as unknown as Task[], projects: fixture.projects, shared: new Set(fixture.shared), me: fixture.me, today: fixture.today, dayOf,
      }, period, c.weekStart)
      expect({ completed: s.completed, created: s.created, late: s.late, slipped: s.slipped, overdue: s.overdue, perDay: s.perDay.map((d) => d.count) }).toEqual(c.expected)
    })
  }
})
