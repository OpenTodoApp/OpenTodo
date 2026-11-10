// Type-check only (tsconfig.json paths): the shared modules' `import type` chains
// reach web modules that use this hook. It never runs in the app (design D2), so the
// app does not install it; this is its signature. Web's own type-check covers those
// modules against the real package. Remove it when the shared graph no longer
// reaches a module that imports it.
export function useLiveQuery<T>(querier: () => Promise<T> | T, deps?: unknown[]): T | undefined
export function useLiveQuery<T, D>(querier: () => Promise<T> | T, deps: unknown[], defaultResult: D): T | D
