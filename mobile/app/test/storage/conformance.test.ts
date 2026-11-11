/**
 * @jest-environment node
 */
// The SQLite adapter against Dexie (design D4): every scenario runs on db.ts's schema
// twice, once on Dexie over fake-indexeddb (what the web runs) and once on the adapter
// over node:sqlite (what the phone runs, with op-sqlite in place of node:sqlite), and
// both must give the same results. Together the scenarios call every member of
// src/storage/surface.json the adapter implements (surface.test.ts checks the list).
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { useDatabase as openDatabaseNamed } from '@shared/db'
import { sqliteDatabase, type SqliteDatabase } from '../../src/storage/adapter'
import { nodeSqlite } from './nodeSqlite'

type Db = ReturnType<typeof openDatabaseNamed>
let n = 0

function dexie(): Db {
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  return openDatabaseNamed(`conformance-${++n}`)
}

function sqlite(): Db & SqliteDatabase {
  return sqliteDatabase(dexie(), nodeSqlite())
}

const task = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, project_id: null, parent_id: null, position: 0, completed_at: null, deleted_at: null, ...extra })

const seedTasks = [
  task('a', { project_id: 'p1', position: 3 }),
  task('b', { project_id: 'p1', position: 1, parent_id: 'a' }),
  task('c', { project_id: 'p2', position: 2, completed_at: 5 }),
  task('d', { position: 2.5, parent_id: 'a' }),
  task('e', { project_id: 'p2', position: 'x' }), // a string position sorts after every number
  task('f', { project_id: true, position: null }), // neither is a key: in no index
]

const scenarios: Record<string, (db: Db) => Promise<unknown>> = {
  'put, get, bulkGet, count, toArray': async (db) => {
    const key = await db.tasks.put(task('a', { due: { date: '2026-11-10' }, labels: ['x'] }) as never)
    await db.tasks.bulkPut(seedTasks.slice(1) as never)
    return [key, await db.tasks.get('a'), await db.tasks.get('zz'), await db.tasks.bulkGet(['c', 'zz', 'a']), await db.tasks.count(), await db.tasks.toArray()]
  },
  'reads are copies': async (db) => {
    await db.tasks.put(task('a') as never)
    const one = await db.tasks.get('a') as unknown as { title: string }
    one.title = 'changed'
    return (await db.tasks.get('a'))?.title
  },
  'where equals, anyOf, filter, count, primaryKeys': async (db) => {
    await db.tasks.bulkPut(seedTasks as never)
    return [
      await db.tasks.where('project_id').equals('p1').toArray(),
      await db.tasks.where('project_id').anyOf(['p2', 'p1', 'none']).primaryKeys(),
      await db.tasks.where('project_id').anyOf([]).toArray(),
      await db.tasks.where('parent_id').equals('a').filter((t) => !t.deleted_at).count(),
      await db.tasks.where('parent_id').equals('a').count(),
      await db.tasks.where('project_id').equals('p2').filter((t) => !t.completed_at).primaryKeys(),
      await db.tasks.filter((t) => t.position === 2).toArray(),
      await db.tasks.where('id').equals('c').toArray(),
    ]
  },
  'orderBy, reverse, limit, first, last, sortBy': async (db) => {
    await db.tasks.bulkPut(seedTasks as never)
    return [
      await db.tasks.orderBy('position').primaryKeys(),
      await db.tasks.orderBy('position').reverse().limit(2).toArray(),
      (await db.tasks.orderBy('position').first())?.id,
      (await db.tasks.orderBy('position').last())?.id,
      await db.tasks.where('parent_id').equals('a').filter((t) => !t.deleted_at).sortBy('position'),
      await db.tasks.where('project_id').anyOf(['p1', 'p2']).reverse().sortBy('position'),
      await db.tasks.orderBy('position').filter((t) => t.id !== 'b').limit(2).primaryKeys(),
      await db.tasks.orderBy('position').limit(0).toArray(),
    ]
  },
  'above on the primary key, with a limit (the encryption walk)': async (db) => {
    await db.tasks.bulkPut(seedTasks as never)
    return [await db.tasks.where(':id').above('b').limit(2).toArray(), await db.tasks.where(':id').above('').limit(100).primaryKeys()]
  },
  'compound index between minKey and maxKey': async (db) => {
    const entries = [
      { id: '1', projectKey: 'p1', ts: 30, taskId: 't1', entityId: 't1' },
      { id: '2', projectKey: 'p1', ts: 10, taskId: 't2', entityId: 'c1' },
      { id: '3', projectKey: 'p2', ts: 20, taskId: 't1', entityId: 't1' },
      { id: '4', projectKey: 'p1', ts: 'late', taskId: null, entityId: 'x' },
      { id: '5', projectKey: 'p1', taskId: 't3', entityId: 'y' },
    ]
    await db.activity.bulkPut(entries as never)
    const range = (p: string) => db.activity.where('[projectKey+ts]').between([p, Dexie.minKey], [p, Dexie.maxKey])
    return [
      await range('p1').primaryKeys(),
      await range('p1').reverse().limit(2).toArray(),
      await range('p2').count(),
      await range('p3').toArray(),
      await db.activity.where('[projectKey+ts]').between(['p1', 10], ['p1', 30]).primaryKeys(),
      await db.activity.where('[projectKey+ts]').between(['p1', 10], ['p1', 30], false, true).primaryKeys(),
      await db.activity.where('taskId').anyOf(['t1', 't3']).primaryKeys(),
      await db.activity.where('[projectKey+ts]').equals(['p1', 30]).primaryKeys(),
    ]
  },
  'an auto-increment store: bulkAdd, orderBy, bulkDelete': async (db) => {
    const ops = [{ id: 'o1', entity: 'task' }, { id: 'o2', entity: 'task' }, { id: 'o3', entity: 'label' }]
    const last = await db.outbox.bulkAdd(ops as never)
    const first = await db.outbox.orderBy('local').limit(2).toArray()
    await db.outbox.bulkDelete(first.map((o) => o.local as number))
    const after = await db.outbox.bulkAdd([{ id: 'o4' }] as never)
    await db.outbox.clear()
    const restart = await db.outbox.bulkAdd([{ id: 'o5' }] as never)
    const put = { id: 'o6' } as Record<string, unknown>
    const key = await db.outbox.put(put as never)
    return [last, ops, first, after, restart, key, put, await db.outbox.toArray(), await db.outbox.where('id').equals('o6').count()]
  },
  'bulkAdd refuses a key that exists': async (db) => {
    await db.meta.put({ key: 'k', value: 1 })
    let failed = false
    try {
      await db.meta.bulkAdd([{ key: 'k', value: 2 }])
    } catch {
      failed = true
    }
    return [failed, await db.meta.get('k')]
  },
  'update, delete, bulkDelete, clear, each': async (db) => {
    await db.notifications.bulkPut([{ id: 'n1', createdAt: 2, readPending: true, kind: 'x' }, { id: 'n2', createdAt: 1, readPending: true }] as never)
    const updated = [await db.notifications.update('n1', { readPending: false, kind: undefined }), await db.notifications.update('zz', { readPending: false })]
    const order = await db.notifications.orderBy('createdAt').reverse().toArray()
    await db.notifications.delete('n2')
    await db.notifications.delete('zz')
    const left = await db.notifications.toArray()
    await db.meta.bulkPut([{ key: 'a', value: { nested: [1, 'two', null] } }, { key: 'b', value: 2 }, { key: 'c', value: 'three' }])
    const seen: unknown[] = []
    await db.meta.each((m) => { seen.push(m.key) })
    await db.meta.bulkDelete(['a', 'zz'])
    const meta = await db.meta.toArray()
    await db.meta.clear()
    return [updated, order, left, seen, meta, await db.meta.count()]
  },
  'transactions: nested, awaited, committed together': async (db) => {
    const tables = [db.tasks, db.outbox, db.meta]
    await db.transaction('rw', tables, async () => {
      await db.tasks.put(task('a') as never)
      const got = await db.tasks.get('a')
      await db.transaction('rw', tables, async () => {
        await db.meta.put({ key: 'inner', value: got?.title })
        await Promise.all([db.tasks.put(task('b') as never), db.outbox.bulkAdd([{ id: 'o' }] as never)])
      })
      await db.meta.put({ key: 'after', value: await db.tasks.count() })
    })
    return [await db.tasks.toArray(), await db.meta.toArray(), await db.outbox.count()]
  },
  'a transaction that throws leaves nothing behind': async (db) => {
    await db.meta.put({ key: 'kept', value: 1 })
    let error = ''
    try {
      await db.transaction('rw', db.meta, db.tasks, async () => {
        await db.meta.put({ key: 'kept', value: 2 })
        await db.tasks.put(task('gone') as never)
        throw new Error('stop')
      })
    } catch (e) {
      error = (e as Error).message
    }
    return [error, await db.meta.get('kept'), await db.tasks.count()]
  },
  'transaction(...).finally and a returned value': async (db) => {
    let done = false
    const value = await db.transaction('rw', db.meta, async () => {
      await db.meta.put({ key: 'v', value: 1 })
      return 'result'
    }).finally(() => { done = true })
    return [value, done]
  },
}

describe('the SQLite adapter behaves as Dexie', () => {
  for (const [name, run] of Object.entries(scenarios)) {
    it(name, async () => {
      const expected = await run(dexie())
      const actual = await run(sqlite())
      expect(actual).toEqual(expected)
    })
  }
})

describe('the SQLite adapter on its own', () => {
  it('makes a call from outside wait for the running transaction, as IndexedDB queues it', async () => {
    // Not on Dexie: an IndexedDB transaction commits while it awaits anything but its own requests.
    const db = sqlite()
    const order: string[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const tx = db.transaction('rw', db.meta, async () => {
      await db.meta.put({ key: 'k', value: 'inside' })
      await gate
      // Still inside after awaiting something else: the zone followed the await.
      order.push(`inside ${String((await db.meta.get('k'))?.value)}`)
      order.push('commit')
    })
    // Started while the transaction holds the store: it runs after the commit.
    const outside = db.meta.get('k').then((v) => { order.push(`read ${String(v?.value)}`) })
    await new Promise((r) => setTimeout(r, 20))
    release()
    await Promise.all([tx, outside])
    expect(order).toEqual(['inside inside', 'commit', 'read inside'])
  })

  it('refuses a value JSON cannot keep', async () => {
    const db = sqlite()
    await expect(db.meta.put({ key: 'k', value: new Map() })).rejects.toThrow('cannot be stored')
    await expect(db.meta.put({ key: 'k', value: NaN })).rejects.toThrow('not finite')
    expect(await db.meta.count()).toBe(0)
  })

  it('refuses a where() on a key path that is not indexed, as Dexie does', () => {
    const db = sqlite()
    expect(() => db.tasks.where('title')).toThrow('not indexed')
  })

  it('keeps its rows in the file across a reopen, and deletes the file', async () => {
    const sql = nodeSqlite()
    const declared = dexie()
    const first = sqliteDatabase(declared, sql)
    await first.tasks.bulkPut(seedTasks as never)
    first.close()
    const again = sqliteDatabase(declared, sql)
    expect(await again.tasks.where('project_id').equals('p1').primaryKeys()).toEqual(['a', 'b'])
    await again.delete()
    expect(await sqliteDatabase(declared, sql).tasks.count()).toBe(0)
  })

  it('brings an existing file up to a newer schema, indexing the rows it holds', async () => {
    const sql = nodeSqlite()
    const v1 = new Dexie('migrating')
    v1.version(1).stores({ items: 'id' })
    const first = sqliteDatabase(v1, sql)
    await first.table('items').bulkPut([{ id: 'a', x: 2 }, { id: 'b', x: 1 }, { id: 'c' }])
    first.close()
    const v2 = new Dexie('migrating')
    v2.version(1).stores({ items: 'id' })
    v2.version(2).stores({ items: 'id, x', more: '++n' })
    const again = sqliteDatabase(v2, sql)
    expect(await again.table('items').orderBy('x').primaryKeys()).toEqual(['b', 'a'])
    expect(await again.table('more').count()).toBe(0)
    again.close()
    // Unchanged: opened again without touching the schema.
    expect(await sqliteDatabase(v2, sql).table('items').where('x').equals(2).primaryKeys()).toEqual(['a'])
  })

  it('reports the stores each committed write changed', async () => {
    const db = sqlite()
    const seen: string[][] = []
    const off = db.onChange((s) => seen.push([...s].sort()))
    await db.meta.put({ key: 'a', value: 1 })
    await db.transaction('rw', db.tasks, db.meta, async () => {
      await db.tasks.put(task('a') as never)
      await db.meta.put({ key: 'b', value: 2 })
    })
    await db.transaction('rw', db.tasks, async () => { await db.tasks.get('a') })
    await expect(db.transaction('rw', db.tasks, async () => {
      await db.tasks.put(task('b') as never)
      throw new Error('no')
    })).rejects.toThrow('no')
    off()
    await db.meta.put({ key: 'c', value: 3 })
    expect(seen).toEqual([['meta'], ['meta', 'tasks']])
  })
})
