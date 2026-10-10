// Per-device history of filter queries, kept in the local `meta` table and never
// synced: each device remembers only what was typed on it.
import { getMeta, setMeta } from '../db'

export const FILTER_HISTORY_KEY = 'filterHistory'
export const FILTER_HISTORY_LIMIT = 20

/** Most recent first, at most FILTER_HISTORY_LIMIT distinct entries. */
export function pushHistory(list: readonly string[], query: string): string[] {
  const q = query.trim()
  if (!q) return [...list]
  return [q, ...list.filter((x) => x !== q)].slice(0, FILTER_HISTORY_LIMIT)
}

export function getFilterHistory(): Promise<string[]> {
  return getMeta<string[]>(FILTER_HISTORY_KEY, [])
}

/** Record a query; returns the new list. */
export async function addFilterHistory(query: string): Promise<string[]> {
  const next = pushHistory(await getFilterHistory(), query)
  await setMeta(FILTER_HISTORY_KEY, next)
  return next
}
