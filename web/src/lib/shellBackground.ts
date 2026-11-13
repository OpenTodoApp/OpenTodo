// A shell's background run (shell-reminders-on D4): the shell loads the app without
// a screen to sync, refresh the reminder schedule and the widgets, or perform a
// notification's button. It used to run for a fixed time. In a run that lists
// `background` the app says when it is done, so a quick run ends early and a slow
// one is not cut off. Loaded only in such a run (main.tsx).
import { db } from './db'
import { resettable } from './moduleState'
import { backgroundDone } from './shell'
import { reminderActionsApplied, shellUrlAction } from './shellActions'
import { syncSnapshot } from './sync'

/** The app gives up waiting after this long; the shell has its own, longer limit. */
export const BACKGROUND_LIMIT_MS = 45_000
/** A run where sync never starts (signed out, a login wall) ends after this long. */
export const BACKGROUND_NO_SYNC_MS = 10_000
/** The publishers hand over half a second after the last change; wait a little longer. */
export const BACKGROUND_SETTLE_MS = 1_000
const POLL_MS = 250

export interface BackgroundState {
  /** Milliseconds since the run started. */
  elapsed: number
  sync: { state: string; lastSyncedAt: number | null }
  /** The run was opened at a notification's button, and the button has not been applied yet. */
  actionPending: boolean
  /** Operations still waiting to be sent. */
  outbox: number
}

/**
 * Whether the run has nothing left to wait for: the limit passed; or the action (if
 * any) is stored, and sync either finished with nothing left to send, or cannot run
 * now (offline, an error, never started).
 */
export function backgroundSettled(s: BackgroundState): boolean {
  if (s.elapsed >= BACKGROUND_LIMIT_MS) return true
  if (s.actionPending) return false
  if (s.sync.state === 'syncing') return false
  if (s.sync.lastSyncedAt == null) return s.sync.state !== 'idle' || s.elapsed >= BACKGROUND_NO_SYNC_MS
  if (s.sync.state === 'idle' || s.sync.state === 'limited') return s.outbox === 0
  // Offline or failing: what is stored on the device goes out with the next sync.
  return true
}

let running = false
resettable('shellBackground', () => { running = false })

/** Waits until the run is settled, lets the publishers hand over, and tells the shell. */
export async function startBackgroundRun(opts: { now?: () => number; sleep?: (ms: number) => Promise<void>; search?: string } = {}): Promise<void> {
  if (running) return
  running = true
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const started = now()
  const wantsAction = shellUrlAction(opts.search ?? location.search)?.kind === 'reminder'
  const appliedAtStart = reminderActionsApplied()
  for (;;) {
    const snap = syncSnapshot()
    const outbox = await db.outbox.count().catch(() => 0)
    const settled = backgroundSettled({
      elapsed: now() - started,
      sync: { state: snap.state, lastSyncedAt: snap.lastSyncedAt },
      actionPending: wantsAction && reminderActionsApplied() === appliedAtStart,
      outbox,
    })
    if (settled) break
    await sleep(POLL_MS)
  }
  await sleep(BACKGROUND_SETTLE_MS)
  backgroundDone()
}
