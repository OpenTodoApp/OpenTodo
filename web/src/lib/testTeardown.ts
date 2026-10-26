// Background work a module schedules on its own (a debounced sync, a retry timer)
// must not outlive the test that started it. Such a module registers how to stop
// it here; the shared test teardown (src/test/teardown.ts) runs the hooks after
// every test. The app never runs them: in the browser this is one small Set.
const hooks = new Set<() => unknown>()

export function onTestTeardown(fn: () => unknown): void {
  hooks.add(fn)
}

export async function runTestTeardown(): Promise<void> {
  for (const fn of hooks) await fn()
}
