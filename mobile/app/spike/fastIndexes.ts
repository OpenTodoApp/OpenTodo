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

function keyOf(path: string | string[], value: unknown): unknown {
  if (Array.isArray(path)) {
    const parts = path.map((p) => read(p, value))
    return parts.some((p) => p === undefined || p === null || typeof p === 'boolean') ? undefined : parts
  }
  const k = read(path, value)
  return k === null || typeof k === 'boolean' ? undefined : k
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
