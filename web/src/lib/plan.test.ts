// The Plan math (OpenSpec change planner-view, tasks 1.1 and 1.2): the span, the
// three sources of a day's load, merged meetings, and projected occurrences pinned
// to the shared recurrence vectors.
import { describe, expect, it } from 'vitest'
import { occurrenceId } from './ids'
import { columnEntries, eventMinutes, followAnchor, formatPlanLoad, planLoad, planLoadTooltip, planSeries, projectedOccurrences, spanDates } from './plan'
import vectors from './recurrence.vectors.json'
import type { CalendarEvent, Task } from './types'

function task(p: Partial<Task> = {}): Task {
  return {
    id: 't', title: 'T', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
    created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...p,
  }
}
function ev(id: string, start: CalendarEvent['start'], end: CalendarEvent['end'], extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return { id, subscriptionId: 's', uid: id, summary: id, location: '', start, end, allDay: false, free: false, ...extra }
}

describe('span', () => {
  it('lists consecutive days from the anchor', () => {
    expect(spanDates('2026-10-12', 14)).toHaveLength(14)
    expect(spanDates('2026-10-12', 14).at(-1)).toBe('2026-10-25')
    expect(spanDates('2026-10-30', 7)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'])
  })

  it('follows a date out of the span by whole weeks', () => {
    expect(followAnchor('2026-10-12', 14, '2026-10-20')).toBe('2026-10-12')
    expect(followAnchor('2026-10-12', 14, '2026-10-26')).toBe('2026-10-19')
    expect(followAnchor('2026-10-12', 14, '2026-11-02')).toBe('2026-10-26')
    expect(followAnchor('2026-10-12', 14, '2026-10-11')).toBe('2026-10-05')
    expect(followAnchor('2026-10-12', 7, '2026-10-04')).toBe('2026-09-28')
  })
})

describe('event minutes', () => {
  it('counts overlapping meetings once', () => {
    const list = [ev('a', { date: '2026-10-12', time: '10:00' }, { date: '2026-10-12', time: '11:00' }), ev('b', { date: '2026-10-12', time: '10:30' }, { date: '2026-10-12', time: '11:30' })]
    expect(eventMinutes(list, '2026-10-12')).toBe(90)
  })

  it('splits an event across midnight', () => {
    const late = [ev('late', { date: '2026-10-12', time: '22:00' }, { date: '2026-10-13', time: '02:00' })]
    expect(eventMinutes(late, '2026-10-12')).toBe(120)
    expect(eventMinutes(late, '2026-10-13')).toBe(120)
    expect(eventMinutes(late, '2026-10-14')).toBe(0)
  })

  it('leaves out all-day, free and zero-length events, and counts short ones at their length', () => {
    const list = [
      ev('day', { date: '2026-10-12' }, { date: '2026-10-13' }, { allDay: true }),
      ev('free', { date: '2026-10-12', time: '09:00' }, { date: '2026-10-12', time: '12:00' }, { free: true }),
      ev('zero', { date: '2026-10-12', time: '13:00' }, { date: '2026-10-12', time: '13:00' }),
      ev('short', { date: '2026-10-12', time: '14:00' }, { date: '2026-10-12', time: '14:05' }),
    ]
    expect(eventMinutes(list, '2026-10-12')).toBe(5)
    expect(eventMinutes([], '2026-10-12')).toBe(0)
  })

  it('reads zoned events in the viewer\'s zone', () => {
    const tokyo = [ev('tk', { date: '2026-10-13', time: '01:00', tz: 'Asia/Tokyo' }, { date: '2026-10-13', time: '02:00', tz: 'Asia/Tokyo' })]
    expect(eventMinutes(tokyo, '2026-10-12', 'Europe/Berlin')).toBe(60)
    expect(eventMinutes(tokyo, '2026-10-13', 'Europe/Berlin')).toBe(0)
  })
})

describe('day load', () => {
  const day = '2026-10-12'
  const tasks = [
    task({ id: 'a', due: { date: day }, estimate_minutes: 120 }),
    task({ id: 'b', due: { date: day, time: '14:00' }, estimate_minutes: 50 }),
    ...Array.from({ length: 5 }, (_, i) => task({ id: `u${i}`, due: { date: day } })),
    task({ id: 'other', due: { date: '2026-10-13' }, estimate_minutes: 600 }),
  ]
  const meeting = [ev('m', { date: day, time: '10:00' }, { date: day, time: '11:30' })]
  const weekly = projectedOccurrences([task({ id: 'w', recurrence: 'every monday', due: { date: '2026-10-05' }, estimate_minutes: 45 })], [], '2026-10-05', day, day)

  it('sums three sources: Three sources on one day', () => {
    expect(weekly).toHaveLength(1)
    const load = planLoad(tasks, weekly, meeting, day, 480)
    expect(load).toEqual({ tasks: 170, events: 90, projected: 45, unestimated: 5, total: 305, over: false })
    expect(formatPlanLoad(load, 480)).toBe('5h 5m / 8h')
    expect(planLoadTooltip(load, 480)).toBe('2h 50m of tasks, 1h 30m in calendar events, 45m repeating · 5 tasks without estimate')
  })

  it('counts no event minutes when calendars are hidden', () => {
    const load = planLoad(tasks, weekly, [], day, 480)
    expect(load.events).toBe(0)
    expect(formatPlanLoad(load, 480)).toBe('3h 35m / 8h')
    expect(planLoadTooltip(load, 480)).toBe('2h 50m of tasks, 45m repeating · 5 tasks without estimate')
  })

  it('marks a day over capacity', () => {
    const load = planLoad([task({ due: { date: day }, estimate_minutes: 7 * 60 + 30 })], [], meeting, day, 480)
    expect(load.over).toBe(true)
    expect(formatPlanLoad(load, 480)).toBe('9h / 8h')
    expect(planLoadTooltip(load, 480)).toBe('Over capacity. 7h 30m of tasks, 1h 30m in calendar events')
  })

  it('leaves completed and deleted tasks out and names an empty day', () => {
    const load = planLoad([task({ due: { date: day }, estimate_minutes: 60, completed_at: 1 }), task({ due: { date: day }, estimate_minutes: 60, deleted_at: 1 })], [], [], day, 480)
    expect(load.total).toBe(0)
    expect(planLoadTooltip(load, 480)).toBe('Nothing estimated against a 8h day')
  })
})

describe('projected occurrences', () => {
  it('Weekly report: the Mondays after the current one inside the span', () => {
    const report = task({ id: 'r', title: 'Weekly report', recurrence: 'every monday', due: { date: '2026-10-12' }, estimate_minutes: 45 })
    const span = spanDates('2026-10-12', 21)
    const out = projectedOccurrences([report], [report], '2026-10-12', span[0], span.at(-1)!)
    expect(out.map((p) => p.date)).toEqual(['2026-10-19', '2026-10-26'])
    expect(out[0]).toMatchObject({ id: 'proj:r:2026-10-19', seriesId: 'r', title: 'Weekly report', estimate_minutes: 45 })
    // With 14 days the span ends on the 25th.
    expect(projectedOccurrences([report], [report], '2026-10-12', '2026-10-12', '2026-10-25').map((p) => p.date)).toEqual(['2026-10-19'])
  })

  it('Projection follows the series: computed from the new due date', () => {
    const moved = task({ id: 'r', recurrence: 'every monday', due: { date: '2026-10-13' } })
    expect(projectedOccurrences([moved], [moved], '2026-10-12', '2026-10-12', '2026-11-01').map((p) => p.date)).toEqual(['2026-10-19', '2026-10-26'])
  })

  it('End condition: for 3 times with two done draws nothing', () => {
    const series = task({ id: 's', recurrence: 'every day for 3 times', due: { date: '2026-10-12' } })
    const done = ['2026-10-10', '2026-10-11'].map((d) => task({ id: occurrenceId('s', d), series_id: 's', due: { date: d }, completed_at: 1 }))
    expect(projectedOccurrences([series], [series, ...done], '2026-10-12', '2026-10-12', '2026-10-25')).toEqual([])
    // With one done, one more occurrence follows.
    expect(projectedOccurrences([series], [series, done[0]], '2026-10-12', '2026-10-12', '2026-10-25').map((p) => p.date)).toEqual(['2026-10-13'])
  })

  it('an until date stops the projection', () => {
    const series = task({ id: 'u', recurrence: 'every day until 2026-10-14', due: { date: '2026-10-12' } })
    expect(projectedOccurrences([series], [series], '2026-10-12', '2026-10-12', '2026-10-25').map((p) => p.date)).toEqual(['2026-10-13', '2026-10-14'])
  })

  it('Completion-relative rule: as if each were completed on its day', () => {
    const series = task({ id: 'c', recurrence: 'every 3 days after completion', due: { date: '2026-10-14' } })
    expect(projectedOccurrences([series], [series], '2026-10-12', '2026-10-12', '2026-10-21').map((p) => p.date)).toEqual(['2026-10-17', '2026-10-20'])
  })

  it('Catch-up series: from tomorrow, the next occurrence after today', () => {
    const series = task({ id: 'd', recurrence: 'every day', due: { date: '2026-10-07' } })
    const out = projectedOccurrences([series], [series], '2026-10-12', '2026-10-12', '2026-10-15')
    expect(out.map((p) => p.date)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15'])
  })

  it('keeps the time and draws a zoned time in the viewer\'s zone', () => {
    const series = task({ id: 'z', recurrence: 'every week', due: { date: '2026-10-12', time: '02:00', tz: 'Asia/Tokyo' } })
    const out = projectedOccurrences([series], [series], '2026-10-12', '2026-10-12', '2026-10-25', 'Europe/Berlin')
    // The 19th and 26th at 02:00 in Tokyo are the 18th and 25th in Berlin (summer time ends on the 25th).
    expect(out.map((p) => [p.date, p.time])).toEqual([['2026-10-18', '19:00'], ['2026-10-25', '18:00']])
  })

  it('a span far ahead still reaches its days, and a daily series stops at the guard', () => {
    const series = task({ id: 'f', recurrence: 'every day', due: { date: '2026-10-12' } })
    expect(projectedOccurrences([series], [series], '2026-10-12', '2027-03-01', '2027-03-21')).toHaveLength(21)
    expect(projectedOccurrences([series], [series], '2026-10-12', '2026-10-12', '2027-10-12')).toHaveLength(31)
  })

  it('matches the first following occurrence of every shared calendar vector', () => {
    type V = { name: string; rule: string; due: string | null; today: string; done: number; expected: string | null }
    const cases = (vectors.next as V[]).filter((v) => v.due && v.done === 0 && v.expected && !v.rule.includes('after completion'))
    expect(cases.length).toBeGreaterThan(30)
    for (const v of cases) {
      const series = task({ id: 'v', recurrence: v.rule, due: { date: v.due! } })
      const out = projectedOccurrences([series], [series], v.today, v.today, v.expected!)
      expect(out.at(-1)?.date, v.name).toBe(v.expected)
    }
  })

  it('500 tasks with 50 series over three weeks in under 50 ms', () => {
    const rules = ['every day', 'every weekday', 'every monday', 'every 2 weeks', 'every 3 days after completion']
    const all: Task[] = []
    for (let i = 0; i < 500; i++) {
      all.push(task({ id: `t${i}`, due: { date: '2026-10-12' }, recurrence: i < 50 ? rules[i % rules.length] : null, estimate_minutes: 30 }))
    }
    const series = planSeries(all, [])
    expect(series).toHaveLength(50)
    const start = performance.now()
    const out = projectedOccurrences(series, all, '2026-10-12', '2026-10-12', '2026-11-01')
    expect(performance.now() - start).toBeLessThan(50)
    expect(out.length).toBeGreaterThan(100)
  })
})

describe('column rows', () => {
  it('orders timed rows by time, then priority, then position, projections among them', () => {
    const day = '2026-10-12'
    const rows = columnEntries([
      task({ id: 'p4', due: { date: day }, priority: 4 }),
      task({ id: 'at14', due: { date: day, time: '14:00' } }),
      task({ id: 'p1', due: { date: day }, priority: 1 }),
      task({ id: 'at09', due: { date: day, time: '09:00' } }),
    ], [{ id: 'proj:x', seriesId: 'x', date: day, time: '10:00', title: 'x', estimate_minutes: null, priority: 4, position: 0, project_id: null }], day)
    expect(rows.map((r) => (r.kind === 'task' ? r.task.id : r.projection.id))).toEqual(['at09', 'proj:x', 'at14', 'p1', 'p4'])
  })

  it('places a zoned due on the viewer\'s day', () => {
    const tokyo = task({ id: 'tk', due: { date: '2026-10-12', time: '02:00', tz: 'Asia/Tokyo' } })
    expect(columnEntries([tokyo], [], '2026-10-11', 'Europe/Berlin').map((r) => r.time)).toEqual(['19:00'])
    expect(columnEntries([tokyo], [], '2026-10-12', 'Europe/Berlin')).toEqual([])
  })

  it('leaves non-recurring, completed, undated and archived-project tasks out of the series', () => {
    const list = [
      task({ id: 'a', recurrence: 'every day', due: { date: '2026-10-12' } }),
      task({ id: 'b', recurrence: 'every day', due: null }),
      task({ id: 'c', recurrence: 'every day', due: { date: '2026-10-12' }, completed_at: 1 }),
      task({ id: 'd', recurrence: 'every day', due: { date: '2026-10-12' }, project_id: 'old' }),
      task({ id: 'e', due: { date: '2026-10-12' } }),
    ]
    expect(planSeries(list, [{ id: 'old', archived: true }]).map((x) => x.id)).toEqual(['a'])
  })
})
