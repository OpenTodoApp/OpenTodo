// A new device's first copy of the account (OpenSpec change first-copy-skeleton). The
// lists show their skeleton while the local database has not answered; on a device
// whose store was empty and had never synced, its first answer is "no tasks" until the
// first pull ends, so every list read "Nothing planned" and then jumped as the tasks
// arrived. Until that first copy ends the task snapshot reads as not loaded. Nothing
// here changes sync: it reads the cursor, the first-copy marker (sync.ts) and the status.
import { liveQuery, type Subscription } from 'dexie'
import { useEffect, useSyncExternalStore } from 'react'
import { db } from './db'
import { resettable } from './moduleState'
import { isHeld, onHold } from './liveSnapshot'
import { createStore } from './store'
import { FIRST_COPY_META, onSyncStatus, syncSnapshot, syncStarted } from './sync'
import type { SyncState } from './types'

type Phase = 'unknown' | 'copying' | 'done'
const phase = createStore<Phase>('firstCopyPhase', 'unknown')
let watching: Subscription | null = null
let ending: ReturnType<typeof setTimeout> | null = null
let cleared = false
// Tests that swap the database start over, as a sign-out does in the app (below).
resettable('firstCopyWatch', () => { watching?.unsubscribe(); watching = null; if (ending) clearTimeout(ending); ending = null; cleared = false })

// The copy ends when its marker is cleared, but a long pull holds the task snapshot
// (liveSnapshot) and releases it only after the last page: the end waits for the
// release, then for the snapshot's refresh, so no frozen part of the copy shows.
const SETTLE_MS = 100
function end(): void {
  if (phase.get() === 'done' || ending || isHeld()) return
  ending = setTimeout(() => { ending = null; if (!isHeld()) { phase.set('done'); stop() } }, SETTLE_MS)
}
onHold({ hold: () => {}, release: () => { if (cleared) end() } })
// Sync stops at a sign-out, which clears the device in this page: the next sign-in
// decides again from a fresh read (a device with data ends at once).
onSyncStatus(() => {
  if (syncStarted() || phase.get() === 'unknown') return
  if (ending) clearTimeout(ending)
  ending = null
  cleared = false
  watching?.unsubscribe()
  watching = null
  phase.set('unknown')
})

// No copy is under way (sync not started in this session), or sync cannot finish it now:
// the lists show what the device has, with the status saying why.
const STOPPED = new Set<SyncState>(['offline', 'error', 'unauthenticated', 'restricted', 'locked', 'limited'])
const stopped = () => !syncStarted() || STOPPED.has(syncSnapshot().state)

function watch(): void {
  watching = liveQuery(async () => ({
    cursor: (await db.meta.get('cursor'))?.value as number | undefined,
    first: (await db.meta.get(FIRST_COPY_META))?.value as boolean | undefined,
    anyTask: (await db.tasks.limit(1).count()) > 0,
  })).subscribe({
    next: ({ cursor, first, anyTask }) => {
      // Decided once, at the first read: a device with tasks or a cursor (a restore's
      // re-seed included) shows what it has as before.
      if (phase.get() === 'unknown') phase.set(!cursor && !anyTask && first !== false ? 'copying' : 'done')
      // The last page of the first copy clears the marker (sync.ts).
      else if (first === false) { cleared = true; end() }
      if (phase.get() === 'done') stop()
    },
    error: () => { phase.set('done'); stop() },
  })
}

function stop(): void {
  const s = watching
  watching = null
  queueMicrotask(() => s?.unsubscribe())
}

/** True while this device makes its first copy of an account it held nothing of. */
export function useFirstCopyPending(): boolean {
  const p = phase.use()
  const halted = useSyncExternalStore(onSyncStatus, stopped, stopped)
  // Started by the first reader; again after a sign-out reset the phase.
  useEffect(() => { if (p !== 'done' && !watching) watch() }, [p])
  return p !== 'done' && !halted
}
