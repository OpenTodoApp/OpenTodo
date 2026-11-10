// op-sqlite as the spike's SQLite on the phone: synchronous JSI calls on the JS thread.
import { open } from '@op-engineering/op-sqlite'
import type { Param, SqlHost } from './sqlite'

export function opSql(): SqlHost {
  return {
    open(name) {
      const db = open({ name })
      return {
        all: (q: string, params: Param[] = []) => db.executeSync(q, params).rows as Record<string, unknown>[],
        run: (q: string, params: Param[] = []) => {
          const r = db.executeSync(q, params)
          return { insertId: r.insertId, changes: r.rowsAffected }
        },
        close: () => db.close(),
      }
    },
    remove(name) {
      open({ name }).delete()
    },
  }
}
