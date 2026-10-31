// Projected occurrences of a recurring task (OpenSpec change series-occurrences,
// design D1, D2): the occurrences that would follow the series' current one inside a
// range, derived from the synced series row and its occurrence records and never
// written. One calculator for Plan, Day, Week, Month and Upcoming; the Go port is
// `recurrence.Rule.Occurrences`, pinned to this walk by occurrences.vectors.json.
import { daysBetweenISO, localDueOf } from './dates'
import { followingOccurrence, type Rule } from './recurrence'
import { completedOccurrences, seriesRule } from './recurring'
import type { Due, Task } from './types'

/** Projections drawn per series per range at most (planner-view D5's guard, series-occurrences D2). */
export const MAX_PROJECTIONS = 31

/** A future occurrence of a recurring task, derived and read-only. */
export interface Projection {
  id: string
  seriesId: string
  /** The day it falls on in the viewer's zone. */
  date: string
  time?: string
  title: string
  estimate_minutes: number | null
  priority: number
  position: number
  project_id: string | null
  /** The series has more occurrences in the range than the cap draws ("Showing the next 31 occurrences"). */
  capped?: true
}

export interface OccurrenceWalk {
  /** Floating occurrence dates of the series inside the range, at most MAX_PROJECTIONS. */
  dates: string[]
  /** True when the cap stopped the walk before the range ended. */
  capped: boolean
}

/**
 * The walk shared with the server: from the current due, each next occurrence as if
 * every one were completed on time (calendar rules) or on its own day (completion-relative
 * rules; today for an overdue first step), counting `done` completed records so
 * `for N times` stops it, and `until`. `local` maps a floating date to the viewer's
 * day it is compared with the range on (identity on the server).
 */
export function walkOccurrences(rule: Rule, due: string, today: string, done: number, from: string, to: string, local: (date: string) => string = (d) => d): OccurrenceWalk {
  const dates: string[] = []
  let cur = due
  // The walk reaches `from` first; the guard stops a runaway rule after that.
  const limit = MAX_PROJECTIONS + 1 + Math.max(0, Math.min(3700, daysBetweenISO(cur, from)))
  for (let k = 0; k < limit; k++) {
    const completedOn = rule.afterCompletion ? (k === 0 && cur < today ? today : cur) : today
    const next = followingOccurrence(rule, cur, today, completedOn, done + k)
    if (next === null || next <= cur) break
    const seen = local(next)
    if (seen > to) break
    if (seen >= from) {
      if (dates.length === MAX_PROJECTIONS) return { dates, capped: true }
      dates.push(next)
    }
    cur = next
  }
  return { dates, capped: false }
}

/**
 * The projections of one series inside [from, to] (viewer's days): the occurrences
 * after its current one, with the series' time and zone. `records` are the rows its
 * completed occurrence records are counted from (every live task will do).
 */
export function occurrencesInRange(series: Task, records: readonly Task[], today: string, from: string, to: string, zone?: string): { projections: Projection[]; capped: boolean } {
  const rule = seriesRule(series)
  if (!rule || !series.due) return { projections: [], capped: false }
  const base = series.due
  const dueOn = (date: string): Due => (base.time ? { date, time: base.time, ...(base.tz ? { tz: base.tz } : {}) } : { date })
  const walk = walkOccurrences(rule, base.date, today, completedOccurrences(series.id, records), from, to, (d) => localDueOf(dueOn(d), zone).date)
  const projections = walk.dates.map((date): Projection => {
    const seen = localDueOf(dueOn(date), zone)
    return {
      id: `proj:${series.id}:${date}`, seriesId: series.id, date: seen.date, ...(seen.time ? { time: seen.time } : {}),
      title: series.title, estimate_minutes: series.estimate_minutes, priority: series.priority, position: series.position, project_id: series.project_id,
      ...(walk.capped ? { capped: true as const } : {}),
    }
  })
  return { projections, capped: walk.capped }
}

/** The projections of every series inside [from, to], in series order. */
export function projectedOccurrences(series: readonly Task[], records: readonly Task[], today: string, from: string, to: string, zone?: string): Projection[] {
  return series.flatMap((task) => occurrencesInRange(task, records, today, from, to, zone).projections)
}

/** A projection's id is `proj:<series>:<floating date>`. */
export const isProjectionId = (id: string): boolean => id.startsWith('proj:')

/** Projections by viewer's day. */
export function projectionsByDate(projections: readonly Projection[]): Map<string, Projection[]> {
  const out = new Map<string, Projection[]>()
  for (const p of projections) {
    const list = out.get(p.date)
    if (list) list.push(p)
    else out.set(p.date, [p])
  }
  return out
}
