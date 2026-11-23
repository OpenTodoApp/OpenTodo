// A reusable list's ticked items for quick add's suggestions (OpenSpec change
// reusable-suggest, #1839): its ticked top-level items, the most recently ticked first,
// and the ones whose name contains what is typed. Read from the device's own rows, so it
// works offline and on decrypted titles.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { normalizeTitle, reopenableItems } from './reusable'

export interface TickedItem { id: string; title: string }

/** At most this many suggestions. */
export const TICKED_LIMIT = 8

const NONE: readonly TickedItem[] = []

/** The ticked items whose name contains `query` (two characters or more), in the given order. */
export function tickedMatches(items: readonly TickedItem[], query: string): TickedItem[] {
  const q = normalizeTitle(query)
  if (q.length < 2) return []
  return items.filter((i) => normalizeTitle(i.title).includes(q)).slice(0, TICKED_LIMIT)
}

/**
 * The items an add to a reusable list would reopen (`reopenableItems`: one per name,
 * none whose name is open), the most recently ticked first; none for null. The screen
 * passes null until something is typed, so an idle quick add runs no query.
 */
export function useTickedItems(projectId: string | null | undefined): readonly TickedItem[] {
  return useLiveQuery(async () => {
    if (!projectId) return NONE
    const rows = await db.tasks.where('project_id').equals(projectId).toArray()
    return reopenableItems(projectId, rows).map((r) => ({ id: r.id, title: r.title }))
  }, [projectId], NONE) ?? NONE
}
