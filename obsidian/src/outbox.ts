// The per-device outbox (obsidian-plugin D9): ready ops (already sealed for an
// encrypted account) are queued before the note changes, so a send works with no
// connection, and pushed with the push-only exchange when the server answers.
// Ops are idempotent by id, so a push repeated after an interruption is harmless.
import { hlcClockRefused, hlcNow, hlcObserveServerTime, hlcSeed } from '../../web/src/lib/hlc'
import { ApiError, NetworkError, type Client, type Rejection } from './api'
import type { Op } from './ops'
import { K, type DeviceStorage } from './storage'

export interface Entry {
  /** The entry's own id. */
  id: string
  /** The task this entry creates or changes. */
  taskId: string
  title: string
  /** The note the line came from. */
  note: string
  /** The project the task goes to, for a refusal's notice. */
  project: string | null
  ops: Op[]
}

export interface Refused {
  entry: Entry
  reason: string
  message?: string
}

export type PushResult =
  | { kind: 'idle' }
  | { kind: 'pushed'; sent: Entry[]; refused: Refused[] }
  | { kind: 'offline' }
  | { kind: 'unauthorized'; code: string }
  | { kind: 'failed'; message: string }

/** Ops per exchange, the server's batch size. */
const BATCH = 500

export class Outbox {
  private pushing: Promise<PushResult> | null = null
  private again: Promise<PushResult> | null = null
  /** Entries of the batch on its way: the server may already hold them. */
  private inFlight = new Set<string>()

  constructor(private store: DeviceStorage) {
    // A reload never reuses a timestamp this device stamped.
    hlcSeed(store.get<number>(K.clock) ?? 0)
  }

  entries(): Entry[] {
    return this.store.get<Entry[]>(K.outbox) ?? []
  }

  /** How many tasks are waiting (entries that create a task count once). */
  get waiting(): number {
    return new Set(this.entries().map((e) => e.taskId)).size
  }

  add(entries: Entry[]): void {
    this.store.set(K.outbox, [...this.entries(), ...entries])
    this.store.set(K.clock, hlcNow())
  }

  /**
   * Removes the entries of a task that never left the device (Undo before a
   * push); true when there were any. An entry of the batch on its way is kept:
   * the server may have it already, so the caller trashes the task instead.
   */
  drop(taskId: string): boolean {
    const all = this.entries()
    if (all.some((e) => e.taskId === taskId && this.inFlight.has(e.id))) return false
    const kept = all.filter((e) => e.taskId !== taskId)
    this.store.set(K.outbox, kept)
    return kept.length !== all.length
  }

  /** Pushes everything queued. A call during a push runs once more after it, for what was queued meanwhile. */
  push(client: Client, device: string): Promise<PushResult> {
    if (this.pushing) {
      this.again ??= this.pushing.then(() => {
        this.again = null
        return this.push(client, device)
      })
      return this.again
    }
    this.pushing = this.run(client, device).finally(() => {
      this.pushing = null
      this.inFlight.clear()
    })
    return this.pushing
  }

  private async run(client: Client, device: string): Promise<PushResult> {
    const sent: Entry[] = []
    const refused: Refused[] = []
    for (let round = 0; round < 100; round++) {
      const queue = this.entries()
      if (queue.length === 0) break
      // Whole entries per batch, so a task never leaves without its labels.
      const batch: Entry[] = []
      let n = 0
      for (const e of queue) {
        if (batch.length > 0 && n + e.ops.length > BATCH) break
        batch.push(e)
        n += e.ops.length
      }
      for (const e of batch) this.inFlight.add(e.id)
      let answer
      try {
        answer = await client.sync(device, batch.flatMap((e) => e.ops))
      } catch (err) {
        if (err instanceof NetworkError) return sent.length ? { kind: 'pushed', sent, refused } : { kind: 'offline' }
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return { kind: 'unauthorized', code: err.code }
        return { kind: 'failed', message: err instanceof Error ? err.message : String(err) }
      }
      hlcObserveServerTime(answer.serverTime)
      const byOp = new Map<string, Rejection>()
      for (const r of answer.rejected ?? []) byOp.set(r.id, r)
      // Ops refused as stamped too far ahead (clock_skew) go again, stamped anew.
      const skewed = [...byOp.values()].some((r) => r.reason === 'clock_skew')
      if (skewed && typeof answer.serverTime === 'number') hlcClockRefused(answer.serverTime)
      const restamped = new Map<Entry, Op[]>()
      for (const e of batch) {
        const reasons = e.ops.map((o) => byOp.get(o.id)).filter((r): r is Rejection => r !== undefined)
        const hard = reasons.find((r) => r.reason !== 'clock_skew')
        if (hard) refused.push({ entry: e, reason: hard.reason, message: hard.message })
        else if (reasons.length) {
          const ts = hlcNow()
          restamped.set(e, e.ops.filter((o) => byOp.has(o.id)).map((o) => ({ ...o, ts })))
        } else sent.push(e)
      }
      // The answer is in: drop the batch, keep what goes again (first) and what
      // was queued meanwhile.
      const inBatch = new Set(batch.map((e) => e.id))
      const again = [...restamped.entries()].map(([e, ops]) => ({ ...e, ops }))
      this.store.set(K.outbox, [...again, ...this.entries().filter((e) => !inBatch.has(e.id))])
      this.store.set(K.clock, hlcNow())
      this.inFlight.clear()
      if (again.length && round > 3) break
    }
    return { kind: 'pushed', sent, refused }
  }
}
