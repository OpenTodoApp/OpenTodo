// Candidate A of design D4: fake-indexeddb held in memory, persisted to one SQLite file.
// At start every stored record is loaded into the memory engine; each committed
// read-write transaction writes the records it changed to SQLite, in one SQLite
// transaction, from the first `complete` listener, before Dexie sees the commit.
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import FDBDatabase from 'fake-indexeddb/lib/FDBDatabase'
import FDBObjectStore from 'fake-indexeddb/lib/FDBObjectStore'
import { bulkLoad } from './fastIndexes'
import { sql, type Param, type SqlDb } from './sqlite'

type Change = ['put', string, Param, string] | ['del', string, Param] | ['range', string, Param, Param, boolean, boolean] | ['clear', string]

const state: { pending: WeakMap<object, Change[]>; sqlite: SqlDb | null; silent: boolean; writes: number; writeMs: number; load?: Record<string, unknown> } = {
  pending: new WeakMap(), sqlite: null, silent: false, writes: 0, writeMs: 0,
}
let patched = false

const keyParam = (k: unknown): Param => (typeof k === 'number' || typeof k === 'string' ? k : JSON.stringify(k))

function record(tx: object, c: Change) {
  if (state.silent || !state.sqlite) return
  state.pending.get(tx)?.push(c)
}

function flush(changes: Change[]) {
  const db = state.sqlite
  if (!db || changes.length === 0) return
  const t0 = performance.now()
  db.run('BEGIN')
  try {
    for (const c of changes) {
      if (c[0] === 'put') db.run('INSERT OR REPLACE INTO records (store, k, v) VALUES (?, ?, ?)', [c[1], c[2], c[3]])
      else if (c[0] === 'del') db.run('DELETE FROM records WHERE store = ? AND k = ?', [c[1], c[2]])
      else if (c[0] === 'clear') db.run('DELETE FROM records WHERE store = ?', [c[1]])
      else {
        const [, store, lower, upper, lo, uo] = c
        const where = ['store = ?']
        const params: Param[] = [store]
        if (lower !== null) { where.push(`k ${lo ? '>' : '>='} ?`); params.push(lower) }
        if (upper !== null) { where.push(`k ${uo ? '<' : '<='} ?`); params.push(upper) }
        db.run(`DELETE FROM records WHERE ${where.join(' AND ')}`, params)
      }
    }
    db.run('COMMIT')
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
  state.writes += changes.length
  state.writeMs += performance.now() - t0
}

// The patch reaches fake-indexeddb's prototypes, untyped.
function patch() {
  if (patched) return
  patched = true
  const DB = FDBDatabase.prototype as any
  const OS = FDBObjectStore.prototype as any
  const transaction = DB.transaction
  DB.transaction = function (this: any, ...a: any[]) {
    const t = transaction.apply(this, a)
    if (t.mode === 'readwrite' && !state.silent) {
      const changes: Change[] = []
      state.pending.set(t, changes)
      // The first listener: SQLite holds the records before Dexie hears of the commit.
      t.addEventListener('complete', () => flush(changes))
    }
    return t
  }
  for (const name of ['put', 'add'] as const) {
    const orig = OS[name]
    OS[name] = function (this: any, value: any, key?: any) {
      const r = orig.call(this, value, key)
      if (!state.silent && state.sqlite) {
        const store = this.name as string
        const keyPath = this.keyPath as string | null
        const json = JSON.stringify(value)
        const t = this.transaction
        r.addEventListener('success', () => {
          let v = json
          // An auto-increment key the engine generated goes into the stored copy.
          if (typeof keyPath === 'string' && value[keyPath] === undefined) v = JSON.stringify({ ...value, [keyPath]: r.result })
          record(t, ['put', store, keyParam(r.result), v])
        })
      }
      return r
    }
  }
  const del = OS.delete
  OS.delete = function (this: any, key: any) {
    if (key instanceof IDBKeyRange) record(this.transaction, ['range', this.name, key.lower === undefined ? null : keyParam(key.lower), key.upper === undefined ? null : keyParam(key.upper), !!key.lowerOpen, !!key.upperOpen])
    else record(this.transaction, ['del', this.name, keyParam(key)])
    return del.call(this, key)
  }
  const clear = OS.clear
  OS.clear = function (this: any) {
    record(this.transaction, ['clear', this.name])
    return clear.call(this)
  }
}

export interface CandidateA {
  indexedDB: IDBFactory
  IDBKeyRange: typeof IDBKeyRange
  /** Loads the records into the opened database; the count. With the bulk start-up, `start` is every store but the activity log, which `deferred` loads after the first screen. */
  load(idb: IDBDatabase, part?: 'start' | 'deferred'): Promise<number>
  /** Records written to SQLite so far, and the time it took. */
  stats(): { writes: number; writeMs: number; load?: Record<string, unknown> }
}

/** Opens (or creates) the SQLite file and returns the memory engine with persistence on. */
export function openCandidateA(file: string, opts: { bulk: boolean }): CandidateA {
  patch()
  const indexedDB = new IDBFactory()
  const db = sql().open(file)
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA synchronous = NORMAL')
  db.run('CREATE TABLE IF NOT EXISTS records (store TEXT NOT NULL, k, v TEXT NOT NULL, PRIMARY KEY (store, k)) WITHOUT ROWID')
  state.sqlite = db
  return {
    indexedDB,
    IDBKeyRange,
    stats: () => ({ writes: state.writes, writeMs: Math.round(state.writeMs), load: state.load }),
    async load(idb, part = 'start') {
      const t0 = performance.now()
      const filter = opts.bulk ? (part === 'start' ? " WHERE store NOT IN ('activity')" : " WHERE store IN ('activity')") : part === 'start' ? '' : ' WHERE 0'
      const rows = db.all(`SELECT store, k, v FROM records${filter}`) as { store: string; k: string | number; v: string }[]
      const t1 = performance.now()
      if (rows.length === 0) return 0
      if (opts.bulk) {
        const byStore = new Map<string, { key: unknown; value: unknown }[]>()
        for (const r of rows) {
          const list = byStore.get(r.store) ?? []
          if (list.length === 0) byStore.set(r.store, list)
          list.push({ key: r.k, value: JSON.parse(r.v) })
        }
        const t2 = performance.now()
        const perStore: Record<string, number> = {}
        for (const [store, list] of byStore) {
          const s = performance.now()
          bulkLoad(idb, store, list)
          perStore[store] = Math.round(performance.now() - s)
        }
        state.load = { part, selectMs: Math.round(t1 - t0), parseMs: Math.round(t2 - t1), buildMs: Math.round(performance.now() - t2), perStore }
        return rows.length
      }
      const names = [...new Set(rows.map((r) => r.store))].filter((s) => idb.objectStoreNames.contains(s))
      state.silent = true
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = idb.transaction(names, 'readwrite')
          const stores = new Map(names.map((n) => [n, tx.objectStore(n)]))
          for (const r of rows) {
            const s = stores.get(r.store)
            if (!s) continue
            if (s.keyPath === null) s.put(JSON.parse(r.v), r.k)
            else s.put(JSON.parse(r.v))
          }
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      } finally {
        state.silent = false
      }
      return rows.length
    },
  }
}
