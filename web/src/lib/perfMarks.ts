// Measurement points of the performance budgets (OpenSpec change
// performance-10k, design D4). Each is an entry in the browser's own
// performance timeline, read by scripts/perf/run.mjs and the reference-device
// runs with performance.getEntriesByName. Nothing is sent anywhere: no
// telemetry, no endpoint. A mark costs microseconds and stays in production
// builds, so the device runs measure the real app.
import { resettable } from './moduleState'

/** A list's rows are on screen (Today, a project, a label, a saved view…). */
export const LIST_READY = 'ot:list-ready'
/** The command bar's results for the text typed so far are on screen. */
export const SEARCH_RESULTS = 'ot:search-results'
/** The first sync of this page load finished: everything is pulled. */
export const SYNC_IDLE = 'ot:sync-idle'
/** A pulled batch that changed something was applied and painted. */
export const REMOTE_APPLIED = 'ot:remote-applied'

export type PerfMark = typeof LIST_READY | typeof SEARCH_RESULTS | typeof SYNC_IDLE | typeof REMOTE_APPLIED

/** Adds a mark to the timeline; a browser without the API is simply not measured. */
export function perfMark(name: PerfMark, detail?: Record<string, string>): void {
  try {
    // Only the latest of each kind is kept, so a long session never piles them up.
    performance.clearMarks(name)
    performance.mark(name, detail ? { detail } : undefined)
  } catch {
    // No performance timeline (an old engine or a test environment): nothing to record.
  }
}

/** Marks after the next paint: the frame that shows the change has been drawn. */
export function perfMarkAfterPaint(name: PerfMark, detail?: Record<string, string>): void {
  if (typeof requestAnimationFrame !== 'function') return perfMark(name, detail)
  // The callback runs before the frame is drawn; the task queued from it runs after.
  requestAnimationFrame(() => setTimeout(() => perfMark(name, detail), 0))
}

let syncIdleMarked = false

/** SYNC_IDLE, once per page load: the end of the first sync. */
export function markFirstSyncIdle(): void {
  if (syncIdleMarked) return
  syncIdleMarked = true
  perfMark(SYNC_IDLE)
}

/** Tests only: a new page load. */
export const resetPerfMarks = resettable('perfMarks', () => { syncIdleMarked = false })
