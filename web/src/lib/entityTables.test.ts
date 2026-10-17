// One registry of the Dexie table of each synced entity kind (OpenSpec change
// web-layering, DATA-8): ops, undo, sharing, sync and end-to-end encryption all
// look tables up through tableOf/syncedTables in db.ts, with no fallback table.
// A new entity kind on the server (the shared schema fixture) without a table, or
// a module that maps kinds to tables itself again, fails here.
import { describe, expect, it } from 'vitest'
import fixture from '../../../internal/sync/testdata/schema_fixture.json'
import { db, entityTables, syncedTables, tableOf } from './db'
import type { Entity } from './types'

const kinds = Object.keys(fixture.entities) as Entity[]
const sources = import.meta.glob<string>(['./*.ts', '!./*.test.ts', '!./db.ts'], { query: '?raw', import: 'default', eager: true })

describe('entity table registry', () => {
  it('has a distinct table of this database for every entity kind of the server schema', () => {
    const names = kinds.map((kind) => tableOf(kind).name)
    expect(new Set(names).size).toBe(kinds.length)
    for (const name of names) expect(db.tables.map((t) => t.name)).toContain(name)
    expect(syncedTables().map((t) => t.name).sort()).toEqual([...names].sort())
    expect(entityTables().map((t) => t.name)).toEqual([...syncedTables().map((t) => t.name), 'activity'])
  })

  it('has no fallback table', () => {
    expect(() => tableOf('nonsense' as Entity)).toThrow(/unknown entity kind/)
  })

  it('is the only entity-to-table mapping in the data layer', () => {
    const kind = kinds.join('|')
    // `task: db.tasks`, `'task': db.tasks`, `case 'task': return db.tasks`, `entity === 'task' ? db.tasks`.
    const mapping = new RegExp(`(\\b(${kind})'?\\s*:\\s*(d|db)\\.[a-zA-Z]+\\b(?!\\())|(case '(${kind})':\\s*return (d|db)\\.)|(=== '(${kind})' \\? db\\.)`)
    const found = Object.entries(sources).filter(([, src]) => mapping.test(src)).map(([path]) => path)
    expect(found).toEqual([])
  })
})
