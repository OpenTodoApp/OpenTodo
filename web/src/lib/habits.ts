// Habit streaks (OpenSpec change habits, design D3): which days a habit was
// scheduled, which of them were done or skipped, the current and best streak,
// and a month grid. Pure over the series row, its occurrence records and today,
// so two devices with the same rows agree. Dates are floating calendar days.
import { addDaysISO } from './dates'
import { firstOccurrence, parseRule, type Rule } from './recurrence'
import type { Task } from './types'

type Series = Pick<Task, 'id' | 'due' | 'recurrence'>
type RecordRow = Pick<Task, 'series_id' | 'due' | 'completed_at' | 'deleted_at' | 'skipped'>

/** How far back a walk looks for a scheduled day (ten years of daily history). */
const MAX_WALK_DAYS = 3660

const dayNum = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}
const ymd = (iso: string) => iso.split('-').map(Number) as [number, number, number]
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/**
 * Whether `date` is one of the rule's days. Calendar patterns match the date
 * itself; intervals step from the anchor (the current due) in both directions,
 * months and years on the anchor's day, clamped to the month's last day.
 */
export function scheduled(rule: Rule, anchor: string, date: string): boolean {
  if (rule.kind !== 'interval') return firstOccurrence(rule, date) === date
  const diff = dayNum(date) - dayNum(anchor)
  if (rule.unit === 'day' || rule.unit === 'week') {
    const size = rule.unit === 'week' ? 7 * rule.interval : rule.interval
    return ((diff % size) + size) % size === 0
  }
  const [ay, am, ad] = ymd(anchor)
  const [y, m, d] = ymd(date)
  const months = (y * 12 + m) - (ay * 12 + am)
  const step = rule.unit === 'year' ? 12 * rule.interval : rule.interval
  if (((months % step) + step) % step !== 0) return false
  return d === Math.min(ad, daysIn(y, m))
}

/** The completed (or skipped) records of a series, by occurrence date. */
export function recordsByDate(seriesId: string, rows: Iterable<RecordRow>): Map<string, { skipped: boolean }> {
  const out = new Map<string, { skipped: boolean }>()
  for (const r of rows) {
    if (r.series_id !== seriesId || !r.completed_at || r.deleted_at || !r.due) continue
    out.set(r.due.date, { skipped: !!r.skipped })
  }
  return out
}

/** The scheduled day before `before`: a rule day, or a day with a record (it proves the day was scheduled). */
export function previousScheduled(rule: Rule, anchor: string, before: string, records: ReadonlyMap<string, unknown>): string | null {
  const earliest = [...records.keys()].reduce((m, d) => (d < m ? d : m), before)
  let d = addDaysISO(before, -1)
  for (let i = 0; i < MAX_WALK_DAYS; i++, d = addDaysISO(d, -1)) {
    if (records.has(d) || scheduled(rule, anchor, d)) return d
    // Nothing older can hold a record, and the walk only needs the last rule day before it.
    if (d < earliest && i > 400) return null
  }
  return null
}

export interface HabitStats {
  /** Done days in a row up to now; skipped days keep the run without adding to it. */
  current: number
  best: number
  /** The current occurrence is never missed: it is still to do. */
  pending: boolean
  /** The current occurrence is already overdue. */
  atRisk: boolean
}

function ruleOf(series: Series): Rule | null {
  if (!series.recurrence) return null
  const p = parseRule(series.recurrence)
  return p.ok && !p.rule.afterCompletion ? p.rule : null
}

/** The current and best streak of a habit. */
export function habitStats(series: Series, rows: Iterable<RecordRow>, today: string): HabitStats {
  const rule = ruleOf(series)
  const cur = series.due?.date
  if (!rule || !cur) return { current: 0, best: 0, pending: false, atRisk: false }
  const recs = recordsByDate(series.id, rows)
  const earliest = [...recs.keys()].reduce((m, d) => (d < m ? d : m), cur)
  let current = 0
  let run = 0
  let best = 0
  let counting = true
  const at = recs.get(cur)
  if (at && !at.skipped) {
    current = run = 1
  }
  for (let d = previousScheduled(rule, cur, cur, recs); d && d >= earliest; d = previousScheduled(rule, cur, d, recs)) {
    const r = recs.get(d)
    if (r) {
      if (!r.skipped) {
        run++
        if (counting) current++
      }
    } else {
      counting = false
      best = Math.max(best, run)
      run = 0
    }
  }
  best = Math.max(best, run, current)
  return { current, best, pending: true, atRisk: cur < today }
}

export type DayState = 'blank' | 'done' | 'skipped' | 'missed' | 'pending' | 'upcoming'

/**
 * One month of a habit as grid cells, padded at the start so the first row
 * begins on `weekStart` (0 = Sunday … 6 = Saturday). Padding cells have date ''.
 */
export function monthGrid(series: Series, rows: Iterable<RecordRow>, year: number, month: number, today: string, weekStart = 1): { date: string; state: DayState }[] {
  const rule = ruleOf(series)
  const cur = series.due?.date ?? today
  const recs = recordsByDate(series.id, rows)
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() - weekStart + 7) % 7
  const out: { date: string; state: DayState }[] = Array.from({ length: lead }, () => ({ date: '', state: 'blank' as DayState }))
  for (let i = 0; i < daysIn(year, month); i++) {
    const date = addDaysISO(first, i)
    const r = recs.get(date)
    let state: DayState = 'blank'
    if (r) state = r.skipped ? 'skipped' : 'done'
    else if (date === cur) state = 'pending'
    else if (rule && scheduled(rule, cur, date)) state = date < cur ? 'missed' : 'upcoming'
    out.push({ date, state })
  }
  return out
}
