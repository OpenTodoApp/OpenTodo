// The Year view's counts (OpenSpec change year-view, task 2.2): the density steps, what
// counts (open tasks in the viewer's zone, projected occurrences, every day of a span) and
// what does not (completed work, events, which are never passed in), and the estimates.
import { describe, expect, it } from 'vitest'
import { densityStep, yearCounts } from './yearView'
import { addMonthsISO, monthEnd, stackedMonths } from './month'
import { parseMonthsShown } from './calendarMode'
import { viewedTask } from './dates'
import type { Task } from './types'
import { bandLayout } from '../app/calendar/spanModel'
import { spanOf } from './span'

let n = 0
function task(over: Partial<Task>): Task {
  n++
  return {
    id: `t${n}`, project_id: null, section_id: null, parent_id: null, title: `Task ${n}`, notes: '', priority: 4, position: n, due: null, deadline: null,
    recurrence: null, series_id: null, estimate_minutes: null, completed_at: null, deleted_at: null, labels: [], created_at: 0, updated_at: 0,
    ...over,
  } as Task
}

const year = { today: '2026-11-01', from: '2026-01-01', to: '2026-12-31' }

describe('density steps', () => {
  it('uses fixed thresholds: none, 1–2, 3–5, 6 or more', () => {
    expect([0, 1, 2, 3, 5, 6, 40].map(densityStep)).toEqual([0, 1, 1, 2, 2, 3, 3])
  })

  it('Steps: the 2nd has no mark, the 3rd, 4th and 5th the first, second and third step', () => {
    const tasks = [
      ...Array.from({ length: 2 }, () => task({ due: { date: '2026-11-03' } })),
      ...Array.from({ length: 4 }, () => task({ due: { date: '2026-11-04' } })),
      ...Array.from({ length: 7 }, () => task({ due: { date: '2026-11-05' } })),
    ]
    const c = yearCounts({ tasks, series: [], records: tasks, ...year })
    expect(c.get('2026-11-02')).toBeUndefined()
    expect(['2026-11-03', '2026-11-04', '2026-11-05'].map((d) => densityStep(c.get(d)!.count))).toEqual([1, 2, 3])
    expect(c.get('2026-11-05')!.titles).toHaveLength(3)
  })
})

describe('what counts', () => {
  it('Recurring and spanning tasks count: every Monday from the 2nd, and each day of a span', () => {
    const weekly = task({ title: 'Standup', due: { date: '2026-11-02' }, recurrence: 'every monday' })
    const trip = task({ title: 'Trip', start: '2026-11-10', due: { date: '2026-11-12' }, span: true, estimate_minutes: 120 })
    const tasks = [weekly, trip]
    const c = yearCounts({ tasks, series: [weekly], records: tasks, ...year })
    for (const d of ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-28']) expect(c.get(d)?.count, d).toBe(1)
    expect(c.get('2026-10-26')).toBeUndefined()
    expect(['2026-11-10', '2026-11-11', '2026-11-12'].map((d) => c.get(d)?.count)).toEqual([1, 1, 1])
    // A span's estimate is on its due day only.
    expect(['2026-11-10', '2026-11-12'].map((d) => c.get(d)?.minutes)).toEqual([0, 120])
    // Without the series (the switch off), the projections do not count; the current occurrence still does.
    const off = yearCounts({ tasks, series: [], records: tasks, ...year })
    expect(off.get('2026-11-02')?.count).toBe(1)
    expect(off.get('2026-11-09')).toBeUndefined()
  })

  it('a daily series counts on every day of the year after its current one, past the per-range cap', () => {
    const daily = task({ due: { date: '2026-01-01' }, recurrence: 'every day', estimate_minutes: 30 })
    const c = yearCounts({ tasks: [daily], series: [daily], records: [daily], ...year, today: '2026-01-01' })
    expect(c.size).toBe(365)
    expect([...c.values()].every((d) => d.count === 1 && d.minutes === 30)).toBe(true)
  })

  it('counts by the viewer\'s day, leaves completed tasks and those the filter drops out of the count but not the estimates', () => {
    const tokyo = task({ due: { date: '2026-11-12', time: '02:00', tz: 'Asia/Tokyo' } })
    const done = task({ due: { date: '2026-11-13' }, completed_at: 1 })
    const hidden = task({ due: { date: '2026-11-14' }, estimate_minutes: 60, labels: ['x'] })
    // The view passes its rows in the viewer's zone, as Month does.
    const c = yearCounts({ tasks: [viewedTask(tokyo, 'Europe/Berlin'), done, hidden], keeps: (tk) => tk.labels.length === 0, series: [], records: [], ...year, zone: 'Europe/Berlin' })
    expect(c.get('2026-11-11')?.count).toBe(1)
    expect(c.get('2026-11-12')).toBeUndefined()
    expect(c.get('2026-11-13')).toBeUndefined()
    expect(c.get('2026-11-14')).toEqual({ count: 0, minutes: 60, titles: [] })
  })

  it('Events do not count: a day with only meetings has no entry (events are never an input)', () => {
    expect(yearCounts({ tasks: [], series: [], records: [], ...year }).size).toBe(0)
  })
})

describe('month helpers', () => {
  it('steps months clamped, ends months, and stacks months with their own weeks', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsISO('2026-11-18', 12)).toBe('2027-11-18')
    expect(monthEnd('2026-02')).toBe('2026-02-28')
    const three = stackedMonths('2026-11-18', 3, 1)
    expect(three.map((m) => m.month)).toEqual(['2026-11', '2026-12', '2027-01'])
    // November 2026 starts on a Sunday: six week rows, each holding a day of November.
    expect(three[0].weeks.every((w) => w.some((d) => d.startsWith('2026-11')))).toBe(true)
    expect(stackedMonths('2026-11-18', 1, 1)[0].weeks).toHaveLength(6)
  })

  it('reads the months shown: 1, 2, 3 or 6, else 1', () => {
    expect([null, '2', '3', '6', '4', 'x'].map(parseMonthsShown)).toEqual([1, 2, 3, 6, 1, 1])
  })
})

describe('a span in stacked months (year-view D1)', () => {
  it('is cut to the row\'s month and reads as going on past it', () => {
    const trip = task({ start: '2026-11-29', due: { date: '2026-12-02' }, span: true })
    const spans = [{ kind: 'task' as const, id: trip.id, task: trip, span: spanOf(trip)! }]
    const week = ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']
    const nov = bandLayout(week, spans, 3, { from: '2026-11-01', to: '2026-11-30' })
    expect(nov.pieces.map((p) => [p.col, p.cols, p.startsBefore, p.endsAfter])).toEqual([[0, 1, true, true]])
    const dec = bandLayout(week, spans, 3, { from: '2026-12-01', to: '2026-12-31' })
    expect(dec.pieces.map((p) => [p.col, p.cols, p.startsBefore, p.endsAfter])).toEqual([[1, 2, true, false]])
    expect(bandLayout(week, spans, 3, { from: '2027-01-01', to: '2027-01-31' }).lanes).toBe(0)
  })
})
