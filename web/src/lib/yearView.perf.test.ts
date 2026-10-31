// The Year view at scale (OpenSpec change year-view, task 2.6, design D7): 10,000 open
// dated tasks and 50 daily series. The counts are one pass over the tasks and one walk
// per series and month, within the 100 ms render budget on the CI runner, and they match
// what Month draws for a month: its tasks per day plus its projected occurrences.
import { describe, expect, it } from 'vitest'
import { yearCounts } from './yearView'
import { projectedOccurrences } from './occurrences'
import { addDaysISO } from './dates'
import type { Task } from './types'

function task(i: number, over: Partial<Task>): Task {
  return {
    id: `t${i}`, project_id: null, section_id: null, parent_id: null, title: `Task ${i}`, notes: '', priority: 4, position: i, due: null, deadline: null,
    recurrence: null, series_id: null, estimate_minutes: i % 3 ? 30 : null, completed_at: null, deleted_at: null, labels: [], created_at: 0, updated_at: 0,
    ...over,
  } as Task
}

describe('year view at 10,000 tasks', () => {
  const today = '2026-01-01'
  const tasks = Array.from({ length: 10_000 }, (_, i) => task(i, { due: { date: addDaysISO(today, i % 365) } }))
  const series = Array.from({ length: 50 }, (_, i) => task(20_000 + i, { due: { date: today }, recurrence: 'every day' }))
  const all = [...tasks, ...series]
  const input = { tasks: all, series, records: all, today, from: '2026-01-01', to: '2026-12-31' }

  it('counts the year within the budget', () => {
    yearCounts(input) // warm the walk and the date caches, as a first render after load does
    const times: number[] = []
    for (let i = 0; i < 5; i++) {
      const start = performance.now()
      yearCounts(input)
      times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    expect(times[2]).toBeLessThan(100)
  })

  it('matches the per-day counts the Month shows', () => {
    const counts = yearCounts(input)
    const from = '2026-11-01', to = '2026-11-30'
    const projected = projectedOccurrences(series, all, today, from, to)
    for (let d = from; d <= to; d = addDaysISO(d, 1)) {
      const month = all.filter((t) => t.due?.date === d).length + projected.filter((p) => p.date === d).length
      expect(counts.get(d)?.count, d).toBe(month)
    }
  })
})
