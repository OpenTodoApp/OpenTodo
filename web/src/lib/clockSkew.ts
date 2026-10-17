// Ops refused for a fast clock (OpenSpec change sync-convergence): the server
// refuses an op stamped more than five minutes ahead of its own clock with the
// reason `clock_skew` and its time. The device corrects its clock, stamps the
// op again and queues it, so the edit is kept and uploads with the next
// exchange; the row's clock follows, so the local copy and the server agree.
import { hlcClockRefused, hlcNow } from './hlc'
import { db, tableOf } from './db'
import { ENTITIES, type Op, type Rejection } from './types'

export const CLOCK_SKEW = 'clock_skew'

/** Splits a response's refusals into clock refusals and the rest. */
export function splitClockSkew(rejected: Rejection[]): { skewed: Rejection[]; rest: Rejection[] } {
  const skewed: Rejection[] = []
  const rest: Rejection[] = []
  for (const r of rejected) (r.reason === CLOCK_SKEW ? skewed : rest).push(r)
  return { skewed, rest }
}

/**
 * Stamps the refused ops of `sent` again after correcting the clock, queues
 * them and moves the rows' clocks along. Ops that shared a timestamp (one edit)
 * share the new one, and their order is kept. Call it inside a transaction over
 * the entity tables, the outbox and meta. Returns the re-queued ops.
 */
export async function restampSkewed(sent: Op[], skewed: Rejection[], serverTime: number): Promise<Op[]> {
  if (skewed.length === 0) return []
  hlcClockRefused(skewed.find((r) => typeof r.serverTime === 'number')?.serverTime ?? serverTime)
  const ids = new Set(skewed.map((r) => r.id))
  const refused = sent.filter((o) => ids.has(o.id)).sort((a, b) => a.ts - b.ts)
  const fresh = new Map<number, number>()
  const out: Op[] = []
  for (const op of refused) {
    let ts = fresh.get(op.ts)
    if (ts === undefined) {
      ts = hlcNow()
      fresh.set(op.ts, ts)
    }
    out.push({ ...op, ts })
    if (!ENTITIES.includes(op.entity)) continue
    const table = tableOf(op.entity)
    const row = await table.get(op.entityId)
    const c = row?._clock?.[op.field]
    // Only while the row still holds this op's value: a newer local edit keeps its own clock.
    if (row && c && c.ts === op.ts && c.device === op.device) {
      await table.put({ ...row, _clock: { ...row._clock, [op.field]: { ts, device: op.device } } })
    }
  }
  if (out.length > 0) {
    await db.outbox.bulkAdd(out)
    await db.meta.put({ key: 'hlc', value: Math.max(...out.map((o) => o.ts)) })
  }
  return out
}
