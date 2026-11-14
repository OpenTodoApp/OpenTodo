// Amount habits (OpenSpec change habit-targets, design D2, D3): what one press of
// the check button, Subtract or Set amount writes. Each device adds to its own
// tally of the day, so two offline devices never lose an addition; reaching the
// day's goal checks the day in as any check-in does, falling below it clears that
// check-in. Pure functions of the local rows, like habitLog.ts.
import { amountsOf, habitGoal, pieceFor } from './habits'
import { planLog, planPastDay } from './habitLog'
import { nameId, occurrenceId } from './ids'
import { lineageOf } from './lineage'
import type { Change } from './ops'
import type { HabitTally, Task } from './types'

/** The check button's step: the habit's, else 1. */
export function habitStep(task: Pick<Task, 'habit_step'>): number {
  const s = task.habit_step ?? 1
  return s > 0 ? s : 1
}

/** The own tally a device writes for an exact amount: the amount minus the other devices' counts, never below zero (habit-targets D2). */
export function ownForExact(others: number, exact: number): number {
  return Math.max(0, exact - others)
}

/** The id of a device's tally of a day (Go ids.NameID("habit-tally", …)). */
export function tallyId(seriesId: string, date: string, device: string): string {
  return nameId('habit-tally', `${seriesId}:${date}:${device}`)
}

/** Add (a negative step subtracts) or set an exact amount. */
export type AmountChange = { add: number } | { exact: number }

export interface AmountPlan {
  changes: Change[]
  /** The day's summed amount after the change. */
  amount: number
  goal: number
}

/**
 * The writes of an amount change on `date` from `device`: its own tally (never
 * below zero), and the check-in when the sum reaches the goal, or clearing it
 * when the sum falls below. Null for a habit without an amount or a future day.
 */
export function planAmount(series: Task, tasks: readonly Task[], tallies: readonly HabitTally[], date: string, how: AmountChange,
  device: string, now: number, today: string): AmountPlan | null {
  const goal = habitGoal(series)
  if (!goal || date > today) return null
  const ids = new Set(lineageOf(series, tasks).map((p) => p.task.id))
  const piece = pieceFor(series, tasks, date)
  const id = tallyId(piece.id, date, device)
  const mine = tallies.find((x) => x.id === id && !x.deleted_at)
  const own = mine?.count ?? 0
  const sum = amountsOf(ids, tallies).get(date) ?? 0
  const others = sum - Math.max(own, 0)
  const next = 'add' in how ? Math.max(0, own + how.add) : ownForExact(others, how.exact)
  const amount = others + next
  const changes: Change[] = [mine
    ? { entity: 'habit_tally', entityId: id, patch: { count: next } }
    : { entity: 'habit_tally', entityId: id, patch: { series_id: piece.id, date, device, count: next, created_at: now, deleted_at: null } }]
  const record = tasks.find((x) => x.id === occurrenceId(piece.id, date) && !x.deleted_at && x.completed_at && !x.skipped)
  if (amount >= goal && !record) {
    const log = planLog(series, tasks, date, 'done', '', now, today)
    if (Array.isArray(log)) changes.push(...log)
  } else if (amount < goal && record) {
    changes.push(...(planPastDay(series, tasks, date, 'clear', now, today) ?? []))
  }
  return { changes, amount, goal }
}
