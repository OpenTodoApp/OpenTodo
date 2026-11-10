// The SQLite the two storage candidates sit on (storage spike, design D4): op-sqlite on
// the phone, node:sqlite in the spike's Jest run on a computer. Synchronous calls only:
// both candidates need a write to finish before the IndexedDB event that follows it.
export type Param = string | number | null
export type Row = Record<string, unknown>

export interface SqlDb {
  all(sql: string, params?: Param[]): Row[]
  run(sql: string, params?: Param[]): { insertId?: number; changes: number }
  close(): void
}

export interface SqlHost {
  open(name: string): SqlDb
  remove(name: string): void
}

let host: SqlHost | null = null

export function installSql(h: SqlHost): void {
  host = h
}

export function sql(): SqlHost {
  if (!host) throw new Error('storage spike: no SQLite host installed')
  return host
}
