// Background sync loop: push the outbox, pull what other devices wrote, repeat
// until both sides are quiet. Runs on mutation, reconnect, tab focus and a timer.
import { useSyncExternalStore } from 'react'
import { api, ApiError } from './api'
import { db, getMeta, setMeta } from './db'
import { hlcObserveServerTime } from './hlc'
import { applyOps, getDeviceId, onLocalMutation } from './ops'
import type { SyncState } from './types'

const BATCH = 500
const INTERVAL_MS = 30_000

interface Snapshot {
  state: SyncState
  pending: number
  lastSyncedAt: number | null
  error: string | null
}

let snapshot: Snapshot = { state: 'idle', pending: 0, lastSyncedAt: null, error: null }
const listeners = new Set<() => void>()
let running = false
let again = false
let debounce: ReturnType<typeof setTimeout> | null = null
let timer: ReturnType<typeof setInterval> | null = null
let started = false

function publish(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch }
  for (const fn of listeners) fn()
}

export function useSyncStatus(): Snapshot {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => snapshot,
    () => snapshot,
  )
}

export function requestSync(delay = 250): void {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => void syncNow(), delay)
}

export async function syncNow(): Promise<void> {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    do {
      again = false
      await runOnce()
    } while (again)
  } finally {
    running = false
  }
}

async function runOnce(): Promise<void> {
  const pending = await db.outbox.count()
  publish({ pending })
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    publish({ state: 'offline' })
    return
  }
  publish({ state: 'syncing', error: null })
  try {
    const device = await getDeviceId()
    for (;;) {
      const cursor = await getMeta<number>('cursor', 0)
      const batch = await db.outbox.orderBy('local').limit(BATCH).toArray()
      const res = await api.sync(device, cursor, batch.map(({ local: _local, ...op }) => op))
      hlcObserveServerTime(res.serverTime)
      if (batch.length > 0) {
        await db.outbox.bulkDelete(batch.map((o) => o.local as number))
      }
      await applyOps(res.ops)
      await setMeta('cursor', res.cursor)
      const left = await db.outbox.count()
      publish({ pending: left })
      if (!res.hasMore && left === 0) break
    }
    publish({ state: 'idle', lastSyncedAt: Date.now(), error: null })
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      publish({ state: 'unauthenticated' })
      return
    }
    if (err instanceof TypeError) {
      // fetch() rejects with TypeError when the network is unreachable.
      publish({ state: 'offline' })
      return
    }
    publish({ state: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}

/** Wire up triggers once the user is authenticated. Idempotent. */
export function startSync(): void {
  if (started) {
    requestSync(0)
    return
  }
  started = true
  onLocalMutation(() => {
    // Reflect the pending edit immediately so the indicator never claims "Synced"
    // while an op is still waiting in the debounce window.
    if (snapshot.state === 'idle') publish({ state: 'syncing', pending: snapshot.pending + 1 })
    requestSync()
  })
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => requestSync(0))
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestSync(0)
    })
  }
  timer = setInterval(() => void syncNow(), INTERVAL_MS)
  requestSync(0)
}

export function stopSync(): void {
  if (timer) clearInterval(timer)
  timer = null
  started = false
  publish({ state: 'idle', pending: 0, lastSyncedAt: null, error: null })
}
