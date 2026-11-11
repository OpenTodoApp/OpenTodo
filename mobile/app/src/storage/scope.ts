// Which transaction a call belongs to (OpenSpec change native-app-foundation D4). The
// shared modules write `db.transaction('rw', tables, async () => { await db.tasks.get(…) })`
// and call the database's tables, not the transaction's, so the adapter has to know
// whether a call comes from inside a running transaction (it runs on the open SQLite
// transaction) or from anywhere else (it waits until the transaction ends, as
// IndexedDB makes it wait). That is a zone: a value that follows the async calls a
// function starts. Dexie keeps one for its own transactions (PSD), and the app uses it
// for the adapter's: the same mechanism, with the same requirement on Hermes, that
// async functions are compiled to generators driven by the global Promise
// (babel.config.js), which Dexie swaps for its own inside a zone.
import Dexie from 'dexie'

export interface Scope {
  readonly owner: object
  /** The stores written in this transaction, for the change event at commit. */
  readonly changed: Set<string>
  done: boolean
}

interface Zones {
  PSD: { sqliteScope?: Scope }
  newPSD<T>(fn: () => T, props: { sqliteScope: Scope }): T
}

const zones = Dexie.Promise as unknown as Zones

/** The running transaction of `owner` that this call belongs to, if any. */
export function currentScope(owner: object): Scope | undefined {
  const s = zones.PSD.sqliteScope
  return s && !s.done && s.owner === owner ? s : undefined
}

/** Runs fn in the scope: every call it makes, across awaits, sees the scope. */
export function runInScope<T>(scope: Scope, fn: () => T | Promise<T>): Promise<T> {
  return zones.newPSD(() => Promise.resolve().then(fn), { sqliteScope: scope })
}

/** One at a time, in call order: what runs on the connection outside a transaction. */
export class Lock {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn)
    this.tail = next.then(() => undefined, () => undefined)
    return next
  }
}
