// The Loop pulse and the next move (OpenSpec change loop-home-refresh, design D3,
// D7; open-loops "Loop pulse"): pure functions over the local rows, computed when
// shown, nothing stored, nothing sent. "Done this week" and the per-day strip come
// from the statistics module so the Loop home, Statistics and the digest agree.
import { addDaysISO, currentDayStart, daysBetweenISO, logicalDay } from '../dates'
import type { Period } from '../stats'
import { qualifies } from '../triage'
import type { Task } from '../types'
import type { MoveId } from './index'

/** How many local days the pulse looks back, today included. */
export const PULSE_DAYS = 14

type PulseTask = Pick<Task, 'id' | 'project_id' | 'parent_id' | 'created_at' | 'completed_at' | 'deleted_at' | 'due'> & { start?: string | null }

/** Inbox membership, as triage defines it (lib/inbox: no project, not scheduled; top-level, open, live). */
const inInbox = (t: PulseTask): boolean => qualifies({ ...t, position: 0 })

/** The logical day of an instant (day-boundary D4), as Statistics counts it. */
const dayOf = (ms: number): string => logicalDay(ms, currentDayStart())

/** The last `days` local days ending today, as a period `compute()` accepts. */
export function lastDays(today: string, days = PULSE_DAYS): Pick<Period, 'start' | 'end'> {
  return { start: addDaysISO(today, -(days - 1)), end: today }
}

/**
 * Of the live tasks created in the last `days` days, how many no longer qualify
 * for the Inbox (a project, a date, a parent, or completed). Deleted tasks count in neither.
 */
export function decided(tasks: readonly PulseTask[], today: string, days = PULSE_DAYS): { decided: number; caught: number } {
  const { start } = lastDays(today, days)
  let caught = 0
  let done = 0
  for (const task of tasks) {
    if (task.deleted_at) continue
    const created = dayOf(task.created_at)
    if (created < start || created > today) continue
    caught++
    if (!inInbox(task)) done++
  }
  return { decided: done, caught }
}

/** The age in whole local days of the oldest open Inbox task, or null when the Inbox is empty. */
export function inboxAge(tasks: readonly PulseTask[], today: string): number | null {
  let oldest: string | null = null
  for (const task of tasks) {
    if (!inInbox(task)) continue
    const created = dayOf(task.created_at)
    if (oldest === null || created < oldest) oldest = created
  }
  return oldest === null ? null : Math.max(0, daysBetweenISO(oldest, today))
}

/** Older than this many days, the Inbox age is shown as a caution. */
export const INBOX_AGE_CAUTION_DAYS = 7

export interface MoveCounts {
  inbox: number
  withoutNext: number
  rhythmDue: boolean
  nextCount: number
}

/**
 * The one move the Loop home lights up: the first in method order that needs the
 * user, so the page has exactly one primary action.
 */
export function nextMove(counts: MoveCounts): MoveId {
  if (counts.inbox > 0) return 'clarify'
  if (counts.withoutNext > 0) return 'place'
  if (counts.rhythmDue) return 'review'
  if (counts.nextCount > 0) return 'do'
  return 'catch'
}
