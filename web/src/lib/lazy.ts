// The app's lazy() (OpenSpec change lazy-retry-online). React keeps a lazy
// component's failed import and throws it on every render, so a part whose chunk
// could not be fetched offline stays broken after the connection returns. This one
// remembers the failed imports; retryFailedImports() gives each a fresh import for
// its next render (PanelBoundary calls it when the device is back online). Nothing
// retries on its own: React renders an errored tree once more before the boundary
// takes it, and an import retried there would loop while offline.
import { createElement, lazy as reactLazy, type ComponentProps, type ComponentType, type FunctionComponent } from 'react'
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
