// The storage spike's measured session (design D4, the performance-budgets delta): the
// shared data layer (web/src/lib) on Dexie over candidate A or B, with the perfseed
// 10,000-task account. `seed` writes the account's rows; `measure` is a cold start:
// open, Today through the shared selectors, Inbox, and a 500-op pull page through the
// shared applyOps. Times in milliseconds, from performance.now().
import Dexie from 'dexie'
import { useDatabase as databaseNamed } from '@shared/db'
import { todayList, withoutArchived } from '@shared/dayLists'
import { logicalToday } from '@shared/dates'
import { inboxTasks } from '@shared/inbox'
import { applyOps } from '@shared/ops'
import type { Op, Project, Task } from '@shared/types'
import { openCandidateA, type CandidateA } from './candidateA'
import { openCandidateB } from './candidateB'
import { sql } from './sqlite'

export type Candidate = 'A' | 'B'
export type Rows = Record<string, Record<string, unknown>[]>

const DB_NAME = 'opentodo-spike'
const A_FILE = 'spike-a.sqlite'

export interface Hooks {
  /** Draws the list and resolves after the frame that shows it. */
  draw(tasks: readonly Task[]): Promise<void>
  /** Starts timing the gaps between frames; the stop function returns the longest. */
  frames(): () => number
}

const ms = (t: number) => Math.round(t * 10) / 10

function engine(candidate: Candidate): { a: CandidateA | null } {
  if (candidate === 'A') {
    const a = openCandidateA(A_FILE)
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
  if (candidate === 'A') sql().remove(A_FILE)
  const { a } = engine(candidate)
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
  const { a } = engine(candidate)
  const db = databaseNamed(DB_NAME)
  await db.open()
  const opened = performance.now()
  if (a) out.loadedRecords = await a.load(db.backendDB())
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
  await applyOps(ops, { actor: 'spike-other' })
  const p1 = performance.now()
  const longest = stop()
  const after = a?.stats()
  out.pull = { ops: ops.length, applyMs: ms(p1 - p0), longestFrameMs: ms(longest), sqliteWriteMs: after && before ? after.writeMs - before.writeMs : undefined }
  const check = await db.tasks.get(ops[0].entityId)
  out.pullApplied = !!check && String(check.title).endsWith('(edited)')
  db.close()
  return out
}
