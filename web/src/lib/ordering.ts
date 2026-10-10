// Position arithmetic shared by every ordered list (OpenSpec `board-view`; the base
// that `manual-ordering` builds on). Positions are plain numbers compared ascending,
// ties broken by creation time and id. Pure functions: callers read the siblings,
// pick a position and write it in one mutate() call, so a move is one op per field
// and converges by last-writer-wins like any other edit.

/** Anything with a position (tasks, sections, projects). */
export interface Positioned {
  id: string
  position: number
  created_at?: number
}

/** Stable comparison: position, then creation time, then id. */
export function byPosition(a: Positioned, b: Positioned): number {
  return a.position - b.position || (a.created_at ?? 0) - (b.created_at ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * A position after every sibling (board-view design D4: "max position + 1 at the
 * time of the move"). An empty list gets `fallback` (default: now, the same
 * convention new tasks use), so a first item never sorts before existing data.
 */
export function positionAtEnd(siblings: Iterable<Positioned>, exceptId?: string, fallback = Date.now()): number {
  let max = -Infinity
  for (const s of siblings) if (s.id !== exceptId && s.position > max) max = s.position
  return max === -Infinity ? fallback : max + 1
}

/** A position before every sibling. */
export function positionAtStart(siblings: Iterable<Positioned>, exceptId?: string, fallback = Date.now()): number {
  let min = Infinity
  for (const s of siblings) if (s.id !== exceptId && s.position < min) min = s.position
  return min === Infinity ? fallback : min - 1
}

/**
 * A position strictly between two neighbours (either may be missing: start or end
 * of the list). Midpoints keep every other item where it is, so one op moves one
 * item; `manual-ordering` adds rebalancing when gaps run out of precision.
 */
export function positionBetween(before: number | null, after: number | null, fallback = Date.now()): number {
  if (before === null && after === null) return fallback
  if (before === null) return (after as number) - 1
  if (after === null) return before + 1
  if (after <= before) return before + 1 // neighbours out of order (concurrent moves): just go after `before`
  return before + (after - before) / 2
}

/**
 * The position that moves `id` one place up (delta -1) or down (+1) among
 * `siblings`, or null when it is already first or last. Returns a midpoint between
 * the new neighbours, so only the moved item is written.
 */
export function positionForStep<T extends Positioned>(siblings: T[], id: string, delta: -1 | 1): number | null {
  const sorted = [...siblings].sort(byPosition)
  const i = sorted.findIndex((s) => s.id === id)
  if (i < 0) return null
  const j = i + delta
  if (j < 0 || j >= sorted.length) return null
  // Moving up lands between sorted[j-1] and sorted[j]; moving down between sorted[j] and sorted[j+1].
  const before = delta < 0 ? sorted[j - 1] ?? null : sorted[j]
  const after = delta < 0 ? sorted[j] : sorted[j + 1] ?? null
  return positionBetween(before ? before.position : null, after ? after.position : null)
}
