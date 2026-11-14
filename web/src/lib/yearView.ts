// The Year view's counts (OpenSpec change year-view, design D3, D4, D7): one pass over
// the local tasks buckets them by the viewer's day, each series is walked once over the
// year with the shared calculator (dates only, no projection rows), and a span counts on every
// day it covers. Subscribed calendar events and deadlines never count.
import { addDaysISO, daysBetweenISO, localDueOf } from './dates'
import { walkOccurrences } from './occurrences'
import { pieceRule, seriesBudget, seriesRule } from './recurring'
import { splitOf } from './lineage'
import { spanOf } from './span'
import type { Due, Task } from './types'

/** One day of the year: how many things are planned, their estimates and the first titles. */
export interface YearDay {
  count: number
  /** Estimates counted toward the day's capacity (a span's on its due day only). */
  minutes: number
  /** Up to three titles, tasks before projected occurrences. */
  titles: string[]
}

export const YEAR_TITLES = 3

/** The density step of a count (D3): fixed thresholds, 0, 1–2, 3–5, 6 or more. */
export function densityStep(count: number): 0 | 1 | 2 | 3 {
  return count <= 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : 3
}

export interface YearInput {
  /** The calendar's selection over the year in the viewer's zone: open, live, outside archived projects. */
  tasks: readonly Task[]
  /** Which of `tasks` are counted (the calendar's scope and filter); the rest add their estimates only, as Month's capacity line does. */
  keeps?: (task: Task) => boolean
  /** The series whose projected occurrences count (none while "Show repeating occurrences" is off), as stored rows. */
  series: readonly Task[]
  /** The rows occurrence records are read from (every live task will do). */
  records: readonly Task[]
  today: string
  from: string
  to: string
  zone?: string
}

/** Per day of [from, to], what the Year shows; days with nothing planned are absent. */
export function yearCounts({ tasks, keeps, series, records, today, from, to, zone }: YearInput): Map<string, YearDay> {
  const out = new Map<string, YearDay>()
  const day = (d: string) => {
    let x = out.get(d)
    if (!x) { x = { count: 0, minutes: 0, titles: [] }; out.set(d, x) }
    return x
  }
  const count = (d: string, title: string) => {
    if (d < from || d > to) return
    const x = day(d)
    x.count++
    if (x.titles.length < YEAR_TITLES) x.titles.push(title)
  }
  const minutes = (d: string, n: number | null) => { if (n && d >= from && d <= to) day(d).minutes += n }
  for (const task of tasks) {
    if (!task.due || task.completed_at || task.deleted_at) continue
    minutes(task.due.date, task.estimate_minutes)
    if (keeps && !keeps(task)) continue
    const span = spanOf(task)
    if (!span) { count(task.due.date, task.title); continue }
    for (let d = span.first < from ? from : span.first; d <= span.last && d <= to; d = addDaysISO(d, 1)) count(d, task.title)
  }
  // A series reads only its records, its split pieces and the series they name (recurring.ts
  // recordsOf, lineage.ts lineageOf): filter those out of every task once, not once per series.
  const seriesRows = seriesRowsOf(records, series)
  for (const s of series) countSeries(s, seriesRows, today, from, to, zone, count, minutes)
  return out
}

/**
 * The projections of one series over [from, to] (series-occurrences D2): one walk whose cap
 * is the range's days, so the cap of a drawn range never cuts the year short; a span
 * series' occurrence counts on each of its days (multi-day-tasks D6).
 */
function countSeries(series: Task, records: readonly Task[], today: string, from: string, to: string, zone: string | undefined,
  count: (d: string, title: string) => void, minutes: (d: string, n: number | null) => void): void {
  const rule = seriesRule(series)
  if (!rule || !series.due) return
  const base = series.due
  const dueOn = (date: string): Due => (base.time ? { date, time: base.time, ...(base.tz ? { tz: base.tz } : {}) } : { date })
  const local = (d: string) => localDueOf(dueOn(d), zone).date
  const b = seriesBudget(series, records, base.date, today)
  const walk = pieceRule(rule, b)
  const length = spanOf(series)?.length ?? 1
  const reach = addDaysISO(to, length - 1)
  const { dates } = walkOccurrences(walk, base.date, today, b.taken, from, reach, local, b.except, daysBetweenISO(from, reach) + 1)
  for (const date of dates) {
    const last = local(date)
    minutes(last, series.estimate_minutes)
    for (let i = length - 1; i >= 0; i--) count(addDaysISO(last, -i), series.title)
  }
}

/** The rows any series' budget and lineage can read: occurrence records, split pieces, the series a split names and the series themselves. */
function seriesRowsOf(records: readonly Task[], series: readonly Task[]): Task[] {
  const named = new Set<string>(series.map((s) => s.id))
  for (const t of records) {
    const split = splitOf(t)
    if (split) named.add(split.series)
  }
  return records.filter((t) => t.series_id || splitOf(t) || named.has(t.id))
}
