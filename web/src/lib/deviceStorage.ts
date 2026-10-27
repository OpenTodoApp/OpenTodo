// Device storage (wave 4, W5): localStorage and sessionStorage behind calls that
// never throw. Storage may be missing (a worker, a test), blocked (privacy
// settings) or full (quota); then a read returns the fallback and a write is
// dropped.
import { useSyncExternalStore } from 'react'
import { createSignal, createStore, type Store } from './store'

export type StorageArea = 'local' | 'session'

function area(which: StorageArea): Storage | null {
  try {
    if (which === 'session') return typeof sessionStorage === 'undefined' ? null : sessionStorage
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** The stored text, or null when absent or unreadable. */
export function readString(key: string, which: StorageArea = 'local'): string | null {
  try { return area(which)?.getItem(key) ?? null } catch { return null }
}

/** Stores text; null removes the key. Returns whether the storage took it. */
export function writeString(key: string, value: string | null, which: StorageArea = 'local'): boolean {
  try {
    const s = area(which)
    if (!s) return false
    if (value === null) s.removeItem(key)
    else s.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function removeItem(key: string, which: StorageArea = 'local'): void {
  writeString(key, null, which)
}

/** The stored text when it is one of `allowed`, else `fallback`. */
export function readEnum<T extends string>(key: string, allowed: readonly T[], fallback: T, which: StorageArea = 'local'): T {
  const v = readString(key, which)
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

/**
 * The stored JSON value, or `fallback` when absent, unparsable or refused by
 * `accept` (a type check that may also normalise; null refuses).
 */
export function readJSON<T>(key: string, fallback: T, accept?: (v: unknown) => T | null, which: StorageArea = 'local'): T {
  const raw = readString(key, which)
  if (raw === null) return fallback
  try {
    const v = JSON.parse(raw) as unknown
    return accept ? accept(v) ?? fallback : (v as T)
  } catch {
    return fallback
  }
}

/** Stores a value as JSON; returns whether the storage took it. */
export function writeJSON(key: string, value: unknown, which: StorageArea = 'local'): boolean {
  let text: string
  try { text = JSON.stringify(value) } catch { return false }
  return writeString(key, text, which)
}

/** How a stored value maps to the text under its key. */
export interface StoredCodec<T> {
  /** The value for the stored text (null: nothing stored). */
  parse: (raw: string | null) => T
  /** The text to store for a value (null removes the key). */
  serialize: (value: T) => string | null
}

/**
 * A store kept in memory and written through to `key`: read once at import,
 * so a value storage refused still lasts for this page. The test reset clears
 * the key, as on a fresh device.
 */
export function createPersistedStore<T>(name: string, key: string, codec: StoredCodec<T>): Store<T> {
  const store = createStore(name, codec.parse(readString(key)), () => {
    removeItem(key)
    return codec.parse(null)
  })
  const set = (next: T) => {
    writeString(key, codec.serialize(next))
    store.set(next)
  }
  return { ...store, set, update: (fn) => set(fn(store.get())) }
}

/** A value read from storage on every use (StoredValue). */
export interface StoredValue<T> {
  get: () => T
  set: (next: T) => void
  subscribe: (listener: () => void) => () => void
  use: () => T
}

/**
 * A device value read straight from `key` each time. The parsed value is kept
 * per stored text, which gives React a stable snapshot. Options: `crossTab`
 * re-renders on a change from another tab (the `storage` event); `server` is
 * the value for static rendering (default: the stored one).
 */
export function createStoredValue<T>(key: string, codec: StoredCodec<T>, opts: { crossTab?: boolean; server?: T } = {}): StoredValue<T> {
  const changes = createSignal()
  let last: { raw: string | null; value: T } | null = null
  const get = () => {
    const raw = readString(key)
    if (!last || last.raw !== raw) last = { raw, value: codec.parse(raw) }
    return last.value
  }
  const subscribe = (listener: () => void) => {
    const off = changes.subscribe(listener)
    if (!opts.crossTab) return off
    const onStorage = (e: StorageEvent) => { if (e.key === key || e.key === null) listener() }
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
    return () => {
      off()
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
    }
  }
  return {
    get,
    set: (next) => {
      writeString(key, codec.serialize(next))
      changes.notify()
    },
    subscribe,
    use: () => useSyncExternalStore(subscribe, get, 'server' in opts ? () => opts.server as T : get),
  }
}
