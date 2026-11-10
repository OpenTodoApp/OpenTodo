// fake-indexeddb removes a record's old index entries by scanning every entry of every
// index of the store (RecordStore.deleteByValue), so each overwrite of a task costs
// eight scans of 10,000 entries. This patch removes them by the old record's own index
// keys instead, in O(log n): candidate A "with the index fix". The slow scan stays as
// the fallback whenever an entry is not where the old value says it is.
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

interface RawIndex { keyPath: string | string[]; multiEntry: boolean; records: any }
interface RawStore { keyPath: string | string[] | null; records: any; rawIndexes: Map<string, RawIndex> }

let installed = false
let enabled = false
let old: { store: RawStore; value: unknown } | null = null
const indexOf = new WeakMap<object, RawIndex>()

function read(path: string, value: unknown): unknown {
  let v: any = value
  for (const part of path.split('.')) {
    if (v === null || typeof v !== 'object' || !(part in v)) return undefined
    v = v[part]
  }
  return v
}

const validKey = (k: unknown): boolean =>
  (typeof k === 'number' && !Number.isNaN(k)) || typeof k === 'string' || (k instanceof Date && !Number.isNaN(k.getTime())) || (Array.isArray(k) && k.every(validKey))

/** The record's key under a key path, or undefined when it has none (no entry in that index). */
export function keyOf(path: string | string[], value: unknown): unknown {
  const k = Array.isArray(path) ? path.map((p) => read(p, value)) : read(path, value)
  return validKey(k) ? k : undefined
}

/** IndexedDB's key order for the keys this data has (numbers before strings, arrays by element). */
export function cmpKeys(a: unknown, b: unknown): number {
  const ta = Array.isArray(a) ? 3 : typeof a === 'string' ? 2 : a instanceof Date ? 1 : 0
  const tb = Array.isArray(b) ? 3 : typeof b === 'string' ? 2 : b instanceof Date ? 1 : 0
  if (ta !== tb) return ta - tb
  if (ta === 3) {
    const x = a as unknown[], y = b as unknown[]
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      const c = cmpKeys(x[i], y[i])
      if (c !== 0) return c
    }
    return x.length - y.length
  }
  const x = ta === 1 ? (a as Date).getTime() : a as number | string
  const y = tb === 1 ? (b as Date).getTime() : b as number | string
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Candidate A's start-up: puts a store's records straight into fake-indexeddb's trees,
 * sorted and built in one pass, with every index, instead of one request per record.
 */
export function bulkLoad(idb: IDBDatabase, store: string, records: { key: unknown; value: unknown }[]): boolean {
  const raw = (idb as any)._rawDatabase?.rawObjectStores?.get(store) as (RawStore & { keyGenerator: { setIfLarger(n: number): void } | null }) | undefined
  if (!raw) return false
  for (const r of records) if (raw.keyPath !== null) r.key = keyOf(raw.keyPath, r.value)
  const list = records.filter((r) => r.key !== undefined).sort((x, y) => cmpKeys(x.key, y.key))
  const build = (tree: any, sorted: unknown[]) => {
    tree._root = tree._rebuild(sorted, undefined, false)
    tree._numNodes = sorted.length
    tree._numTombstones = 0
  }
  build(raw.records.records, list)
  if (raw.keyGenerator) for (const r of list) if (typeof r.key === 'number') raw.keyGenerator.setIfLarger(r.key)
  for (const ix of raw.rawIndexes.values()) {
    const entries: { key: unknown; value: unknown }[] = []
    for (const r of list) {
      const k = keyOf(ix.keyPath, r.value)
      if (k === undefined) continue
      if (ix.multiEntry && Array.isArray(k)) for (const part of new Set(k)) entries.push({ key: part, value: r.key })
      else entries.push({ key: k, value: r.key })
    }
    entries.sort((x, y) => cmpKeys(x.key, y.key) || cmpKeys(x.value, y.value))
    build(ix.records.records, entries)
  }
  return true
}

/** Deletes the entries of `pk` under the old value's keys; false when one is not found. */
function fastDelete(index: RawIndex, pk: unknown): boolean {
  const k = keyOf(index.keyPath, old!.value)
  if (k === undefined) return true
  const keys = index.multiEntry && Array.isArray(k) ? [...new Set(k)] : [k]
  const tree = index.records.records
  for (const key of keys) {
    const rec = { key, value: pk }
    const found = tree.get(rec)
    if (!found) return false
    tree.delete(found)
  }
  return true
}

/** Installs the patch on fake-indexeddb's internal prototypes (reached through a probe database). */
export async function installFastIndexes(): Promise<void> {
  if (installed) return
  installed = true
  const factory = new IDBFactory()
  const db = await new Promise<any>((resolve, reject) => {
    const req = factory.open('fast-indexes-probe')
    req.onupgradeneeded = () => { req.result.createObjectStore('s', { keyPath: 'id' }).createIndex('i', 'i') }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  const raw = db._rawDatabase.rawObjectStores.get('s')
  const index = raw.rawIndexes.get('i')
  const Store = Object.getPrototypeOf(raw)
  const Records = Object.getPrototypeOf(index.records)
  db.close()

  const storeRecord = Store.storeRecord
  Store.storeRecord = function (this: RawStore, record: { key?: unknown; value: unknown }, ...rest: unknown[]) {
    if (!enabled) return storeRecord.call(this, record, ...rest)
    const key = this.keyPath !== null ? keyOf(this.keyPath, record.value) : record.key
    const existing = key === undefined ? undefined : this.records.get(key)
    if (!existing) return storeRecord.call(this, record, ...rest)
    for (const ix of this.rawIndexes.values()) indexOf.set(ix.records, ix)
    old = { store: this, value: existing.value }
    try { return storeRecord.call(this, record, ...rest) } finally { old = null }
  }
  const deleteRecord = Store.deleteRecord
  Store.deleteRecord = function (this: RawStore, key: unknown, ...rest: unknown[]) {
    if (!enabled || key instanceof IDBKeyRange) return deleteRecord.call(this, key, ...rest)
    const existing = this.records.get(key)
    if (!existing) return deleteRecord.call(this, key, ...rest)
    for (const ix of this.rawIndexes.values()) indexOf.set(ix.records, ix)
    old = { store: this, value: existing.value }
    try { return deleteRecord.call(this, key, ...rest) } finally { old = null }
  }
  const deleteByValue = Records.deleteByValue
  Records.deleteByValue = function (this: object, pk: unknown) {
    const ix = old ? indexOf.get(this) : undefined
    if (ix && fastDelete(ix, pk)) return []
    return deleteByValue.call(this, pk)
  }
}

export function setFastIndexes(on: boolean): void {
  enabled = on
}
