// Most-probable ordering for pickers (OpenSpec change ui-primitives, design D7):
// per-device recency and frequency, never synced, exported or sent anywhere.
import { db } from './db'

/** Half-life of a pick's weight. */
const HALF_LIFE_DAYS = 14
const MAX_PER_CONTEXT = 200
const DAY = 86_400_000

/** Score of a pick: count, halved every 14 days since it was last made. */
export function pickScore(count: number, lastAt: number, now = Date.now()): number {
  return count * 0.5 ** (Math.max(0, now - lastAt) / DAY / HALF_LIFE_DAYS)
}

/** Records a pick; fire-and-forget after the pick itself succeeded. */
export async function recordPick(context: string, key: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.pickHistory, async () => {
    const row = await db.pickHistory.get([context, key])
    await db.pickHistory.put({ context, key, count: (row?.count ?? 0) + 1, lastAt: now })
    const rows = await db.pickHistory.where('context').equals(context).toArray()
    if (rows.length > MAX_PER_CONTEXT) {
      const drop = rows.sort((a, b) => pickScore(a.count, a.lastAt, now) - pickScore(b.count, b.lastAt, now)).slice(0, rows.length - MAX_PER_CONTEXT)
      await db.pickHistory.bulkDelete(drop.map((r) => [r.context, r.key] as [string, string]))
    }
  })
}

/** Scores of the keys picked in a context, highest first. */
export async function pickScores(context: string, now = Date.now()): Promise<Map<string, number>> {
  const rows = await db.pickHistory.where('context').equals(context).toArray()
  return new Map(rows.map((r) => [r.key, pickScore(r.count, r.lastAt, now)] as const).sort((a, b) => b[1] - a[1]))
}

/** Orders items: picked ones by score, then the rest in their natural order. */
export function rankBy<T>(items: readonly T[], key: (t: T) => string, scores: Map<string, number>): T[] {
  return items
    .map((item, i) => ({ item, i, s: scores.get(key(item)) ?? 0 }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item)
}
