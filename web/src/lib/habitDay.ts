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
