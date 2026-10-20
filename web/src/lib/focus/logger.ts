// The link from a focus session to time entries (OpenSpec change focus-mode,
// design D4). The session code depends on this interface only; index.ts binds it
// to time tracking (web/src/lib/timeEntries.ts). `noopLogger` is the degraded
// path the spec keeps ("Degraded without time tracking"): the timer runs the same
// and nothing is written. Time tracking has no paused entry: a pause stops the
// entry and resuming starts a new one, so the logger only starts and stops.
export interface FocusLogger {
  /** Starts an entry on the task at `at`; its id, or null when nothing was started. */
  start(taskId: string, at: number): Promise<string | null>
  /** Stops that entry at `at` when it still runs (idempotent). */
  stop(entryId: string, at: number): Promise<void>
  /** Whether that entry still runs (another device may have stopped it). */
  running(entryId: string): Promise<boolean>
}

export const noopLogger: FocusLogger = {
  start: async () => null,
  stop: async () => undefined,
  running: async () => false,
}
