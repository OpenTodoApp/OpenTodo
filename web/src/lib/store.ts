// Module stores (wave 4, W4/M5): one value at module level that components read
// with useSyncExternalStore. Every store registers its reset with moduleState
// under its name, so each test starts from the initial value (improvement plan T1).
import { useSyncExternalStore } from 'react'
import { resettable } from './moduleState'

/** Listeners only: for state read from elsewhere (storage, a media query, a version counter). */
export interface Signal {
  /** Tells every subscriber to read again. */
  notify: () => void
  subscribe: (listener: () => void) => () => void
}

export function createSignal(): Signal {
  const listeners = new Set<() => void>()
  return {
    // A copy: a listener may unsubscribe (or subscribe another) while it runs.
    notify: () => { for (const l of [...listeners]) l() },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/** A module-level value and its subscribers. */
export interface Store<T> extends Signal {
  get: () => T
  /** Replaces the value and notifies, unless it is the same value. */
  set: (next: T) => void
  update: (fn: (current: T) => T) => void
  /** The value in a component, re-rendering when it changes. */
  use: () => T
}

/**
 * A store named `name` (one per module, as resettable requires) starting at
 * `initial`. Tests reset it before every case, without notifying (nothing from
 * an earlier test is mounted then): to `initial`, or to what `reset` returns
 * (a store that also clears what it persisted).
 */
export function createStore<T>(name: string, initial: T, reset?: () => T): Store<T> {
  let value = initial
  const signal = createSignal()
  const get = () => value
  const set = (next: T) => {
    if (Object.is(next, value)) return
    value = next
    signal.notify()
  }
  resettable(name, () => { value = reset ? reset() : initial })
  return {
    ...signal,
    get,
    set,
    update: (fn) => set(fn(value)),
    use: () => useSyncExternalStore(signal.subscribe, get, get),
  }
}
