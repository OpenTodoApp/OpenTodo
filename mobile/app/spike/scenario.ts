// The storage spike's measured session (design D4, the performance-budgets delta): the
// shared data layer (web/src/lib) on Dexie over candidate A or B, with the perfseed
// 10,000-task account. `seed` writes the account's rows; `measure` is a cold start:
// open, Today through the shared selectors, Inbox, and a 500-op pull page through the
// shared applyOps. Times in milliseconds, from performance.now().
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange as FakeKeyRange } from 'fake-indexeddb'
import { useDatabase as databaseNamed } from '@shared/db'
import { todayList, withoutArchived } from '@shared/dayLists'
import { logicalToday } from '@shared/dates'
import { inboxTasks } from '@shared/inbox'
import { withDeferredActivity } from '@shared/activity'
import { applyOps } from '@shared/ops'
import type { Op, Project, Task } from '@shared/types'
import { openCandidateA, type CandidateA } from './candidateA'
import { openCandidateB } from './candidateB'
import { installFastIndexes, setFastIndexes } from './fastIndexes'
import { sql } from './sqlite'

/** A: fake-indexeddb with the index fix and the bulk start-up (fastIndexes.ts); A0: as published; B: indexeddbshim. */
export type Candidate = 'A0' | 'A' | 'B'
export type Rows = Record<string, Record<string, unknown>[]>

const DB_NAME = 'opentodo-spike'
const fileOf = (c: Candidate) => `spike-${c.toLowerCase()}.sqlite`

export interface Hooks {
  /** Draws the list and resolves after the frame that shows it. */
  draw(tasks: readonly Task[]): Promise<void>
  /** Starts timing the gaps between frames; the stop function returns the longest. */
  frames(): () => number
}

const ms = (t: number) => Math.round(t * 10) / 10

async function engine(candidate: Candidate): Promise<{ a: CandidateA | null }> {
  if (candidate !== 'B') {
    await installFastIndexes()
    setFastIndexes(candidate === 'A')
    const a = await openCandidateA(fileOf(candidate), { bulk: candidate === 'A' })
    Dexie.dependencies.indexedDB = a.indexedDB as unknown as IDBFactory
    Dexie.dependencies.IDBKeyRange = a.IDBKeyRange as unknown as typeof IDBKeyRange
    return { a }
  }
  const b = openCandidateB()
  Dexie.dependencies.indexedDB = b.indexedDB
  Dexie.dependencies.IDBKeyRange = b.IDBKeyRange
  return { a: null }
}

/** Empties the candidate's storage and writes the account's rows, one transaction per table. */
export async function seed(candidate: Candidate, rows: Rows): Promise<Record<string, unknown>> {
  if (candidate !== 'B') sql().remove(fileOf(candidate))
  const { a } = await engine(candidate)
  const db = databaseNamed(DB_NAME)
  const t0 = performance.now()
  await db.delete()
  await db.open()
  let count = 0
  for (const [table, list] of Object.entries(rows)) {
    if (!db.tables.some((t) => t.name === table) || list.length === 0) continue
    await db.table(table).bulkPut(list)
    count += list.length
  }
  const tasks = await db.tasks.count()
  db.close()
  return { candidate, phase: 'seed', rows: count, tasks, seedMs: ms(performance.now() - t0), sqlite: a?.stats() }
}

/** The pull page: 500 remote ops on 100 open tasks, five fields each. */
export function pullPage(tasks: readonly Task[], now: number): Op[] {
  const open = tasks.filter((t) => !t.completed_at && !t.deleted_at).sort((x, y) => (x.id < y.id ? -1 : 1)).slice(0, 100)
  const ops: Op[] = []
  open.forEach((t, i) => {
    const fields: [string, unknown][] = [
      ['title', `${t.title} (edited)`],
      ['priority', ((t.priority ?? 4) % 4) + 1],
      ['position', (t.position ?? 0) + 0.5],
      ['description', `Changed on another device, ${i}`],
      ['due', { date: logicalToday() }],
    ]
    fields.forEach(([field, value], j) => ops.push({ id: `spike-${i}-${j}`, entity: 'task', entityId: t.id, field, value, ts: now + i * 5 + j, device: 'spike-other' }))
  })
  return ops
}

export async function measure(candidate: Candidate, hooks: Hooks, startedAt: number): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { candidate, phase: 'measure' }
  const t0 = performance.now()
  const { a } = await engine(candidate)
  const db = databaseNamed(DB_NAME)
  await db.open()
  const opened = performance.now()
  if (a) { out.loadedRecords = await a.load(db.backendDB()); out.loadSteps = a.stats().load }
  const loaded = performance.now()
  const [tasks, projects] = await Promise.all([db.tasks.toArray(), db.projects.toArray()]) as [Task[], Project[]]
  const queried = performance.now()
  const today = todayList(withoutArchived(tasks, projects), logicalToday())
  const selected = performance.now()
  await hooks.draw(today)
  const drawn = performance.now()
  out.todayDrawnAt = Date.now()
  out.jsStartToTodayMs = ms(drawn - startedAt)
  out.open = { dexieOpenMs: ms(opened - t0), loadMs: ms(loaded - opened), queryMs: ms(queried - loaded), selectMs: ms(selected - queried), drawMs: ms(drawn - selected), totalMs: ms(drawn - t0) }
  out.tasks = tasks.length
  out.todayCount = today.length

  // The activity log, read only by the activity views, after the first screen (A only).
  if (a) {
    const d0 = performance.now()
    const n = await a.load(db.backendDB(), 'deferred')
    out.deferredLoad = { records: n, ms: ms(performance.now() - d0), steps: a.stats().load }
  }

  // Inbox: read again, select through the shared rule, draw.
  const i0 = performance.now()
  const [itasks, iprojects] = await Promise.all([db.tasks.toArray(), db.projects.toArray()]) as [Task[], Project[]]
  const all = withoutArchived(itasks, iprojects)
  const inbox = inboxTasks(all, itasks)
  const i1 = performance.now()
  await hooks.draw(inbox)
  out.inbox = { queryAndSelectMs: ms(i1 - i0), totalMs: ms(performance.now() - i0), count: inbox.length }
  await hooks.draw(today)

  // A pulled page of 500 ops through the shared applyOps.
  const ops = pullPage(itasks, Date.now())
  const before = a?.stats()
  const stop = hooks.frames()
  const p0 = performance.now()
  // As the sync exchange applies it: activity entries are written once, at its end.
  await withDeferredActivity(() => applyOps(ops, { actor: 'spike-other' }))
  const p1 = performance.now()
  const longest = stop()
  const after = a?.stats()
  out.pull = { ops: ops.length, applyMs: ms(p1 - p0), longestFrameMs: ms(longest), sqliteWriteMs: after && before ? after.writeMs - before.writeMs : undefined }
  const check = await db.tasks.get(ops[0].entityId)
  out.pullApplied = !!check && String(check.title).endsWith('(edited)')
  db.close()
  return out
}

/** The runtime: whether a Dexie transaction keeps its zone across awaits here. */
export async function diagnose(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {
    scheduler: (globalThis as { __spikeScheduler?: string }).__spikeScheduler,
    asyncIsGlobalPromise: Object.getPrototypeOf((async () => undefined)()) === Promise.prototype,
    digestIsGlobalPromise: Object.getPrototypeOf(globalThis.crypto.subtle.digest('SHA-256', new Uint8Array([0]))) === Promise.prototype,
  }
  const probe = new Dexie('zone-probe', { indexedDB: new IDBFactory() as unknown as IDBFactory, IDBKeyRange: FakeKeyRange as unknown as typeof IDBKeyRange })
  probe.version(1).stores({ s: 'id' })
  const t0 = performance.now()
  try {
    await probe.transaction('rw', probe.table('s'), async () => {
      await probe.table('s').put({ id: 1 })
      await probe.table('s').get(1)
      await probe.table('s').put({ id: 2 })
    })
    out.transactionWithAwaits = 'ok'
  } catch (e) {
    out.transactionWithAwaits = e instanceof Error ? e.name : String(e)
  }
  out.transactionMs = ms(performance.now() - t0)
  // The same scope as a promise chain, no await: tells the zone from the scheduling.
  try {
    const t = probe.table('s')
    await probe.transaction('rw', t, () => t.put({ id: 3 }).then(() => t.get(3)).then(() => t.put({ id: 4 })))
    out.transactionWithThen = 'ok'
  } catch (e) {
    out.transactionWithThen = e instanceof Error ? e.name : String(e)
  }
  probe.close()
  return out
}
