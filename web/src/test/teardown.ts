// The one teardown after every test (test-setup.ts): unmount what the test
// rendered, put the clock back, then close and delete the local databases it
// opened. Without it a React root outlives its test, and its live queries and
// timers fire into the next test or into a torn-down environment ("window is not
// defined", "Database has been closed").
//
// This module stays free of React and Dexie imports so that the setup file costs
// nothing in tests that use neither: render() (ui/test-utils) registers its roots
// here, and Dexie is found through the global it registers itself under.
import { vi } from 'vitest'
import { runTestTeardown } from '../lib/testTeardown'

type Unmount = () => Promise<void>

const roots = new Set<Unmount>()

/** Track a rendered root until it is unmounted; returns the call that untracks it. */
export function trackRoot(unmount: Unmount): () => void {
  roots.add(unmount)
  return () => roots.delete(unmount)
}

interface DexieConnection {
  name: string
  tables: unknown[]
  isOpen(): boolean
  transaction(mode: 'rw', tables: unknown[], fn: () => void): Promise<unknown>
  close(options?: { disableAutoOpen?: boolean }): void
}

interface DexieStatic {
  connections: DexieConnection[]
  delete(name: string): Promise<void>
}

const macrotask = () => new Promise<void>((r) => setTimeout(r, 0))

async function unmountAll(): Promise<void> {
  for (const unmount of [...roots].reverse()) {
    roots.delete(unmount)
    try {
      await unmount()
    } catch (err) {
      // A root whose tree throws while unmounting must not stop the others.
      console.error('teardown: unmount failed', err)
    }
  }
  if (typeof document !== 'undefined') document.body.innerHTML = ''
}

async function closeDatabases(): Promise<void> {
  const Dexie = (globalThis as Record<symbol, unknown>)[Symbol.for('Dexie')] as DexieStatic | undefined
  if (!Dexie) return
  const open = [...Dexie.connections]
  for (const d of open) {
    // A write the test started but did not await finishes first: a read-write
    // transaction over every table queues behind the ones in flight.
    if (d.isOpen()) await d.transaction('rw', d.tables, () => {}).catch(() => {})
  }
  const names = new Set(open.map((d) => d.name))
  // Close every connection first, so deleting is never blocked and no database
  // sees a version change; the instance reopens itself if the next test uses it.
  for (const d of open) d.close({ disableAutoOpen: false })
  for (const name of names) await Dexie.delete(name).catch(() => {})
}

/** Run after each test: unmount, real timers, then an empty local database. */
export async function teardown(): Promise<void> {
  await unmountAll()
  if (vi.isFakeTimers()) vi.useRealTimers()
  // Background work modules scheduled themselves (a debounced sync) stops.
  await runTestTeardown()
  // Effects scheduled by the unmount (a write on blur, a debounced save) start now.
  await macrotask()
  await closeDatabases()
}
