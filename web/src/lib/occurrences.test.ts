import { describe, expect, it } from 'vitest'
import { MAX_PROJECTIONS, occurrencesInRange, projectedOccurrences, walkOccurrences } from './occurrences'
import { parseRule } from './recurrence'
import { occurrenceId } from './ids'
import type { Task } from './types'
// Shared with internal/recurrence (Go): Rule.Occurrences must give the same dates (series-occurrences D2).
import vectors from './occurrences.vectors.json'

interface Vector { name: string; rule: string; due: string; today: string; done: number; from: string; to: string; dates: string[]; capped: boolean }

function task(over: Partial<Task>): Task {
  return {
    id: 't', project_id: null, section_id: null, parent_id: null, title: 'Study', notes: '', priority: 4, position: 1, due: null, deadline: null,
    recurrence: null, series_id: null, estimate_minutes: null, completed_at: null, deleted_at: null, labels: [], created_at: 0, updated_at: 0,
    ...over,
  } as Task
}

describe('shared occurrence vectors', () => {
  it('covers the cases the design names', () => {
    expect((vectors.cases as Vector[]).length).toBeGreaterThanOrEqual(10)
    expect((vectors.cases as Vector[]).some((v) => v.capped)).toBe(true)
  })

  it.each((vectors.cases as Vector[]).map((v) => [v.name, v] as const))('%s', (_name, v) => {
    const parsed = parseRule(v.rule)
    if (!parsed.ok) throw new Error(`bad rule ${v.rule}`)
    expect(walkOccurrences(parsed.rule, v.due, v.today, v.done, v.from, v.to)).toEqual({ dates: v.dates, capped: v.capped })
  })
})

describe('occurrencesInRange', () => {
  it('carries the series time, zone and fields, and counts its completed records', () => {
    const series = task({ id: 's', recurrence: 'every day for 5 times', due: { date: '2026-10-12', time: '18:00' }, estimate_minutes: 60 })
    const done = ['2026-10-09', '2026-10-10', '2026-10-11'].map((date) => task({ id: occurrenceId('s', date), series_id: 's', due: { date }, completed_at: 1 }))
    const out = occurrencesInRange(series, [series, ...done], '2026-10-12', '2026-10-12', '2026-10-18')
    expect(out.capped).toBe(false)
    expect(out.projections).toEqual([expect.objectContaining({ id: 'proj:s:2026-10-13', seriesId: 's', date: '2026-10-13', time: '18:00', estimate_minutes: 60, title: 'Study' })])
  })

  it('marks every projection of a capped series', () => {
    const series = task({ id: 'd', recurrence: 'every day', due: { date: '2026-10-01' } })
    const out = occurrencesInRange(series, [series], '2026-10-01', '2026-09-28', '2026-11-08')
    expect(out.capped).toBe(true)
    expect(out.projections).toHaveLength(MAX_PROJECTIONS)
    expect(out.projections.every((p) => p.capped)).toBe(true)
  })

  it('shows a zoned time on the viewer\'s day', () => {
    // 23:30 in New York is 05:30 the next day in Berlin.
    const series = task({ id: 'z', recurrence: 'every week', due: { date: '2026-10-12', time: '23:30', tz: 'America/New_York' } })
    const out = occurrencesInRange(series, [series], '2026-10-12', '2026-10-12', '2026-10-25', 'Europe/Berlin')
    expect(out.projections.map((p) => [p.date, p.time])).toEqual([['2026-10-20', '05:30']])
  })

  it('draws nothing for a task without a rule or a completed series', () => {
    expect(occurrencesInRange(task({ due: { date: '2026-10-12' } }), [], '2026-10-12', '2026-10-12', '2026-10-31').projections).toEqual([])
    expect(occurrencesInRange(task({ recurrence: 'every day', due: { date: '2026-10-12' }, completed_at: 1 }), [], '2026-10-12', '2026-10-12', '2026-10-31').projections).toEqual([])
  })
})

describe('performance guard (design Risks)', () => {
  it('200 series over a 42-day range stay well under the frame budget', () => {
    const rules = ['every day', 'every weekday', 'every mon, wed, fri', 'every 2 days', 'every week']
    const series = Array.from({ length: 200 }, (_, i) => task({ id: `s${i}`, recurrence: rules[i % rules.length], due: { date: '2026-10-01', time: '09:00' } }))
    projectedOccurrences(series.slice(0, 5), series, '2026-10-01', '2026-09-28', '2026-11-08') // warm the parser
    // The design's 20 ms target holds alone (about 5 ms). The best of ten runs is held to
    // 50 ms, the budget plan.test.ts keeps for the same walk, so parallel test files
    // on a busy CI worker do not fail a guard meant for the calculator itself.
    let took = Infinity, n = 0
    for (let run = 0; run < 10; run++) {
      const start = performance.now()
      n = projectedOccurrences(series, series, '2026-10-01', '2026-09-28', '2026-11-08', 'Europe/Berlin').length
      took = Math.min(took, performance.now() - start)
    }
    expect(n).toBeGreaterThan(3000)
    expect(took).toBeLessThan(50)
  })
})
