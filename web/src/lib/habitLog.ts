// Logging a habit's day without the app's screens (OpenSpec change
// habits-assistant, design D2): Set a past day (habits-home D6) and the routine
// step Log a habit on a device, the same writes as the server's log_habit
// (internal/habits PlanLog). Pure functions of the local rows.
import { habitDays, habitGoal, habitRule, isOpenHabit, pieceFor, editableDay } from './habits'
import { lineageOf } from './lineage'
import { occurrenceId } from './ids'
import type { Change } from './ops'
import { moveDates, occurrenceFields, recordDate } from './recurring'
import { planActOn } from './seriesPlan'
import type { Task } from './types'

/** What a past day can be set to (habits-home D6). */
export type DayChoice = 'done' | 'tiny' | 'skipped' | 'clear'

/**
 * Setting a past scheduled day (D6): Done, Tiny and Skipped write that date's
 * record (the derived id of the piece whose range holds it) without moving the
 * series; Clear tombstones it so the day reads as missed. Null when there is
 * nothing to write (Clear on a day without a record).
 */
export function planPastDay(series: Task, tasks: readonly Task[], date: string, choice: DayChoice, now: number, today: string): Change[] | null {
  const piece = pieceFor(series, tasks, date)
  const id = occurrenceId(piece.id, date)
  const existing = tasks.find((x) => x.id === id && !x.deleted_at)
  if (choice === 'clear') return existing ? [{ entity: 'task', entityId: id, patch: { deleted_at: now } }] : null
  const state = { completed_at: now, skipped: choice === 'skipped', tiny: choice === 'tiny' }
  if (existing) return [{ entity: 'task', entityId: id, patch: state }]
  return [{ entity: 'task', entityId: id, patch: { ...occurrenceFields(piece, date, now, today), ...state } }]
}

/** Why a log cannot be planned (the server's codes). */
export type LogRefusal = 'not_a_habit' | 'invalid_input'

/**
 * Logs `date` of a habit as `state`, with an optional note (log_habit): its own
 * date, or today while it is overdue, completes or skips the current occurrence
 * and moves the series; an earlier scheduled day writes its record alone.
 */
export function planLog(series: Task, tasks: readonly Task[], date: string, state: Exclude<DayChoice, 'clear'>, note: string, now: number, today: string): Change[] | LogRefusal {
  if (!isOpenHabit(series) || !habitRule(series)) return 'not_a_habit'
  if (date > today) return 'invalid_input'
  const due = series.due?.date
  const withNote = (cs: Change[], recordId: string) => {
    if (note) for (const c of cs) if (c.entityId === recordId) c.patch.description = note
    return cs
  }
  if (due && (date === due || (date === today && due < today))) {
    const plan = planActOn(series, null, state === 'skipped' ? { kind: 'skip' } : { kind: 'complete', tiny: state === 'tiny' }, tasks, now, today)
    if (!plan) return 'invalid_input'
    if (plan.end) return [{ entity: 'task', entityId: series.id, patch: { completed_at: now } }]
    return withNote(plan.changes, plan.recordId)
  }
  const [cell] = habitDays(series, tasks, date, date, today)
  if (!cell || !editableDay(cell, today)) return 'invalid_input'
  const cs = planPastDay(series, tasks, date, state, now, today) ?? []
  return withNote(cs, occurrenceId(pieceFor(series, tasks, date).id, date))
}

/**
 * Takes back today's check-in (OpenSpec change habits-complete, design D4): today's
 * done or tiny record goes, and a series that moved past today is due today again,
 * its time, start and deadline moved alike. When a later day of the lineage has been
 * recorded since (an early check-in), only the record goes. Null when there is nothing
 * to take back, and for an amount habit, whose day follows its tallies.
 */
export function planUncheck(series: Task, tasks: readonly Task[], today: string, now: number): Change[] | null {
  if (!isOpenHabit(series) || habitGoal(series) > 0) return null
  const piece = pieceFor(series, tasks, today)
  const id = occurrenceId(piece.id, today)
  const record = tasks.find((x) => x.id === id && !x.deleted_at)
  if (!record?.completed_at || record.skipped) return null
  const changes: Change[] = [{ entity: 'task', entityId: id, patch: { deleted_at: now } }]
  const due = series.due?.date
  if (piece.id !== series.id || !due || due <= today) return changes
  const pieces = new Set(lineageOf(series, tasks).map((p) => p.task.id))
  const later = tasks.some((x) => !x.deleted_at && x.id !== id && !!x.series_id && pieces.has(x.series_id) && (recordDate(x) ?? '') > today)
  if (!later) changes.push({ entity: 'task', entityId: series.id, patch: moveDates(series, today, today) })
  return changes
}
