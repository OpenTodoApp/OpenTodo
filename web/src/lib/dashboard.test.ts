// The dashboard's measures (OpenSpec change stats-dashboard, tasks 1.2, 2.1, 2.2,
// 2.4): the spec scenarios of "Headline tiles", "Dashboard panels" and "Dashboard
// on large accounts", computed from one model and sliced per period.
import { describe, expect, it } from 'vitest'
import { buildModel, dashboardOf, estimatesOf, heatmapOf, hoursOf, keepingUpOf, streakOf, tilesOf, timeOf, type DashboardInput } from './dashboard'
import { comparisonOf, compute, periodFor, type PeriodKind } from './stats'
import type { Project, Task } from './types'

const at = (iso: string, hour = 12, minute = 0) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, hour, minute).getTime()
}
function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [],
    position: 0, created_at: at('2025-01-01'), completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null,
    series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...extra,
  }
}
const project = (id: string, name = id, extra: Partial<Project> = {}) => ({ id, name, archived: false, deleted_at: null, ...extra })
const entry = (id: string, taskId: string, start: number, minutes: number, user = 'me') =>
  ({ id, task_id: taskId, user_id: user, started_at: start, ended_at: start + minutes * 60000, deleted_at: null })

const TODAY = '2026-10-14' // a Wednesday
function model(tasks: Task[], extra: Partial<DashboardInput> = {}) {
  return buildModel({ tasks, projects: [], shared: new Set(), me: 'me', today: TODAY, weekStart: 1, dayStart: 0, now: at(TODAY, 18), ...extra })
}
const slice = (kind: PeriodKind, today = TODAY, weekStart = 1) => {
  const p = periodFor(kind, today, weekStart)
  return { p, prev: comparisonOf(p, weekStart) }
}

describe('headline tiles', () => {
  it('On time: eight of ten dated completions on or before their due day; undated ones are not part of it', () => {
    const tasks: Task[] = []
    for (let i = 0; i < 8; i++) tasks.push(task(`ok${i}`, { due: { date: '2026-10-13' }, completed_at: at('2026-10-13') }))
    for (let i = 0; i < 2; i++) tasks.push(task(`late${i}`, { due: { date: '2026-10-12' }, completed_at: at('2026-10-13') }))
    for (let i = 0; i < 4; i++) tasks.push(task(`undated${i}`, { completed_at: at('2026-10-12') }))
    const { p, prev } = slice('this-week')
    const tiles = tilesOf(model(tasks), p, prev)
    expect(tiles.onTime).toMatchObject({ value: 80, dated: 10 })
    expect(tiles.done.value).toBe(14)
  })

  it('No due dates: On time has no value and says why', () => {
    const { p, prev } = slice('this-week')
    expect(tilesOf(model([task('a', { completed_at: at('2026-10-13') })]), p, prev).onTime).toEqual({ value: null, previous: null, dated: 0 })
  })

  it('compares with the same days of the previous unit', () => {
    const tasks = [task('now', { completed_at: at('2026-10-05') }), task('then1', { completed_at: at('2026-09-03') }), task('then2', { completed_at: at('2026-09-20') })]
    const { p, prev } = slice('this-month', '2026-10-10')
    expect(tilesOf(model(tasks, { today: '2026-10-10' }), p, prev).done).toEqual({ value: 1, previous: 1 })
  })

  it('Streak across the day start: a 02:30 completion counts for yesterday and the streak is not broken today', () => {
    // Day start 04:00; completions on each of the six logical days before today, the last at 02:30 today.
    const tasks = [1, 2, 3, 4, 5].map((n) => task(`d${n}`, { completed_at: at(`2026-10-${String(14 - n - 1).padStart(2, '0')}`, 12) }))
    tasks.push(task('late-night', { completed_at: at(TODAY, 2, 30) }))
    const m = buildModel({ tasks, projects: [], shared: new Set(), me: 'me', today: TODAY, weekStart: 1, dayStart: 240, now: at(TODAY, 18) })
    expect(streakOf(m)).toEqual({ current: 6, best: 6 })
  })

  it('a gap ends the streak; the best run is kept', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-12', '2026-10-13', TODAY]
    expect(streakOf(model(days.map((d) => task(d, { completed_at: at(d) }))))).toEqual({ current: 3, best: 4 })
  })

  it('Tracked without estimates: 5 h on three tasks against 3 h estimated, one task without an estimate', () => {
    const tasks = [task('a', { estimate_minutes: 120 }), task('b', { estimate_minutes: 60 }), task('c')]
    const entries = [entry('1', 'a', at('2026-10-12', 9), 120), entry('2', 'a', at('2026-10-13', 9), 60), entry('3', 'b', at('2026-10-13', 14), 60), entry('4', 'c', at(TODAY, 9), 60)]
    const { p, prev } = slice('this-week')
    expect(tilesOf(model(tasks, { entries }), p, prev).tracked).toMatchObject({ minutes: 300, estimate: 180, noEstimate: 1, tasks: 3 })
  })
})

describe('panels', () => {
  it('Keeping up for a quarter: weekly points from the quarter start', () => {
    const today = '2026-11-01' // the fifth week of the quarter that started on Thursday 1 October
    const { p } = slice('this-quarter', today)
    const done = [task('a', { completed_at: at('2026-10-02'), created_at: at('2026-10-01') }), task('b', { completed_at: at('2026-10-30') })]
    const buckets = keepingUpOf(model(done, { today }), p)
    expect(buckets.map((b) => b.start)).toEqual(['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29'])
    expect(buckets.map((b) => [b.done, b.created])).toEqual([[1, 1], [0, 0], [0, 0], [0, 0], [1, 0]])
  })

  it('a year is per month, a month per day', () => {
    expect(keepingUpOf(model([]), periodFor('this-year', TODAY, 1)).map((b) => b.start).slice(-2)).toEqual(['2026-09-01', '2026-10-01'])
    expect(keepingUpOf(model([]), periodFor('this-month', TODAY, 1))).toHaveLength(14)
  })

  it('Project breakdown: five projects by completions, then other, when nothing was tracked', () => {
    const tasks: Task[] = []
    const counts = [7, 6, 5, 4, 3, 2, 1]
    counts.forEach((n, i) => { for (let k = 0; k < n; k++) tasks.push(task(`p${i}-${k}`, { project_id: `p${i}`, completed_at: at('2026-10-05') })) })
    const t = timeOf(model(tasks, { projects: counts.map((_, i) => project(`p${i}`, `Project ${i}`)) }), periodFor('this-month', TODAY, 1))
    expect(t.kind).toBe('completed')
    expect(t.rows.map((r) => [r.name, r.value])).toEqual([['Project 0', 7], ['Project 1', 6], ['Project 2', 5], ['Project 3', 4], ['Project 4', 3], ['Other', 3]])
  })

  it('Tracked per project: "Client A 3h" and "Inbox 40m"', () => {
    const tasks = [task('a', { project_id: 'client' }), task('b')]
    const entries = [entry('1', 'a', at('2026-10-12', 9), 180), entry('2', 'b', at('2026-10-13', 9), 40)]
    const t = timeOf(model(tasks, { entries, projects: [project('client', 'Client A')] }), periodFor('this-week', TODAY, 1))
    expect(t).toEqual({ kind: 'tracked', rows: [{ id: 'client', name: 'Client A', value: 180 }, { id: '', name: 'Inbox', value: 40 }] })
  })

  it('Heatmap independent of the period: 53 weeks from the first day of the week, future days empty', () => {
    const m = model([task('a', { completed_at: at('2026-10-12') }), task('b', { completed_at: at('2026-10-12', 15) }), task('c', { completed_at: at('2025-10-13') })])
    const h = heatmapOf(m)
    expect(h.weeks).toHaveLength(53)
    expect(h.weeks[0][0]!.date).toBe('2025-10-13')
    expect(h.weeks[52].map((c) => c?.date ?? null)).toEqual(['2026-10-12', '2026-10-13', TODAY, null, null, null, null])
    expect(h.total).toBe(3)
    expect(h.busiest).toMatchObject({ date: '2026-10-12', count: 2 })
    expect(dashboardOf(m, periodFor('this-year', TODAY, 1), comparisonOf(periodFor('this-year', TODAY, 1), 1)).heatmap).toEqual(h)
  })

  it('heatmap levels: zero is level 0, the busiest days the top level', () => {
    const tasks: Task[] = []
    const perDay = [1, 1, 2, 3, 5, 8]
    perDay.forEach((n, i) => { for (let k = 0; k < n; k++) tasks.push(task(`${i}-${k}`, { completed_at: at(`2026-10-0${i + 1}`) })) })
    const cells = heatmapOf(model(tasks)).weeks.flat().filter((c) => c && c.date >= '2026-10-01' && c.date <= '2026-10-07')
    expect(cells.map((c) => c!.level)).toEqual([1, 1, 2, 3, 4, 4, 0])
  })

  it('Weekday and hour with a day start: Thursday 01:30 counts on Wednesday in the 01:00 column, laid out after 23:00', () => {
    const m = buildModel({ tasks: [task('a', { completed_at: at('2026-10-15', 1, 30) })], projects: [], shared: new Set(), me: 'me', today: '2026-10-16', weekStart: 1, dayStart: 240 })
    const g = hoursOf(m, periodFor('this-week', '2026-10-16', 1))
    expect(g.hours[0]).toBe(4)
    expect(g.hours.indexOf(1)).toBe(21)
    expect(g.hours.indexOf(1)).toBeGreaterThan(g.hours.indexOf(23))
    const row = g.weekdays.indexOf(3) // Wednesday
    expect(g.counts[row][g.hours.indexOf(1)]).toBe(1)
    expect(g.total).toBe(1)
  })
})

describe('estimates', () => {
  const entries = (pairs: [string, number][]) => pairs.map(([id, m], i) => entry(`e${i}`, id, at('2026-10-05', 9), m))
  it('the median of tracked ÷ estimate over tasks with an estimate and at least 5 tracked minutes', () => {
    const tasks = ['a', 'b', 'c', 'd'].map((id) => task(id, { estimate_minutes: 60, completed_at: at('2026-10-06') }))
    const e = estimatesOf(model(tasks, { entries: entries([['a', 60], ['b', 90], ['c', 120], ['d', 4]]) }), periodFor('this-month', TODAY, 1))
    expect(e).toMatchObject({ ok: true, median: 1.5, count: 3 })
  })

  it('groups: projects and labels with at least three tasks, furthest from 1 first, at most three', () => {
    const tasks = [
      ...['w1', 'w2', 'w3'].map((id) => task(id, { project_id: 'write', estimate_minutes: 30, completed_at: at('2026-10-06') })),
      ...['c1', 'c2', 'c3'].map((id) => task(id, { project_id: 'code', labels: ['deep'], estimate_minutes: 60, completed_at: at('2026-10-06') })),
      task('x', { project_id: 'code', estimate_minutes: 60, completed_at: at('2026-10-06') }),
    ]
    const m = model(tasks, {
      projects: [project('write', 'Writing'), project('code', 'Code')], labels: [{ id: 'deep', name: 'deep-work' }],
      entries: entries([['w1', 60], ['w2', 60], ['w3', 60], ['c1', 66], ['c2', 66], ['c3', 66], ['x', 60]]),
    })
    const e = estimatesOf(m, periodFor('this-month', TODAY, 1))
    if (!e.ok) throw new Error('expected estimates')
    expect(e.groups.map((g) => [g.kind, g.name, Math.round(g.median * 100) / 100, g.count])).toEqual([
      // Code and deep-work are equally far from 1; ties go by name.
      ['project', 'Writing', 2, 3], ['project', 'Code', 1.1, 4], ['label', 'deep-work', 1.1, 3],
    ])
  })

  it('Estimates need enough tasks: two are not enough', () => {
    const tasks = ['a', 'b'].map((id) => task(id, { estimate_minutes: 60, completed_at: at('2026-10-06') }))
    expect(estimatesOf(model(tasks, { entries: entries([['a', 60], ['b', 60]]) }), periodFor('this-month', TODAY, 1))).toEqual({ ok: false, count: 2 })
  })
})

describe('excluded rows and shared projects (task 2.4)', () => {
  it('a task completed by another member and a trashed task count in no measure', () => {
    const tasks = [
      task('by-ana', { project_id: 's', completed_by: 'ana', assignee_id: 'me', due: { date: TODAY }, estimate_minutes: 30, completed_at: at('2026-10-13') }),
      task('trashed', { deleted_at: at('2026-10-13'), due: { date: TODAY }, estimate_minutes: 30, completed_at: at('2026-10-13') }),
      task('in-gone', { project_id: 'gone', due: { date: TODAY }, completed_at: at('2026-10-13') }),
    ]
    const m = model(tasks, { shared: new Set(['s']), projects: [project('s', 'Household'), project('gone', 'Gone', { deleted_at: 1 })], entries: [entry('1', 'trashed', at('2026-10-13', 9), 30)] })
    const d = dashboardOf(m, periodFor('this-week', TODAY, 1), comparisonOf(periodFor('this-week', TODAY, 1), 1))
    expect([d.tiles.done.value, d.tiles.onTime.dated, d.tiles.streak.current, d.tiles.tracked.minutes, d.heatmap.total, d.hours.total, d.time.rows.length]).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(d.estimates).toEqual({ ok: false, count: 0 })
  })

  it('the done tile matches the headline count of lib/stats for every period', () => {
    const tasks = Array.from({ length: 60 }, (_, i) => task(`t${i}`, { completed_at: at(TODAY) - i * 86_400_000 * 3, series_id: i % 5 === 0 ? 's' : null }))
    const m = model(tasks)
    for (const kind of ['this-week', 'this-month', 'this-quarter', 'this-year', 'last-week'] as const) {
      const p = periodFor(kind, TODAY, 1)
      expect(tilesOf(m, p, comparisonOf(p, 1)).done.value).toBe(compute({ tasks, projects: [], shared: new Set(), me: 'me', today: TODAY }, p, 1).completed)
    }
  })
})

describe('large accounts (design D8)', () => {
  it('20,000 tasks and 5,000 entries: one pass and every period sliced well within the budget', () => {
    const base = at(TODAY)
    const tasks: Task[] = []
    for (let i = 0; i < 20_000; i++) {
      const done = i % 3 !== 0
      tasks.push(task(`t${i}`, {
        project_id: `p${i % 12}`, labels: i % 4 === 0 ? ['l1'] : [], estimate_minutes: i % 2 ? 30 : null,
        created_at: base - (i % 700) * 86_400_000, completed_at: done ? base - (i % 400) * 86_400_000 + (i % 24) * 3_600_000 : null,
        due: i % 5 === 0 ? { date: '2026-06-01' } : null,
      }))
    }
    const entries = Array.from({ length: 5_000 }, (_, i) => entry(`e${i}`, `t${i * 3 + 1}`, base - (i % 300) * 86_400_000, 25))
    const projects = Array.from({ length: 12 }, (_, i) => project(`p${i}`, `Project ${i}`))
    const t0 = performance.now()
    const m = buildModel({ tasks, projects, shared: new Set(), me: 'me', today: TODAY, weekStart: 1, dayStart: 0, entries, now: base, labels: [{ id: 'l1', name: 'one' }] })
    const built = performance.now() - t0
    const t1 = performance.now()
    for (const kind of ['this-week', 'this-month', 'this-quarter', 'this-year', 'last-week'] as const) {
      const p = periodFor(kind, TODAY, 1)
      dashboardOf(m, p, comparisonOf(p, 1))
    }
    const sliced = performance.now() - t1
    // Budget from the spec: under 50 ms for the pass on a laptop; the bound here leaves room for a busy CI runner.
    if (process.env.PERF) console.log(`model ${built.toFixed(1)} ms, five periods ${sliced.toFixed(1)} ms`)
    expect(built).toBeLessThan(250)
    expect(sliced).toBeLessThan(250)
  })
})
