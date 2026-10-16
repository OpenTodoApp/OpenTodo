// Period date expressions and completion date terms (OpenSpec change
// `completed-date-filters`, tasks 1.1 and 1.2).
import { describe, expect, it } from 'vitest'
import { resolveDateTime } from '../dates'
import type { Project, Task } from '../types'
import { compile, mentionsState, runFilter, type FilterContext } from './evaluate'
import { FilterSyntaxError, parse, printQuery, resolveDate, resolveRange, type DateExpr, type Node } from './parse'

/** Local-time Unix ms for a calendar date at an hour. */
const at = (iso: string, hour = 12, minute = 0) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, hour, minute).getTime()
}

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [],
    position: 0, created_at: at('2026-09-01'), completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null,
    series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...extra,
  }
}

function ids(q: string, tasks: Task[], ctx: FilterContext): string[] {
  const r = runFilter(q, tasks, ctx)
  if (!r.ok) throw new Error(r.error)
  return r.tasks.map((t) => t.id).sort()
}
const sorted = (...xs: string[]) => xs.sort()

function errorOf(q: string): FilterSyntaxError {
  try {
    parse(q)
  } catch (e) {
    expect(e).toBeInstanceOf(FilterSyntaxError)
    return e as FilterSyntaxError
  }
  throw new Error(`expected "${q}" to fail`)
}

const dateOf = (q: string): DateExpr => (parse(`due = ${q}`) as Extract<Node, { kind: 'date' }>).date
const rangeOf = (q: string, today: string, weekStart = 1) => resolveRange(dateOf(q), today, weekStart)
const show = (q: string) => printQuery(parse(q)!)

describe('period expressions: parsing and printing', () => {
  it('parses this / last / next week and month, and N weeks or months ago, ignoring case', () => {
    expect(dateOf('this week')).toEqual({ type: 'period', unit: 'week', offset: 0 })
    expect(dateOf('Last Month')).toEqual({ type: 'period', unit: 'month', offset: -1 })
    expect(dateOf('next week')).toEqual({ type: 'period', unit: 'week', offset: 1 })
    expect(dateOf('next MONTH')).toEqual({ type: 'period', unit: 'month', offset: 1 })
    expect(dateOf('3 weeks ago')).toEqual({ type: 'period', unit: 'week', offset: -3 })
    expect(dateOf('1 week ago')).toEqual({ type: 'period', unit: 'week', offset: -1 })
    expect(dateOf('2 months ago')).toEqual({ type: 'period', unit: 'month', offset: -2 })
    expect(dateOf('1 month ago')).toEqual({ type: 'period', unit: 'month', offset: -1 })
    expect(dateOf('0 weeks ago')).toEqual({ type: 'period', unit: 'week', offset: 0 })
  })

  it('round-trips every new form through printQuery', () => {
    for (const q of ['due = this week', 'created >= last month', 'deadline < next week', 'start <= next month', 'completed = 3 weeks ago',
      'completed > 2 months ago & p1', 'completed before yesterday', 'completed after 2026-10-01', '!(completed >= this week) | open']) {
      const ast = parse(q)!
      expect(parse(printQuery(ast)), q).toEqual(ast)
    }
    expect(show('completed after last week')).toBe('completed > last week')
    expect(show('COMPLETED >= this month')).toBe('completed >= this month')
    expect(show('due = 1 weeks ago')).toBe('due = last week')
    expect(show('due = 4 months ago')).toBe('due = 4 months ago')
  })

  it('keeps completed as the state keyword without a comparison', () => {
    expect(parse('completed')).toEqual({ kind: 'keyword', keyword: 'completed' })
    expect(parse('p1 & completed')).toEqual({ kind: 'and', items: [{ kind: 'priority', value: 1 }, { kind: 'keyword', keyword: 'completed' }] })
    expect(parse('completed | open')).toMatchObject({ kind: 'or' })
    expect(parse('completed <= today')).toEqual({ kind: 'date', field: 'completed', op: '<=', date: { type: 'relative', days: 0 } })
    expect(parse('completed before monday')).toEqual({ kind: 'date', field: 'completed', op: '<', date: { type: 'weekday', day: 1 } })
  })

  it('reports incomplete periods and completion terms in the usual style', () => {
    expect(errorOf('due = this').message).toBe('Expected "week" or "month" after "this" at position 7')
    expect(errorOf('due = last year').message).toBe('Expected "week" or "month" after "last" at position 7')
    expect(errorOf('due = next').expected).toEqual(['"week"', '"month"'])
    expect(errorOf('completed > 2 weeks').message).toBe('Expected "ago" after "weeks" at position 15')
    expect(errorOf('completed > 2 months & p1').message).toBe('Expected "ago" after "months" at position 15')
    expect(errorOf('due > 7 years ago').message).toBe('Expected "days", "weeks" or "months" after "7" at position 7')
    expect(errorOf('completed after').message).toBe('Expected a date after "after" at position 11')
    expect(errorOf('completed = someday').message).toBe('Invalid date "someday" at position 13')
    expect(errorOf('completed today').message).toBe('Expected "&" or "|" before "today" at position 11')
  })
})

describe('period expressions: resolution', () => {
  it('weeks start on the preferred first day', () => {
    // Friday 2026-10-16.
    expect(rangeOf('this week', '2026-10-16', 1)).toEqual({ start: '2026-10-12', end: '2026-10-18' })
    expect(rangeOf('this week', '2026-10-16', 0)).toEqual({ start: '2026-10-11', end: '2026-10-17' })
    expect(rangeOf('this week', '2026-10-16', 6)).toEqual({ start: '2026-10-10', end: '2026-10-16' })
    expect(rangeOf('last week', '2026-10-16', 1)).toEqual({ start: '2026-10-05', end: '2026-10-11' })
    expect(rangeOf('next week', '2026-10-16', 0)).toEqual({ start: '2026-10-18', end: '2026-10-24' })
    expect(rangeOf('2 weeks ago', '2026-10-16', 1)).toEqual({ start: '2026-09-28', end: '2026-10-04' })
    // Today on the first or last day of a week.
    expect(rangeOf('this week', '2026-10-12', 1).start).toBe('2026-10-12')
    expect(rangeOf('this week', '2026-10-11', 1)).toEqual({ start: '2026-10-05', end: '2026-10-11' })
    expect(rangeOf('this week', '2026-10-11', 0)).toEqual({ start: '2026-10-11', end: '2026-10-17' })
    // Across a year end.
    expect(rangeOf('this week', '2027-01-01', 1)).toEqual({ start: '2026-12-28', end: '2027-01-03' })
  })

  it('months are calendar months, across short months, leap years and year ends', () => {
    expect(rangeOf('this month', '2026-10-16')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(rangeOf('last month', '2026-10-16')).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(rangeOf('last month', '2026-03-31')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(rangeOf('2 months ago', '2026-03-31')).toEqual({ start: '2026-01-01', end: '2026-01-31' })
    expect(rangeOf('last month', '2028-03-15')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    expect(rangeOf('last month', '2027-01-05')).toEqual({ start: '2026-12-01', end: '2026-12-31' })
    expect(rangeOf('next month', '2026-12-31')).toEqual({ start: '2027-01-01', end: '2027-01-31' })
    expect(rangeOf('13 months ago', '2026-10-16')).toEqual({ start: '2025-09-01', end: '2025-09-30' })
  })

  it('a day expression is a range of one day; resolveDate gives a period its first day', () => {
    expect(rangeOf('friday', '2026-10-10')).toEqual({ start: '2026-10-16', end: '2026-10-16' })
    expect(rangeOf('3 days ago', '2026-10-10')).toEqual({ start: '2026-10-07', end: '2026-10-07' })
    expect(resolveDate(dateOf('last month'), '2026-10-16')).toBe('2026-09-01')
  })
})

// Friday 2026-10-16.
const FRI = '2026-10-16'
const MON: FilterContext = { today: FRI, labels: [], projects: [], weekStart: 1 }
const SUN: FilterContext = { ...MON, weekStart: 0 }

describe('period expressions: evaluation', () => {
  const tasks: Task[] = [
    task('sep-30', { due: { date: '2026-09-30' } }),
    task('oct-01', { due: { date: '2026-10-01' } }),
    task('oct-11', { due: { date: '2026-10-11' } }),
    task('oct-12', { due: { date: '2026-10-12' } }),
    task('oct-18', { due: { date: '2026-10-18' } }),
    task('oct-19', { due: { date: '2026-10-19' } }),
    task('nov-01', { due: { date: '2026-11-01' } }),
    task('undated'),
  ]

  it('compares a due date with a period using every operator', () => {
    expect(ids('due = this week', tasks, MON)).toEqual(sorted('oct-12', 'oct-18'))
    expect(ids('due = this week', tasks, SUN)).toEqual(sorted('oct-11', 'oct-12'))
    expect(ids('due < this week', tasks, MON)).toEqual(sorted('sep-30', 'oct-01', 'oct-11'))
    expect(ids('due before this week', tasks, MON)).toEqual(sorted('sep-30', 'oct-01', 'oct-11'))
    expect(ids('due <= this week', tasks, MON)).toEqual(sorted('sep-30', 'oct-01', 'oct-11', 'oct-12', 'oct-18'))
    expect(ids('due >= this week', tasks, MON)).toEqual(sorted('oct-12', 'oct-18', 'oct-19', 'nov-01'))
    expect(ids('due > this week', tasks, MON)).toEqual(sorted('oct-19', 'nov-01'))
    expect(ids('due after this week', tasks, MON)).toEqual(sorted('oct-19', 'nov-01'))
    expect(ids('due = next week', tasks, MON)).toEqual(['oct-19'])
    expect(ids('due >= last month & due < this month', tasks, MON)).toEqual(['sep-30'])
    expect(ids('due <= last month', tasks, MON)).toEqual(['sep-30'])
    expect(ids('due = this month', tasks, MON)).toEqual(sorted('oct-01', 'oct-11', 'oct-12', 'oct-18', 'oct-19'))
  })

  it('works on deadline, start and created', () => {
    const more = [
      task('d', { deadline: '2026-10-14', start: '2026-10-20', created_at: at('2026-09-15') }),
      task('e', { deadline: '2026-10-25', start: 'someday', created_at: at('2026-10-12', 0) }),
    ]
    expect(ids('deadline = this week', more, MON)).toEqual(['d'])
    expect(ids('start = next week', more, MON)).toEqual(['d'])
    expect(ids('created = last month', more, MON)).toEqual(['d'])
    expect(ids('created >= this week', more, MON)).toEqual(['e'])
    expect(ids('created = 2 months ago', [task('c', { created_at: at('2026-01-31', 23, 59) })], { ...MON, today: '2026-03-31' })).toEqual(['c'])
  })

  it('defaults the week start to the date-time preference snapshot', () => {
    const sunTask = [task('sun', { due: { date: '2026-10-11' } })]
    const snapshot = ids('due = this week', sunTask, { today: FRI, labels: [], projects: [] })
    const sunday = resolveDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' }).weekStart === 0
    expect(snapshot).toEqual(sunday ? ['sun'] : ids('due = this week', sunTask, { ...MON, weekStart: resolveDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' }).weekStart }))
  })
})

describe('completion date terms', () => {
  const projects: Project[] = [{ id: 'p-home', name: 'Home', color: '#000', position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {} }]
  const tasks: Task[] = [
    task('open'),
    task('early-mon', { completed_at: at('2026-10-05', 0) }),
    task('late-sun', { completed_at: at('2026-10-11', 23, 59) }),
    task('this-mon', { completed_at: at('2026-10-12', 0) }),
    task('today', { completed_at: at(FRI, 9), project_id: 'p-home' }),
    task('september', { completed_at: at('2026-09-30') }),
    task('occurrence', { completed_at: at('2026-10-07'), series_id: 'series' }),
    task('trashed', { completed_at: at('2026-10-07'), deleted_at: at('2026-10-08') }),
  ]

  it('compares the local completion day and implies completed tasks', () => {
    expect(ids('completed = last week', tasks, MON)).toEqual(sorted('early-mon', 'late-sun', 'occurrence'))
    expect(ids('completed = last week', tasks, SUN)).toEqual(sorted('early-mon', 'occurrence'))
    expect(ids('completed >= this week', tasks, MON)).toEqual(sorted('this-mon', 'today'))
    expect(ids('completed = today', tasks, MON)).toEqual(['today'])
    expect(ids('completed < this month', tasks, MON)).toEqual(['september'])
    // 7 days ago is Friday 2026-10-09.
    expect(ids('completed > 7 days ago', tasks, MON)).toEqual(sorted('late-sun', 'this-mon', 'today'))
    expect(ids('completed >= 7 days ago & #Home', tasks, { ...MON, projects })).toEqual(['today'])
    expect(ids('completed = 2026-10-12', tasks, MON)).toEqual(['this-mon'])
    expect(ids('completed <= 2026-10-11 & completed >= 2026-10-11', tasks, MON)).toEqual(['late-sun'])
  })

  it('counts as mentioning state; its negation includes open tasks', () => {
    expect(mentionsState(parse('completed >= this week')!)).toBe(true)
    expect(mentionsState(parse('p1 | !(completed < today)')!)).toBe(true)
    expect(mentionsState(parse('created >= this week')!)).toBe(false)
    expect(ids('!(completed >= this week)', tasks, MON)).toEqual(sorted('open', 'early-mon', 'late-sun', 'september', 'occurrence'))
  })

  it('follows a reopening on the next evaluation', () => {
    const after = tasks.map((t) => (t.id === 'today' ? { ...t, completed_at: null } : t))
    const { test } = compile(parse('completed >= this week')!, MON)
    expect(tasks.filter(test).map((t) => t.id).sort()).toEqual(sorted('this-mon', 'today'))
    expect(after.filter(test).map((t) => t.id)).toEqual(['this-mon'])
  })
})
