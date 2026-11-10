// The SQLite under the app's database (OpenSpec change native-app-foundation D4): the
// few calls the Dexie-subset adapter makes. op-sqlite on the phone (opSqlite.ts), where
// every statement runs on the connection's own thread and the JS thread waits on a
// promise, so a long statement never blocks a frame; node:sqlite in the tests
// (test/storage/nodeSqlite.ts).
export type Value = string | number | null

export interface SqlConnection {
  /** The first column of every row of the result. */
  column(sql: string, params?: Value[]): Promise<Value[]>
  /** Runs a statement; how many rows it changed. */
  run(sql: string, params?: Value[]): Promise<number>
  close(): void
}

export interface Sql {
  /** Opens (or creates) the database file `name`. */
  open(name: string): SqlConnection
  /** Deletes the database file `name` and its journal; it must be closed. */
  remove(name: string): void
}
