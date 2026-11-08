// A failed time entry of a focus session is never silent, but the data layer does
// not know how a failure is shown (AGENTS.md: app -> lib, never the other way).
// The session reports it here; the app subscribes (the Shell's toast host) and
// words it for the person.

/** Which side of the entry failed: starting it (nothing tracked) or stopping it (minutes may be off). */
export interface EntryFailure {
  phase: 'start' | 'stop'
  error: unknown
}

const listeners = new Set<(failure: EntryFailure) => void>()

/** Calls `fn` with every later entry failure; returns the unsubscribe. */
export function onEntryFailure(fn: (failure: EntryFailure) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Tells the subscribers a start or stop of the session's time entry failed. */
export function reportEntryFailure(phase: EntryFailure['phase'], error: unknown): void {
  for (const fn of [...listeners]) fn({ phase, error })
}
