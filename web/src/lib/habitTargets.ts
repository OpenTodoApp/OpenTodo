// A target habit's bar (OpenSpec change habit-targets, design D5): the current
// period's check-ins of its target and whether the periods before it were met.
// Read by the Habits screen only, so it stays out of the first load.
import { habitDays, habitTarget, periodStart, type HabitOptions, type TargetPeriod } from './habits'
import { addDaysISO } from './dates'
import type { Task } from './types'

export interface TargetThread { period: TargetPeriod; target: number; count: number; past: boolean[] }

/** The current period's count of the target, and whether each of the `n` periods before it was met, oldest first (from the habit's first day on). */
export function targetThread(series: Task, tasks: Iterable<Task>, today: string, opts?: HabitOptions, n = 3): TargetThread | null {
  const target = habitTarget(series)
  if (!target) return null
  const ws = opts?.weekStart ?? 1
  const starts = [periodStart(today, target.period, ws)]
  for (let i = 0; i < n; i++) starts.unshift(periodStart(addDaysISO(starts[0], -1), target.period, ws))
  const counts = new Map(starts.map((p) => [p, 0]))
  let first: string | null = null
  for (const d of habitDays(series, tasks, starts[0], today, today, opts)) {
    if (d.state === 'blank') continue
    first ??= d.date
    if (d.state === 'done' || d.state === 'tiny' || d.state === 'partial') {
      const p = periodStart(d.date, target.period, ws)
      counts.set(p, (counts.get(p) ?? 0) + 1)
    }
  }
  const now = starts[n]
  const past = starts.slice(0, n).filter((p) => first !== null && periodStart(first, target.period, ws) <= p).map((p) => (counts.get(p) ?? 0) >= target.target)
  return { period: target.period, target: target.target, count: counts.get(now) ?? 0, past }
}
