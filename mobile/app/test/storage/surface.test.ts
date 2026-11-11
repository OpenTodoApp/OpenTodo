/**
 * @jest-environment node
 */
// The adapter covers the Dexie API the shared modules call (design D4). surface.json is
// generated from the shared graph by scripts/dexie-surface.mjs (make app fails when it
// is stale), so a shared module that starts calling a new member fails here until the
// adapter has it, or the member is listed below with the reason it needs nothing.
import Dexie from 'dexie'
import { useDatabase as openDatabaseNamed } from '@shared/db'
import surface from '../../src/storage/surface.json'
import { Collection, sqliteDatabase, WhereClause } from '../../src/storage/adapter'
import { nodeSqlite } from './nodeSqlite'

/** Members the adapter does not implement, and why none is needed. */
const NOT_THE_ADAPTERS: Record<string, string> = {
  'Dexie.version': 'db.ts declares its schema on the Dexie it constructs; the adapter reads it from there',
  'Version.stores': 'the same',
  'DexieConstructor.currentTransaction': "Dexie's own: null in the adapter's transactions, which need no waitFor (they do not commit while awaiting)",
  'DexieConstructor.waitFor': 'the same',
  'DexieConstructor.minKey': "Dexie's constant, understood by the adapter's key ranges",
  'DexieConstructor.maxKey': 'the same',
  'import.liveQuery': "Dexie's own; it reads through the adapter once and is not live here (the app reads again on onChange)",
  'Observable.subscribe': 'part of liveQuery',
  'Subscription.unsubscribe': 'part of liveQuery',
  'PromiseExtended.finally': "the adapter returns promises, which have finally",
}

describe('the Dexie surface of the shared modules', () => {
  const db = sqliteDatabase(openDatabaseNamed('surface'), nodeSqlite())
  const table = db.tasks as unknown as Record<string, unknown>
  const objects: Record<string, unknown> = {
    Dexie: db,
    Table: table,
    WhereClause: WhereClause.prototype,
    Collection: Collection.prototype,
  }

  it.each(Object.keys(surface.members))('%s', (member) => {
    if (NOT_THE_ADAPTERS[member]) return
    const [owner, name] = member.split('.')
    const target = objects[owner] as Record<string, unknown> | undefined
    expect(target).toBeDefined()
    expect(name in (target as object)).toBe(true)
  })

  it('lists no reason for a member the shared modules no longer call', () => {
    for (const m of Object.keys(NOT_THE_ADAPTERS)) expect(Object.keys(surface.members)).toContain(m)
  })

  it('keeps the key-range constants the adapter understands', () => {
    expect(Dexie.minKey).toBe(-Infinity)
  })
})
