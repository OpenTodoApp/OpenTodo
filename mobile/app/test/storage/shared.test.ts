/**
 * @jest-environment node
 */
// The shared data layer on the adapter (design D4): the same work through the shared
// modules, on Dexie over fake-indexeddb and on the adapter over node:sqlite, must leave
// every table the same. Remote pages go through applyOps under the sync exchange's
// activity rule (withDeferredActivity), as sync.ts applies them; local edits go through
// mutateMany's callers (create, update, complete, delete, comment, undo of a batch),
// with the ids and the clock pinned so both runs make the same ops.
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { markLongPull, withDeferredActivity } from '@shared/activity'
import { createComment } from '@shared/comments'
import { clearLocalData, db, useDatabase as openDatabaseNamed } from '@shared/db'
import { resetModuleState } from '@shared/moduleState'
import { applyOps, createProject, createTask, deleteTask, resetDeviceId, setTaskCompleted, updateTask } from '@shared/ops'
import { installPlatform, platform } from '@shared/platform'
import { setCurrentUserId } from '@shared/sharing'
import type { Op } from '@shared/types'
import { sqliteDatabase } from '../../src/storage/adapter'
import { nodeSqlite } from './nodeSqlite'

type Kind = 'dexie' | 'sqlite'
let n = 0

function open(kind: Kind) {
  resetModuleState()
  resetDeviceId()
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  const web = platform
  if (kind === 'sqlite') installPlatform({ ...web, database: (declared) => sqliteDatabase(declared, nodeSqlite()) })
  openDatabaseNamed(`shared-${kind}-${++n}`)
}

async function tables(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {}
  for (const t of db.tables) out[t.name] = await t.toArray()
  return out
}

function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Pages of remote ops over projects, tasks, labels, comments and reminders, some delivered twice. */
function pages(seed: number): Op[][] {
  const r = prng(seed)
  const pick = <T,>(l: readonly T[]) => l[Math.floor(r() * l.length)]
  const devices = ['dev-a', 'dev-b', 'dev-c']
  const ops: Op[] = []
  let ts = 1_800_000_000_000
  const id = (p: string, k: number) => `${p}${Math.floor(r() * k)}`
  for (let i = 0; i < 2400; i++) {
    ts += Math.floor(r() * 3)
    const device = pick(devices)
    const base = { id: `op-${seed}-${i}`, ts, device }
    const k = r()
    if (k < 0.1) ops.push({ ...base, entity: 'project', entityId: id('p', 8), field: pick(['name', 'position', 'archived', 'color']), value: pick(['Home', 'Work', 3, true, false, 'blue']) })
    else if (k < 0.75) {
      const field = pick(['title', 'priority', 'position', 'due', 'project_id', 'parent_id', 'completed_at', 'deleted_at', 'labels', 'description', 'start', 'deadline'])
      const values: Record<string, unknown[]> = {
        title: ['Buy milk', 'Call Ana', 'Ship it'], priority: [1, 2, 3, 4], position: [1, 2.5, 10], due: [null, { date: '2026-11-10' }, { date: '2026-11-12', time: '09:00' }],
        project_id: [null, 'p1', 'p2'], parent_id: [null, 't1', 't2'], completed_at: [null, ts], deleted_at: [null, ts], labels: [[], ['l1'], ['l1', 'l2']],
        description: ['', 'Notes', 'More notes'], start: [null, 'someday', '2026-11-11'], deadline: [null, '2026-11-15'],
      }
      ops.push({ ...base, entity: 'task', entityId: id('t', 120), field, value: pick(values[field]) })
    } else if (k < 0.85) ops.push({ ...base, entity: 'label', entityId: id('l', 5), field: pick(['name', 'color', 'position']), value: pick(['urgent', 'red', 2]) })
    else if (k < 0.95) ops.push({ ...base, entity: 'comment', entityId: id('c', 30), field: pick(['task_id', 'body', 'author_id']), value: pick(['t1', 't3', 'Looks good', 'u1']) })
    else ops.push({ ...base, entity: 'reminder', entityId: id('r', 20), field: pick(['task_id', 'fire_at', 'deleted_at']), value: pick(['t1', 't4', ts + 1000, null]) })
  }
  // Pages of 500, the server's size, and the last 300 ops once more (a retried page).
  const out: Op[][] = []
  for (let i = 0; i < ops.length; i += 500) out.push(ops.slice(i, i + 500))
  out.push(ops.slice(-300))
  return out
}

async function pull(seed: number) {
  const list = pages(seed)
  await withDeferredActivity(async () => {
    for (const [i, page] of list.entries()) {
      if (i < list.length - 1) markLongPull()
      await applyOps(page, { actor: 'u2' })
    }
  })
}

async function edits() {
  await setCurrentUserId('me')
  const p = await createProject({ name: 'Errands' })
  const a = await createTask({ title: 'Buy milk', project_id: p, due: { date: '2026-11-10' } })
  const b = await createTask({ title: 'Call Ana' })
  await updateTask(a, { title: 'Buy oat milk', priority: 1, labels: ['l1'] })
  await setTaskCompleted(b, true)
  await createComment({ taskId: a, body: 'Two litres' })
  await deleteTask(a)
}

/** The same ids and clock in both runs: counters in place of randomUUID, a seeded Math.random, a stopped Date (the hybrid clock counts on). */
function pinned<T>(fn: () => Promise<T>): Promise<T> {
  let id = 0
  const uuid = jest.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`)
  const random = jest.spyOn(Math, 'random').mockImplementation(prng(7))
  jest.useFakeTimers({
    now: 1_800_000_000_000,
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'hrtime', 'performance'],
  })
  return fn().finally(() => { uuid.mockRestore(); random.mockRestore(); jest.useRealTimers() })
}

async function both(work: () => Promise<void>) {
  const result: Record<Kind, Record<string, unknown[]>> = { dexie: {}, sqlite: {} }
  const web = platform
  for (const kind of ['dexie', 'sqlite'] as const) {
    open(kind)
    try {
      await pinned(work)
      result[kind] = await tables()
    } finally {
      installPlatform(web)
    }
  }
  return result
}

describe('the shared data layer on the adapter', () => {
  it.each([1, 2])('applies pulled pages as Dexie does (seed %i)', async (seed) => {
    const { dexie, sqlite } = await both(() => pull(seed))
    expect((dexie.tasks ?? []).length).toBeGreaterThan(100)
    expect((dexie.activity ?? []).length).toBeGreaterThan(100)
    expect(sqlite).toEqual(dexie)
  })

  it('records local edits as Dexie does', async () => {
    const { dexie, sqlite } = await both(edits)
    expect((dexie.outbox ?? []).length).toBeGreaterThan(10)
    expect(sqlite).toEqual(dexie)
  })

  it('clears every table at sign-out', async () => {
    const web = platform
    open('sqlite')
    try {
      await pinned(async () => { await edits(); await pull(3) })
      await clearLocalData()
      const left = Object.entries(await tables()).filter(([, rows]) => rows.length)
      expect(left).toEqual([])
    } finally {
      installPlatform(web)
    }
  })
})
