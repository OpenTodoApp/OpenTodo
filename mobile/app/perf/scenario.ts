// The measured session of the app's performance run (design D4, the performance-budgets
// delta), on the app's own database: the shared data layer over the SQLite adapter, with
// the perfseed 10,000-task account. `seed` writes the account's rows; `measure` is a cold
// start: open, Today and Inbox from the phone's indexes (src/storage/lists.ts), and a
// 500-op pull page through the shared applyOps; `write` and `verify` are the two halves
// of the kill-after-write check. Times in milliseconds, from performance.now().
import { withDeferredActivity } from '@shared/activity'
import { logicalToday } from '@shared/dates'
import { db, useDatabase as openDatabaseNamed } from '@shared/db'
import { applyOps, createTask, getDeviceId } from '@shared/ops'
import type { Op, Task } from '@shared/types'
import type { SqliteDatabase } from '../src/storage/adapter'
import { inboxList, todayTasks } from '../src/storage/lists'

export type Rows = Record<string, Record<string, unknown>[]>

const DB_NAME = 'opentodo-perf'

export interface Hooks {
  /** Draws the list and resolves after the frame that shows it. */
  draw(tasks: readonly Task[]): Promise<void>
  /** Starts timing the gaps between frames; the stop function returns the longest. */
  frames(): () => number
}

const ms = (t: number) => Math.round(t * 10) / 10
const adapter = () => db as unknown as SqliteDatabase

/** Empties the database and writes the account's rows, a thousand at a time. */
export async function seed(rows: Rows): Promise<Record<string, unknown>> {
  openDatabaseNamed(DB_NAME)
  await adapter().delete()
  openDatabaseNamed(DB_NAME)
  const t0 = performance.now()
  let count = 0
  for (const [name, list] of Object.entries(rows)) {
    if (!db.tables.some((t) => t.name === name) || list.length === 0) continue
    for (let i = 0; i < list.length; i += 1000) await db.table(name).bulkPut(list.slice(i, i + 1000))
    count += list.length
  }
  return { phase: 'seed', rows: count, tasks: await db.tasks.count(), seedMs: ms(performance.now() - t0) }
}

/** The pull page: 500 remote ops on 100 open tasks, five fields each. */
export function pullPage(tasks: readonly Task[], now: number): Op[] {
  const open = tasks.filter((t) => !t.completed_at && !t.deleted_at).slice(0, 100)
  const ops: Op[] = []
  open.forEach((t, i) => {
    const fields: [string, unknown][] = [
      ['title', `${t.title} (edited)`],
      ['priority', ((t.priority ?? 4) % 4) + 1],
      ['position', (t.position ?? 0) + 0.5],
      ['description', `Changed on another device, ${i}`],
      ['due', { date: logicalToday() }],
    ]
    fields.forEach(([field, value], j) => ops.push({ id: `perf-${now}-${i}-${j}`, entity: 'task', entityId: t.id, field, value, ts: now + i * 5 + j, device: 'perf-other' }))
  })
  return ops
}

export async function measure(hooks: Hooks, startedAt: number): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { phase: 'measure' }
  const t0 = performance.now()
  openDatabaseNamed(DB_NAME)
  await adapter().open()
  const opened = performance.now()
  const today = await todayTasks(logicalToday())
  const queried = performance.now()
  await hooks.draw(today)
  const drawn = performance.now()
  out.todayDrawnAt = Date.now()
  out.jsStartToTodayMs = ms(drawn - startedAt)
  out.open = { openMs: ms(opened - t0), todayQueryMs: ms(queried - opened), drawMs: ms(drawn - queried), totalMs: ms(drawn - t0) }
  out.todayCount = today.length

  // Inbox: asked for afresh, drawn.
  const i0 = performance.now()
  const inbox = await inboxList()
  const i1 = performance.now()
  await hooks.draw(inbox)
  out.inbox = { queryMs: ms(i1 - i0), totalMs: ms(performance.now() - i0), count: inbox.length }
  await hooks.draw(today)

  // A pulled page of 500 ops through the shared applyOps, as the sync exchange applies it.
  const sample = await db.tasks.where(':id').above('').limit(400).toArray()
  const ops = pullPage(sample, Date.now())
  const stop = hooks.frames()
  const p0 = performance.now()
  await withDeferredActivity(() => applyOps(ops, { actor: 'perf-other' }))
  const p1 = performance.now()
  const longest = stop()
  out.pull = { ops: ops.length, applyMs: ms(p1 - p0), longestFrameMs: ms(longest) }
  const check = await db.tasks.get(ops[0].entityId)
  out.pullApplied = !!check && String(check.title).endsWith('(edited)')
  out.ok = out.pullApplied
  return out
}

/** Writes a task through the shared ops and answers once the transaction committed. */
export async function write(): Promise<Record<string, unknown>> {
  openDatabaseNamed(DB_NAME)
  await getDeviceId()
  const id = await createTask({ title: `Written before the kill ${Date.now()}` })
  return { phase: 'write', id }
}

/** After the kill: the task and its ops are there. */
export async function verify(id: string): Promise<Record<string, unknown>> {
  openDatabaseNamed(DB_NAME)
  const task = await db.tasks.get(id)
  const queued = await db.outbox.filter((o) => o.entityId === id).count()
  return { phase: 'verify', id, found: !!task, queuedOps: queued, ok: !!task && queued > 0 }
}
