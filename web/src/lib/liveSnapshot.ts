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

/** A live query shared by every subscriber; restarts when tests swap the database. */
export function liveSnapshot<T>(name: string, query: () => Promise<T>): LiveSnapshot<T> {
  let snapshot: T | undefined
  let sub: Subscription | null = null
  /** The database the live query reads; tests swap it with useDatabase. */
  let source: unknown = null
  const listeners = new Set<() => void>()

  function start() {
    sub?.unsubscribe()
    source = db
    snapshot = undefined
    sub = liveQuery(query).subscribe({
      next: (value) => {
        snapshot = import.meta.env.MODE === 'test' ? deepFreeze(value) : value
        for (const l of listeners) l()
      },
      // A failed read keeps the last snapshot; the next write retries it.
      error: (err) => console.warn(`live ${name}:`, err),
    })
  }

  function subscribe(fn: () => void): () => void {
    listeners.add(fn)
    if (!sub || source !== db) start()
    return () => {
      listeners.delete(fn)
      if (listeners.size === 0 && sub) {
        sub.unsubscribe()
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
