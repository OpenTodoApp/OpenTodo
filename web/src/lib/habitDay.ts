// A day across every habit (OpenSpec change habits-complete, design D2, D9): how many
// of the habits due on a date are kept, for the Habits screen's lead line and the
// phone's day strip. Pure, from the device's rows, offline too.
import { habitDays, isGraduated, type DayState, type HabitOptions } from './habits'
import type { Task } from './types'

/** A day's state that counts as due: what the person was expected to do that day. A skip is a rest, not due. */
const DUE: ReadonlySet<DayState> = new Set(['pending', 'done', 'tiny', 'partial', 'missed'])

export interface DayProgress { kept: number; due: number }

/** The state of `date` for one habit. */
export function dayStateOf(series: Task, rows: readonly Task[], date: string, today: string, opts?: HabitOptions): DayState {
  return habitDays(series, rows, date, date, today, opts)[0]?.state ?? 'blank'
}

/** Of the non-graduated habits due on `date`, how many are done or the tiny version. */
export function dayProgress(habits: readonly Task[], rowsOf: (t: Task) => readonly Task[], date: string, today: string, opts?: HabitOptions): DayProgress {
  let kept = 0
  let due = 0
  for (const x of habits) {
    if (isGraduated(x)) continue
    const s = dayStateOf(x, rowsOf(x), date, today, opts)
    if (!DUE.has(s)) continue
    due++
    if (s === 'done' || s === 'tiny') kept++
  }
  return { kept, due }
}

/** The kept and due days of `dates` across the habits (habits-board D3): the Last 7 days tile. */
export function weekProgress(habits: readonly Task[], rowsOf: (t: Task) => readonly Task[], dates: readonly string[], today: string, opts?: HabitOptions): DayProgress {
  let kept = 0
  let due = 0
  for (const d of dates) {
    const p = dayProgress(habits, rowsOf, d, today, opts)
    kept += p.kept
    due += p.due
  }
  return { kept, due }
}

const KEPT: ReadonlySet<DayState> = new Set(['done', 'tiny', 'partial'])

/**
 * One habit's kept days among its due ones over the `n` days ending on `today`
 * (habits-board D4): done, tiny and partial are kept; a miss is due and not kept;
 * today's pending occurrence, a skip and a rest day are neither.
 */
export function recentKept(series: Task, rows: readonly Task[], today: string, n: number, opts?: HabitOptions): { kept: number; of: number } {
  let kept = 0
  let of = 0
  for (const c of habitDays(series, rows, addDays(today, 1 - n), today, today, opts)) {
    if (KEPT.has(c.state)) { kept++; of++ } else if (c.state === 'missed') of++
  }
  return { kept, of }
}

/**
 * Per weekday (0 = Sunday … 6 = Saturday), one habit's kept days among its due ones
 * over the `weeks` weeks ending on `today` (habits-board D4): the By weekday chart.
 */
export function weekdayRates(series: Task, rows: readonly Task[], today: string, weeks = 12, opts?: HabitOptions): { kept: number; of: number }[] {
  const out = Array.from({ length: 7 }, () => ({ kept: 0, of: 0 }))
  for (const c of habitDays(series, rows, addDays(today, 1 - weeks * 7), today, today, opts)) {
    const wd = new Date(`${c.date}T00:00:00Z`).getUTCDay()
    if (KEPT.has(c.state)) { out[wd].kept++; out[wd].of++ } else if (c.state === 'missed') out[wd].of++
  }
  return out
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
