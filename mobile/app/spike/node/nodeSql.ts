// node:sqlite as the spike's SQLite on a computer (the phone uses op-sqlite).
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Param, SqlHost } from '../sqlite'

export function nodeSql(dir: string): SqlHost {
  mkdirSync(dir, { recursive: true })
  return {
    open(name) {
      const db = new DatabaseSync(join(dir, name))
      return {
        all: (sql: string, params: Param[] = []) => db.prepare(sql).all(...params) as Record<string, unknown>[],
        run: (sql: string, params: Param[] = []) => {
          const r = db.prepare(sql).run(...params)
          return { insertId: Number(r.lastInsertRowid), changes: Number(r.changes) }
        },
        close: () => db.close(),
      }
    },
    remove(name) {
      for (const f of [name, `${name}-wal`, `${name}-shm`]) rmSync(join(dir, f), { force: true })
    },
  }
}
