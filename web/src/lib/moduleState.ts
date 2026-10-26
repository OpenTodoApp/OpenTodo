// Module-level state that tests reset between cases (improvement plan T1). A module
// that keeps mutable state at its top level (a clock, a cache, a flag, a timer)
// registers a function that puts it back as a fresh import would have it; the
// shared test setup (src/test-setup.ts) calls resetModuleState() before every
// test, so no test sees what an earlier one left behind. Only modules a test file
// imported are registered, and the app never calls resetModuleState().

const resets = new Map<string, () => void>()

/** Registers `reset` under `name` (one per module); returns it for the module's own use. */
export function resettable<T extends () => void>(name: string, reset: T): T {
  resets.set(name, reset)
  return reset
}

/** Puts every registered module back in its initial state. Tests only. */
export function resetModuleState(): void {
  for (const reset of resets.values()) reset()
}

/** The registered names, for the guard test. */
export function resettableNames(): string[] {
  return [...resets.keys()]
}
