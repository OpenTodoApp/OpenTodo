// node:sqlite as the adapter's SQLite in the tests (op-sqlite is native; its Node build
// needs better-sqlite3, a compiled addon): the same statements, run synchronously and
// answered through a promise, as op-sqlite answers them.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Sql, Value } from '../../src/storage/sql'

export function nodeSqlite(dir = mkdtempSync(join(tmpdir(), 'opentodo-sqlite-'))): Sql & { dir: string } {
  mkdirSync(dir, { recursive: true })
  return {
    dir,
    open(name) {
      const db = new DatabaseSync(join(dir, name))
      return {
        column: async (sql: string, params: Value[] = []) => {
          const st = db.prepare(sql)
          st.setReturnArrays(true)
          return (st.all(...params) as unknown as Value[][]).map((r) => r[0])
        },
        run: async (sql: string, params: Value[] = []) => Number(db.prepare(sql).run(...params).changes),
        close: () => db.close(),
      }
    },
    remove(name) {
      for (const f of [name, `${name}-wal`, `${name}-shm`]) rmSync(join(dir, f), { force: true })
    },
  }
}
