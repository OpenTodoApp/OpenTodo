// The Year view at scale (OpenSpec change year-view, task 2.6, design D7): 10,000 open
// dated tasks and 50 daily series. The counts are one pass over the tasks and one walk
// per series, and they match what Month draws for a month: its tasks per day plus its
// projected occurrences. The work is counted, which holds on any machine; the 100 ms budget
// is checked on the fastest of seven runs, because other load on a shared CI runner only
// ever adds time (the median of five read 124 ms in the 1.5.0 release run for a count that
// takes about 50 ms).
import { describe, expect, it, vi } from 'vitest'
import { yearCounts } from './yearView'
import { projectedOccurrences } from './occurrences'
import { addDaysISO } from './dates'
import type { Task } from './types'

const work = vi.hoisted(() => ({ walks: 0, splits: 0 }))
vi.mock('./occurrences', async (actual) => {
  const m = await actual<typeof import('./occurrences')>()
  return { ...m, walkOccurrences: (...a: Parameters<typeof m.walkOccurrences>) => { work.walks++; return m.walkOccurrences(...a) } }
})
vi.mock('./lineage', async (actual) => {
  const m = await actual<typeof import('./lineage')>()
  return { ...m, splitOf: (...a: Parameters<typeof m.splitOf>) => { work.splits++; return m.splitOf(...a) } }
})

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

  it('counts the year in one pass over the tasks and one walk per series', () => {
    work.walks = 0
    work.splits = 0
    yearCounts(input)
    expect(work.walks).toBe(series.length)
    // The rows are read a fixed number of times, never once per series (50 × 10,050).
    expect(work.splits).toBeLessThanOrEqual(3 * all.length)
  })

  it('counts the year within the budget', () => {
    yearCounts(input) // warm the walk and the date caches, as a first render after load does
    let best = Infinity
    for (let i = 0; i < 7; i++) {
      const start = performance.now()
      yearCounts(input)
      best = Math.min(best, performance.now() - start)
    }
    expect(best).toBeLessThan(100)
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
