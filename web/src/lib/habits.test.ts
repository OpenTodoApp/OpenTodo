import { describe, expect, it } from 'vitest'
import { habitRule, habitStats, monthGrid, previousScheduled, recordsByDate, scheduled, type DayState, type HabitStats } from './habits'
import rawVectors from './habits.vectors.json'
import { detachedId, occurrenceId } from './ids'
import { parseRule, type Rule } from './recurrence'
import type { Task } from './types'

interface Vectors {
  cases: { name: string; rule: string; due: string; today: string; records: Record<string, string>; stats: HabitStats | null; grids?: { month: string; days: string }[] }[]
  previous: { rule: string; due: string; before: string; records: string[]; want: string | null }[]
}
const vectors = rawVectors as unknown as Vectors

const CHAR: Record<DayState, string> = { blank: '.', done: 'D', skipped: 'S', missed: 'M', pending: 'P', upcoming: 'U' }

function task(over: Partial<Task>): Task {
  return {
    id: 'x', title: 'Habit', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
    created_at: 1, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null,
    assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...over,
  }
}

const SERIES = 'series-1'

function rows(rule: string, due: string, records: Record<string, string>): Task[] {
  const series = task({ id: SERIES, recurrence: rule, due: { date: due }, habit: true })
  const recs = Object.entries(records).map(([date, state]) => task({
    id: occurrenceId(SERIES, date), series_id: SERIES, due: { date }, completed_at: 100, skipped: state === 'skipped',
  }))
  return [series, ...recs]
}

function mustRule(text: string): Rule {
  const p = parseRule(text)
  if (!p.ok) throw new Error(p.error)
  return p.rule
}

describe('habit vectors', () => {
  for (const v of vectors.cases) {
    it(v.name, () => {
      const all = rows(v.rule, v.due, v.records)
      expect(habitStats(all[0], all, v.today)).toEqual(v.stats)
      for (const g of v.grids ?? []) {
        const [y, m] = g.month.split('-').map(Number)
        const days = monthGrid(all[0], all, y, m, v.today).map((c) => CHAR[c.state]).join('')
        expect(days, g.month).toBe(g.days)
      }
    })
  }

  for (const p of vectors.previous) {
    it(`previousScheduled ${p.rule} before ${p.before}`, () => {
      const recs = new Map(p.records.map((d) => [d, 'done']))
      expect(previousScheduled(mustRule(p.rule), p.due, p.before, recs)).toBe(p.want)
    })
  }

  it('the same rows give the same answer whatever their order', () => {
    const v = vectors.cases.find((c) => c.name.startsWith('every weekday'))!
    const all = rows(v.rule, v.due, v.records)
    const reversed = [...all].reverse()
    expect(habitStats(all[0], reversed, v.today)).toEqual(habitStats(all[0], all, v.today))
    expect(monthGrid(all[0], reversed, 2026, 10, v.today)).toEqual(monthGrid(all[0], all, 2026, 10, v.today))
  })
})

describe('schedule', () => {
  it('matches predicate rules on the date itself', () => {
    expect(scheduled(mustRule('every weekday'), '2026-10-14', '2026-10-17')).toBe(false)
    expect(scheduled(mustRule('every weekday'), '2026-10-14', '2026-10-16')).toBe(true)
    expect(scheduled(mustRule('every last day'), null, '2026-02-28')).toBe(true)
    expect(scheduled(mustRule('every last weekday'), null, '2026-10-30')).toBe(true)
    expect(scheduled(mustRule('every last weekday'), null, '2026-10-31')).toBe(false)
    expect(scheduled(mustRule('every 2nd tuesday'), null, '2026-10-13')).toBe(true)
    expect(scheduled(mustRule('every last friday'), null, '2026-10-30')).toBe(true)
    expect(scheduled(mustRule('every last friday'), null, '2026-10-23')).toBe(false)
  })

  it('anchors interval rules at the current due date, both ways', () => {
    expect(scheduled(mustRule('every 3 days'), '2026-10-14', '2026-10-08')).toBe(true)
    expect(scheduled(mustRule('every 3 days'), '2026-10-14', '2026-10-09')).toBe(false)
    expect(scheduled(mustRule('every year'), '2026-02-28', '2024-02-28')).toBe(true)
    expect(scheduled(mustRule('every day'), null, '2026-10-14')).toBe(false)
  })

  it('ignores dates after until', () => {
    expect(scheduled(mustRule('every day until 2026-10-20'), '2026-10-14', '2026-10-21')).toBe(false)
  })

  it('does not depend on the device time zone: dates are floating', () => {
    // Day arithmetic runs on UTC day numbers; a DST change in the device zone cannot
    // add or drop a day (see the daylight saving vectors above).
    const days = monthGrid(rows('every day', '2026-03-31', { '2026-03-01': 'done' })[0], rows('every day', '2026-03-31', { '2026-03-01': 'done' }), 2026, 3, '2026-03-31')
    expect(days).toHaveLength(31)
    expect(days.map((d) => d.date)).toEqual(Array.from({ length: 31 }, (_, i) => `2026-03-${String(i + 1).padStart(2, '0')}`))
  })
})

describe('records', () => {
  it('counts only derived-id records that are completed and live', () => {
    const all = [
      task({ id: occurrenceId(SERIES, '2026-10-12'), series_id: SERIES, due: { date: '2026-10-12' }, completed_at: 1 }),
      task({ id: occurrenceId(SERIES, '2026-10-13'), series_id: SERIES, due: { date: '2026-10-13' }, completed_at: null }),
      task({ id: occurrenceId(SERIES, '2026-10-11'), series_id: SERIES, due: { date: '2026-10-11' }, completed_at: 1, deleted_at: 2 }),
      task({ id: detachedId(SERIES, '2026-10-10'), series_id: SERIES, due: { date: '2026-10-10' }, completed_at: 1 }),
    ]
    expect([...recordsByDate(SERIES, all)]).toEqual([['2026-10-12', 'done']])
  })

  it('offers no rule for a completion-relative or missing rule', () => {
    expect(habitRule({ recurrence: 'every 3 days after completion' })).toBeNull()
    expect(habitRule({ recurrence: null })).toBeNull()
    expect(habitRule({ recurrence: 'every mon, wed, fri' })).not.toBeNull()
  })
})
