import { describe, expect, it } from 'vitest'
import { habitStats, monthGrid, scheduled } from './habits'
import { parseRule, type Rule } from './recurrence'
import vectors from './habits.vectors.json'

interface Vector {
  name: string
  series: { recurrence: string; due: string }
  today: string
  records: { date: string; skipped?: boolean }[]
  expect: { current: number; best: number; pending: boolean; atRisk: boolean }
  grid?: { year: number; month: number; days: Record<string, string> }
}

describe('habit streak vectors (habits D3)', () => {
  for (const v of (vectors as { cases: Vector[] }).cases) {
    it(v.name, () => {
      const series = { id: 's', recurrence: v.series.recurrence, due: { date: v.series.due } }
      const rows = v.records.map((r) => ({ series_id: 's', due: { date: r.date }, completed_at: 1, deleted_at: null, skipped: r.skipped ?? false }))
      expect(habitStats(series, rows, v.today)).toEqual(v.expect)
      if (v.grid) {
        const cells = monthGrid(series, rows, v.grid.year, v.grid.month, v.today)
        for (const [date, state] of Object.entries(v.grid.days)) {
          expect({ date, state: cells.find((c) => c.date === date)?.state }).toEqual({ date, state })
        }
      }
    })
  }

  it('dates are floating: intervals step across month ends and DST changes alike', () => {
    const rule = (parseRule('every 2 weeks') as { rule: Rule }).rule
    expect(scheduled(rule, '2026-10-21', '2026-11-04')).toBe(true) // across the end of summer time
    expect(scheduled(rule, '2026-10-21', '2026-03-25')).toBe(true)
    const monthly = (parseRule('every month') as { rule: Rule }).rule
    expect(scheduled(monthly, '2026-01-31', '2026-02-28')).toBe(true)
    expect(scheduled(monthly, '2026-01-31', '2026-02-27')).toBe(false)
  })

  it('the grid is padded to the first day of the week', () => {
    const cells = monthGrid({ id: 's', recurrence: 'every day', due: { date: '2026-10-10' } }, [], 2026, 10, '2026-10-10', 1)
    // 1 October 2026 is a Thursday: three blanks for Monday to Wednesday.
    expect(cells.slice(0, 4).map((c) => c.date)).toEqual(['', '', '', '2026-10-01'])
  })
})
