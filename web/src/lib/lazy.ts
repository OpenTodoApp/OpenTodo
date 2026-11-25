// The app's lazy() (OpenSpec change lazy-retry-online). React keeps a lazy
// component's failed import and throws it on every render, so a part whose chunk
// could not be fetched offline stays broken after the connection returns. This one
// remembers the failed imports; retryFailedImports() gives each a fresh import for
// its next render (PanelBoundary calls it when the device is back online). Nothing
// retries on its own: React renders an errored tree once more before the boundary
// takes it, and an import retried there would loop while offline.
import { createElement, lazy as reactLazy, useState, type ComponentProps, type ComponentType, type FunctionComponent } from 'react'
import { resettable } from './moduleState'

const failed = new Set<() => void>()
resettable('lazy', () => failed.clear())

// React's own lazy() takes any component type.
export function lazy<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>): FunctionComponent<ComponentProps<T>> {
  let current = make()
  function make() {
    return reactLazy(() => factory().catch((err: unknown) => {
      failed.add(retry)
      throw err
    }))
  }
  function retry() { current = make() }
  const Lazy: FunctionComponent<ComponentProps<T>> = (props) => createElement(current, props)
  return Lazy
}

/**
 * A lazy part that can be fetched ahead of use (`preload`, on idle) and, once in,
 * renders without suspending: a lazy component suspends on its first render even
 * when its chunk is in, and React 19 holds a revealed boundary ~300 ms. Before its
 * chunk is in it suspends like lazy(), so it still needs a Suspense with a skeleton.
 */
export function preloadable<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>): FunctionComponent<ComponentProps<T>> & { preload: () => Promise<unknown> } {
  let loaded: T | undefined
  let pending: Promise<{ default: T }> | undefined
  const load = () => (pending ??= factory().then((m) => { loaded = m.default; return m }, (err: unknown) => { pending = undefined; throw err }))
  const Lazy = lazy(load)
  // Chosen once per mount, so a part that mounted lazily is never swapped for the loaded type (which would remount it).
  const Part: FunctionComponent<ComponentProps<T>> = (props) => createElement(useState<ComponentType<any>>(() => loaded ?? Lazy)[0], props)
  return Object.assign(Part, { preload: load })
}

/** Gives every lazy part whose import failed a fresh import for its next render; returns how many. */
export function retryFailedImports(): number {
  const n = failed.size
  for (const retry of failed) retry()
  failed.clear()
  return n
}

/** Whether an error is a code chunk that could not be fetched (Chromium, Safari and Firefox wording). */
export function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message)
}
