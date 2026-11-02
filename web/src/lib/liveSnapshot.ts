// One shared live query per kind of local data (OpenSpec changes
// large-list-performance, design D2, and web-layering). Every component that
// shows, say, the projects reads the same snapshot, refreshed by a single Dexie
// live query while anything on screen subscribes, instead of opening its own
// query over the table. Screens read these through lib/localData.ts.
//
// The snapshot is shared: callers treat it as read-only (sort a copy, never the
// array itself). Under test it is frozen, so an in-place edit fails loudly.
import { liveQuery, type Subscription } from 'dexie'
import { useSyncExternalStore } from 'react'
import { db } from './db'
import { resettable } from './moduleState'

export interface LiveSnapshot<T> {
  /** The current value, live; undefined until the first read arrives. */
  use(): T | undefined
  /** Subscribes without React (for other shared stores); returns the unsubscribe. */
  subscribe(fn: () => void): () => void
  /** The current value outside React (undefined while nobody subscribes). */
  read(): T | undefined
}

function deepFreeze<T>(value: T): T {
  // Plain rows and arrays only: typed arrays cannot be frozen, and Maps, Blobs and
  // the like are not row data.
  const proto = value && typeof value === 'object' ? Object.getPrototypeOf(value) : undefined
  if ((proto === Object.prototype || proto === null || Array.isArray(value)) && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v)
  }
  return value
}

/** Every snapshot, so a long pull can hold them all (holdLiveSnapshots). */
const snapshots = new Set<{ hold(): void; release(): void }>()
let holds = 0

resettable('liveSnapshot', () => {
  if (holds > 0) {
    holds = 0
    for (const s of snapshots) s.release()
  }
})

/** How often a held snapshot is read again. */
export const HELD_REFRESH_MS = 2_000

/**
 * Holds every shared snapshot until the returned function is called
 * (performance-10k, design D6): a first sync commits a page of a thousand ops
 * every few hundred milliseconds, and each commit made every snapshot read its
 * table again (all 10,000 tasks) and the screen render again, which also kept
 * the next page's write waiting. While held, a snapshot is read every
 * HELD_REFRESH_MS instead, so the screen still fills in as the pull goes.
 */
export function holdLiveSnapshots(): () => void {
  if (holds++ === 0) for (const s of snapshots) s.hold()
  let released = false
  return () => {
    if (released) return
    released = true
    if (--holds === 0) for (const s of snapshots) s.release()
  }
}

/** A live query shared by every subscriber; restarts when tests swap the database. */
export function liveSnapshot<T>(name: string, query: () => Promise<T>): LiveSnapshot<T> {
  let snapshot: T | undefined
  let sub: Subscription | null = null
  /** The database the live query reads; tests swap it with useDatabase. */
  let source: unknown = null
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof setInterval> | null = null

  function set(value: T) {
    snapshot = import.meta.env.MODE === 'test' ? deepFreeze(value) : value
    for (const l of listeners) l()
  }

  // A failed read keeps the last snapshot; the next write retries it.
  const failed = (err: unknown) => console.warn(`live ${name}:`, err)

  function start() {
    sub?.unsubscribe()
    // A restart after a hold keeps showing the last value until the new one arrives.
    if (source !== db) snapshot = undefined
    source = db
    sub = liveQuery(query).subscribe({ next: set, error: failed })
  }

  /** One read while held. */
  function refresh() {
    const from = db
    query().then((v) => { if (holds > 0 && listeners.size > 0 && from === db) set(v) }, failed)
  }

  const handle = {
    hold() {
      sub?.unsubscribe()
      sub = null
      timer = setInterval(() => { if (listeners.size > 0) refresh() }, HELD_REFRESH_MS)
    },
    release() {
      if (timer) clearInterval(timer)
      timer = null
      if (listeners.size > 0) start()
    },
  }
  snapshots.add(handle)

  function subscribe(fn: () => void): () => void {
    listeners.add(fn)
    if (holds > 0) {
      if (snapshot === undefined || source !== db) {
        source = db
        refresh()
      }
    } else if (!sub || source !== db) start()
    return () => {
      listeners.delete(fn)
      if (listeners.size === 0) {
        sub?.unsubscribe()
        sub = null
        snapshot = undefined
      }
    }
  }

  const read = () => (source === db ? snapshot : undefined)
  return { use: () => useSyncExternalStore(subscribe, read, read), subscribe, read }
}

/**
 * A derived value computed once per snapshot and shared by every caller (the
 * snapshot object is the cache key, so a new snapshot recomputes it).
 */
export function derived<S extends object, R>(fn: (source: S) => R): (source: S) => R {
  const cache = new WeakMap<S, R>()
  return (source) => {
    if (cache.has(source)) return cache.get(source) as R
    const out = fn(source)
    cache.set(source, out)
    return out
  }
}
