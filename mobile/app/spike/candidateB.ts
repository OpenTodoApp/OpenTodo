// Candidate B of design D4: indexeddbshim, which implements IndexedDB on SQL tables
// through the WebSQL API. The phone has no WebSQL, so this file gives it one over the
// same synchronous SQLite as candidate A: a database runs one transaction at a time,
// each statement's callback may queue more, and the transaction commits when its
// queue is empty, as WebSQL does.
import { sql, type Param, type Row, type SqlDb } from './sqlite'

interface Statement { sql: string; args: Param[]; ok?: (tx: WebSQLTx, rs: ResultSet) => void; err?: (tx: WebSQLTx, e: SQLError) => boolean | void }
interface ResultSet { insertId?: number; rowsAffected: number; rows: { length: number; item(i: number): Row; _array: Row[] } }
interface SQLError { code: number; message: string }

class WebSQLTx {
  queue: Statement[] = []
  constructor(private readOnly: boolean) {}
  executeSql(text: string, args: Param[] = [], ok?: Statement['ok'], err?: Statement['err']) {
    if (this.readOnly && !/^\s*SELECT\b/i.test(text)) {
      this.queue.push({ sql: 'SELECT 1', args: [], err, ok: (tx) => { err?.(tx, { code: 5, message: 'read-only transaction' }) } })
      return
    }
    this.queue.push({ sql: text, args, ok, err })
  }
}

const later: (fn: () => void) => void = typeof setImmediate === 'function' ? (fn) => { setImmediate(fn) } : (fn) => { setTimeout(fn, 0) }

function webSQLDatabase(conn: SqlDb, version: string) {
  const waiting: (() => void)[] = []
  let busy = false
  const next = () => {
    const job = waiting.shift()
    if (job) { busy = true; later(job) } else busy = false
  }
  const enqueue = (job: () => void) => {
    waiting.push(job)
    if (!busy) next()
  }
  const run = (readOnly: boolean, cb: (tx: WebSQLTx) => void, onError?: (e: SQLError) => void, onSuccess?: () => void) => enqueue(() => {
    const tx = new WebSQLTx(readOnly)
    const fail = (e: SQLError) => {
      try { conn.run('ROLLBACK') } catch { /* nothing open */ }
      onError?.(e)
      next()
    }
    conn.run(readOnly ? 'BEGIN DEFERRED' : 'BEGIN IMMEDIATE')
    try { cb(tx) } catch (e) { fail({ code: 0, message: String(e) }); return }
    while (tx.queue.length) {
      const s = tx.queue.shift()!
      let rs: ResultSet
      try {
        const select = /^\s*(SELECT|PRAGMA)\b/i.test(s.sql)
        const rows = select ? conn.all(s.sql, s.args) : []
        const r = select ? { changes: 0, insertId: undefined } : conn.run(s.sql, s.args)
        rs = { insertId: r.insertId, rowsAffected: r.changes, rows: { length: rows.length, item: (i) => rows[i], _array: rows } }
      } catch (e) {
        const error = { code: 5, message: String((e as Error).message ?? e) }
        // An error callback that returns false lets the transaction go on (WebSQL).
        if (s.err && s.err(tx, error) === false) continue
        fail(error)
        return
      }
      try { s.ok?.(tx, rs) } catch (e) { fail({ code: 0, message: String(e) }); return }
    }
    conn.run('COMMIT')
    onSuccess?.()
    next()
  })
  return {
    version,
    transaction: (cb: (tx: WebSQLTx) => void, onError?: (e: SQLError) => void, onSuccess?: () => void) => run(false, cb, onError, onSuccess),
    readTransaction: (cb: (tx: WebSQLTx) => void, onError?: (e: SQLError) => void, onSuccess?: () => void) => run(true, cb, onError, onSuccess),
    changeVersion: (_old: string, v: string, cb?: (tx: WebSQLTx) => void, onError?: (e: SQLError) => void, onSuccess?: () => void) => run(false, (tx) => cb?.(tx), onError, () => { version = v; onSuccess?.() }),
  }
}

const fileOf = (name: string) => `idbshim-${name.replace(/[^A-Za-z0-9_.-]/g, (c) => `_${c.charCodeAt(0).toString(16)}`)}.sqlite`

export interface CandidateB {
  indexedDB: IDBFactory
  IDBKeyRange: typeof IDBKeyRange
  /** The SQLite files the shim opened. */
  files(): string[]
}

const opened = new Map<string, SqlDb>()

export function openCandidateB(): CandidateB {
  const openDatabase = (name: string, version: string, _display: string, _size: number, cb?: (db: unknown) => void) => {
    const file = fileOf(name)
    let conn = opened.get(file)
    if (!conn) {
      conn = sql().open(file)
      conn.run('PRAGMA journal_mode = WAL')
      conn.run('PRAGMA synchronous = NORMAL')
      opened.set(file, conn)
    }
    const db = webSQLDatabase(conn, version)
    if (cb) later(() => cb(db))
    return db
  }
  // The UMD build without Unicode identifier tables; it reads `window` or `self` once.
  const setGlobalVars = require('indexeddbshim/dist/indexeddbshim-noninvasive.js') as (ns: object, cfg: object) => void
  const ns: { shimIndexedDB?: { __useShim(): void }; indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange } = {}
  setGlobalVars(ns, { win: { openDatabase }, checkOrigin: false, cacheDatabaseInstances: true, useSQLiteIndexes: true, DEFAULT_DB_SIZE: 25 * 1024 * 1024 })
  ns.shimIndexedDB!.__useShim()
  return { indexedDB: ns.indexedDB!, IDBKeyRange: ns.IDBKeyRange!, files: () => [...opened.keys()] }
}

/** Removes the shim's SQLite files (the next open starts empty). */
export function removeCandidateB(): void {
  for (const [file, conn] of opened) { conn.close(); sql().remove(file) }
  opened.clear()
}

export const shimFileOf = fileOf
