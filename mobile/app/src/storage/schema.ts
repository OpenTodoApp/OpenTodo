// The SQLite tables of the app's database (OpenSpec change native-app-foundation D4),
// read from the schema db.ts declares on its Dexie instance (`version(n).stores(…)`),
// which the adapter is handed before anything opens. One table per store:
//
//   pk    the primary key (no type affinity, so a number stays a number)
//   json  the row, as JSON text
//   "i:<keyPath>"  one generated column per key path an index names, and a SQL index
//         per Dexie index (compound ones over several columns)
//
// A generated column holds the value only when IndexedDB would index it (a number or a
// string; booleans, null, objects and missing values are not keys), so a query on it
// selects the rows Dexie's index holds. SQLite orders numbers before strings, as
// IndexedDB does. Strings compare as UTF-8 bytes here and as UTF-16 units there, which
// differ only between characters above U+FFFF and those from U+E000 to U+FFFF.
//
// The phone adds columns of its own (PHONE_INDEXES): the start screens ask for their
// rows by these, never by reading the whole table (lists.ts). The web's schema is
// unchanged by them.
import type Dexie from 'dexie'

export interface Store {
  name: string
  /** The primary key's path in the row (every store of db.ts has an inbound key). */
  key: string
  /** `++key`: the key is generated, counting up from the highest ever used. */
  auto: boolean
  /** Every index: its name (`project_id`, `[project_id+position]`) and its key paths. */
  indexes: { name: string; paths: string[] }[]
}

/**
 * Phone-only indexes per store, as key paths: Today asks for the open tasks by do-on
 * date, deadline and start date, Inbox for the open tasks without a project. The first
 * column is null for every open task, which SQLite's `IS NULL` reads as an equality, so
 * each is one range of the index (lists.ts).
 */
export const PHONE_INDEXES: Record<string, string[][]> = {
  tasks: [['completed_at', 'due.date'], ['completed_at', 'deadline'], ['completed_at', 'start'], ['completed_at', 'project_id']],
}

export function storesOf(declared: Dexie): Store[] {
  // An upgrade function would rewrite rows on open, which this adapter does not do.
  const versions = (declared as unknown as { _versions: { _cfg: { version: number; contentUpgrade?: unknown } }[] })._versions
  const upgrade = versions.find((v) => v._cfg.contentUpgrade)
  if (upgrade) throw new Error(`storage: db.ts version ${upgrade._cfg.version} has an upgrade function, which the SQLite adapter cannot run`)
  return declared.tables.map((t) => {
    const { primKey, indexes } = t.schema
    if (typeof primKey.keyPath !== 'string' || !primKey.keyPath) throw new Error(`storage: ${t.name} needs an inbound primary key`)
    for (const i of indexes) if (i.multi || i.unique) throw new Error(`storage: ${t.name}.${i.name}: multi-entry and unique indexes are not supported`)
    const own = indexes.map((i) => ({ name: i.name, paths: typeof i.keyPath === 'string' ? [i.keyPath] : [...(i.keyPath ?? [])] }))
    const phone = (PHONE_INDEXES[t.name] ?? []).map((paths) => ({ name: `phone:${paths.join('+')}`, paths }))
    return { name: t.name, key: primKey.keyPath, auto: !!primKey.auto, indexes: [...own, ...phone] }
  })
}

export const quote = (name: string) => `"${name.replace(/"/g, '""')}"`
export const columnOf = (path: string) => quote(`i:${path}`)
const jsonPath = (path: string) => `'$${path.split('.').map((p) => `."${p.replace(/["']/g, '')}"`).join('')}'`

/** A number or string at `path`, else NULL: what IndexedDB would take as a key there. */
function keyExpression(path: string): string {
  const p = jsonPath(path)
  return `CASE json_type(json, ${p}) WHEN 'integer' THEN json_extract(json, ${p}) WHEN 'real' THEN json_extract(json, ${p}) WHEN 'text' THEN json_extract(json, ${p}) END`
}

/** Every key path any index of the store names, once. */
export function pathsOf(store: Store): string[] {
  return [...new Set(store.indexes.flatMap((i) => i.paths))].filter((p) => p !== store.key)
}

/** The statements that create the store, each idempotent; `columns` are the generated columns it already has. */
export function ddl(store: Store, columns: ReadonlySet<string>): string[] {
  const t = quote(store.name)
  const out = [store.auto
    ? `CREATE TABLE IF NOT EXISTS ${t} (pk INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL)`
    : `CREATE TABLE IF NOT EXISTS ${t} (pk PRIMARY KEY, json TEXT NOT NULL)`]
  for (const path of pathsOf(store)) {
    if (!columns.has(`i:${path}`)) out.push(`ALTER TABLE ${t} ADD COLUMN ${columnOf(path)} GENERATED ALWAYS AS (${keyExpression(path)}) VIRTUAL`)
  }
  for (const index of store.indexes) {
    const cols = index.paths.map((p) => (p === store.key ? 'pk' : columnOf(p)))
    out.push(`CREATE INDEX IF NOT EXISTS ${quote(`${store.name}:${index.name}`)} ON ${t} (${cols.join(', ')}, pk)`)
  }
  return out
}
