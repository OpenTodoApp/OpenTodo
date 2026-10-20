// The focus timer's link to time tracking (OpenSpec change focus-mode, design D4):
// a session's work is time entries written through time-tracking's own functions,
// each one `mutateMany` batch, so they work offline and converge like any edit.
// Breaks are never logged. `setFocusLogger` swaps the binding (tests, and the
// degraded path without time tracking).
import { db } from '../db'
import { startTracking, updateTimeEntry } from '../timeEntries'
import { isRunning } from '../time'
import type { FocusLogger } from './logger'

export { noopLogger, type FocusLogger } from './logger'

/** Time tracking's binding: start through `startTracking` (it ends any other running entry of the user), stop by ending this one entry only. */
export const timeTrackingLogger: FocusLogger = {
  start: (taskId, at) => startTracking(taskId, { now: at }),
  async stop(entryId, at) {
    const row = await db.timeEntries.get(entryId)
    if (!row || !isRunning(row)) return
    await updateTimeEntry(entryId, { ended_at: Math.max(at, row.started_at) })
  },
  async running(entryId) {
    const row = await db.timeEntries.get(entryId)
    return !!row && isRunning(row)
  },
}

let current: FocusLogger = timeTrackingLogger

/** The logger sessions write through. */
export function focusLogger(): FocusLogger {
  return current
}

/** Replaces the logger (tests; the degraded path); returns the previous one. */
export function setFocusLogger(next: FocusLogger): FocusLogger {
  const prev = current
  current = next
  return prev
}
