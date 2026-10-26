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

/** Every error is a removeChild of a node that is no longer in the document. */
function onlyDetached(err: unknown): boolean {
  const list = err instanceof AggregateError ? err.errors : [err]
  return list.every((e) => (e instanceof Error && e.name === 'NotFoundError') || /not a child of this node/.test(String((e as Error)?.message)))
}

async function unmountAll(): Promise<void> {
  for (const unmount of [...roots].reverse()) {
    roots.delete(unmount)
    try {
      await unmount()
    } catch (err) {
      // A test that emptied document.body itself left React nodes (portals) to
      // remove that are gone already: nothing is left to clean up.
      if (onlyDetached(err)) continue
      // A root whose tree throws while unmounting must not stop the others.
      console.error('teardown: unmount failed', err)
    }
  }
  // A test may stub document with a bare EventTarget (lib/sync.test.ts).
  if (typeof document !== 'undefined' && document.body) document.body.innerHTML = ''
}

// Every IndexedDB transaction started, counted at the IDBDatabase prototype, so the
// teardown can tell when the app has stopped starting new ones.
let started = 0
type TransactionProto = { transaction: (...args: unknown[]) => unknown; __counted?: boolean }
function countTransactions(): void {
  const proto = (globalThis as { IDBDatabase?: { prototype: TransactionProto } }).IDBDatabase?.prototype
  if (!proto || proto.__counted) return
  const original = proto.transaction
  proto.transaction = function (this: unknown, ...args: unknown[]) {
    started++
    return original.apply(this, args)
  }
  proto.__counted = true
}
countTransactions()

/** At most this many rounds of waiting for the app's own writes before closing. */
const SETTLE_ROUNDS = 20

const dexie = () => (globalThis as Record<symbol, unknown>)[Symbol.for('Dexie')] as DexieStatic | undefined

async function settle(): Promise<void> {
  const Dexie = dexie()
  if (!Dexie) return
  // Work the test started but did not await (a reload after a mocked request, a
  // write after a click) finishes first: wait until a round of the event loop
  // starts no transaction but ours, each round queueing a read-write transaction
  // over every table behind the ones in flight. Closing under a pending write
  // would reject it with "Database has been closed".
  for (let round = 0; round < SETTLE_ROUNDS; round++) {
    const before = started
    await new Promise<void>((r) => setTimeout(r, 5))
    const live = Dexie.connections.filter((d) => d.isOpen())
    for (const d of live) await d.transaction('rw', d.tables, () => {}).catch(() => {})
    if (started - before <= live.length) break
  }
}

async function closeDatabases(): Promise<void> {
  const Dexie = dexie()
  if (!Dexie) return
  const open = [...Dexie.connections]
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
  // Background work modules scheduled themselves (a debounced sync) stops; local
  // writes from here on schedule none.
  await runTestTeardown()
  // Effects scheduled by the unmount (a write on blur, a debounced save) start now,
  // and work the test left in flight finishes.
  await macrotask()
  await settle()
  // Once more: that work may have asked for an exchange itself.
  await runTestTeardown()
  await closeDatabases()
}
