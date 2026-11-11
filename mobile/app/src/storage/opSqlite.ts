// op-sqlite as the app's SQLite (design D4): one connection per database file, every
// statement on the connection's own thread (execute and executeRaw are asynchronous),
// in the app's documents folder, which iOS backs up and never evicts.
import { open } from '@op-engineering/op-sqlite'
import type { Sql, SqlConnection, Value } from './sql'

export function opSqlite(): Sql {
  return {
    open(name): SqlConnection {
      const db = open({ name })
      return {
        column: async (sql: string, params: Value[] = []) => (await db.executeRaw(sql, params)).rawRows.map((r) => r[0] as Value),
        run: async (sql: string, params: Value[] = []) => (await db.execute(sql, params)).rowsAffected,
        close: () => db.close(),
      }
    },
    remove(name) {
      open({ name }).delete()
    },
  }
}
