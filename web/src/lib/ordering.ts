// Position arithmetic shared by every ordered list (OpenSpec `board-view`, extended
// by `manual-ordering`). Pure functions: callers read the siblings, plan the
// position changes here and write them in one mutateMany() call, so an ordinary move
// is one op and every move converges by last-writer-wins like any other edit.
//
// The order rule (manual-ordering design D1): `position` ascending, ties broken by
// id. It is total and identical on every device, also when two items end up with
// the same position after concurrent inserts into the same gap.
import { compareDue } from './dates'
import type { Due } from './types'

/** Anything with a position (tasks, sections, projects). */
export interface Positioned {
  id: string
  position: number
}

/** Spacing for an item placed before the first or after the last one, and for renumbering. */
export const GAP = 1000

/** The order rule: position ascending, then id. */
export function compareByPosition(a: Positioned, b: Positioned): number {
  return a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** Alias kept for board-view call sites. */
export const byPosition = compareByPosition

/**
 * Date-sorted views (Today, Upcoming, Assigned, filters): due date and time, then
 * priority, then the manual order as the tie-breaker (manual-ordering, "Position as
 * tie-breaker").
 */
export function compareDueThenPriority(a: Positioned & { due: Due | null; priority: number }, b: Positioned & { due: Due | null; priority: number }): number {
  return compareDue(a.due, b.due) || a.priority - b.priority || compareByPosition(a, b)
}

/**
 * A position after every sibling. An empty list gets `fallback` (default: now, the
 * same convention new tasks use), so a first item never sorts before existing data.
 */
export function positionAtEnd(siblings: Iterable<Positioned>, exceptId?: string, fallback = Date.now()): number {
  let max = -Infinity
  for (const s of siblings) if (s.id !== exceptId && s.position > max) max = s.position
  return max === -Infinity ? fallback : max + GAP
}

/** A position before every sibling. */
export function positionAtStart(siblings: Iterable<Positioned>, exceptId?: string, fallback = Date.now()): number {
  let min = Infinity
  for (const s of siblings) if (s.id !== exceptId && s.position < min) min = s.position
  return min === Infinity ? fallback : min - GAP
}

/**
 * A position between two neighbours (either may be missing: start or end of the
 * list): the midpoint, or `GAP` beyond the only neighbour. Check `needsRenumber`
 * first; when it is true the midpoint is not strictly between them and the caller
 * must renumber (planMove does both).
 */
export function positionBetween(before: number | null, after: number | null, fallback = Date.now()): number {
  if (before === null && after === null) return fallback
  if (before === null) return (after as number) - GAP
  if (after === null) return before + GAP
  if (after <= before) return before + GAP // neighbours out of order; planMove renumbers instead
  return before + (after - before) / 2
}

/**
 * True when no distinct number fits between the two neighbours: they are equal, out
 * of order, or so close that their midpoint rounds onto one of them (design D2).
 */
export function needsRenumber(before: number | null, after: number | null): boolean {
  if (before === null || after === null) return false
  if (!(after > before)) return true
  const mid = before + (after - before) / 2
  return !(mid > before && mid < after)
}

/** One planned position write. */
export interface PositionChange {
  id: string
  position: number
}

/**
 * Even positions for a whole list, `GAP` apart, starting at its smallest position
 * (design D2), in the list's current order. Returns only the items whose position
 * changes.
 */
export function renumber<T extends Positioned>(list: T[], start?: number): PositionChange[] {
  const sorted = [...list].sort(compareByPosition)
  if (sorted.length === 0) return []
  const base = start ?? sorted[0].position
  const out: PositionChange[] = []
  sorted.forEach((s, i) => {
    const p = base + i * GAP
    if (p !== s.position) out.push({ id: s.id, position: p })
  })
  return out
}

/** Where a moved item goes in its (new) list. Indexes count the list without the item. */
export type Placement = number | 'top' | 'bottom' | { before: string } | { after: string }

/**
 * `n` increasing positions strictly inside (lower, upper); a missing bound is open
 * and the values are `GAP` apart from the other bound. Null when they do not fit
 * as distinct numbers with room left for later bisections.
 */
function spread(lower: number | null, upper: number | null, n: number, anchor: number): number[] | null {
  if (lower === null && upper === null) return Array.from({ length: n }, (_, i) => anchor + i * GAP)
  if (lower === null) return Array.from({ length: n }, (_, i) => (upper as number) - (n - i) * GAP)
  if (upper === null) return Array.from({ length: n }, (_, i) => lower + (i + 1) * GAP)
  if (!(upper > lower)) return null
  const step = (upper - lower) / (n + 1)
  // One item only needs a distinct midpoint (one op per move). A renumbered window
  // must leave room for about ten more bisections, or it would be exhausted again.
  if (n > 1 && step < Math.max(Math.abs(lower), Math.abs(upper), 1) * 2 ** -42) return null
  const out: number[] = []
  let prev = lower
  for (let i = 1; i <= n; i++) {
    const p = lower + step * i
    if (!(p > prev && p < upper)) return null
    out.push(p)
    prev = p
  }
  return out
}

/**
 * Plan the position writes that put `movedId` at `at` in `siblings` (its target
 * list; it may or may not already be in it). The common case is one change: the
 * midpoint between the new neighbours. When that gap cannot be bisected (identical
 * or exhausted positions), the smallest window of neighbours around the gap is
 * renumbered evenly together with the moved item, growing outwards until the values
 * fit; at worst that is the whole list (design D2). Items for which `writable`
 * returns false (a shared project the user may not edit) are never rewritten; they
 * bound the window instead. Returns [] when the item is already there and null
 * when it cannot be placed.
 */
export function planMove<T extends Positioned>(
  siblings: T[], movedId: string, at: Placement, opts: { writable?: (item: T) => boolean; fallback?: number } = {},
): PositionChange[] | null {
  const sorted = [...siblings].sort(compareByPosition)
  const from = sorted.findIndex((s) => s.id === movedId)
  const list = from >= 0 ? sorted.filter((s) => s.id !== movedId) : sorted
  let k: number
  if (typeof at === 'number') k = at
  else if (at === 'top') k = 0
  else if (at === 'bottom') k = list.length
  else if ('before' in at) k = list.findIndex((s) => s.id === at.before)
  else {
    const i = list.findIndex((s) => s.id === at.after)
    k = i < 0 ? -1 : i + 1
  }
  if (k < 0) return null
  k = Math.max(0, Math.min(list.length, k))
  if (from >= 0 && from === k) return []
  if (list.length === 0) return [{ id: movedId, position: opts.fallback ?? Date.now() }]

  const writable = opts.writable ?? (() => true)
  // Window list[l..r] (inclusive, possibly empty) is renumbered along with the moved item.
  let l = k
  let r = k - 1
  for (;;) {
    const lower = l > 0 ? list[l - 1].position : null
    const upper = r < list.length - 1 ? list[r + 1].position : null
    const n = r - l + 2
    const pts = spread(lower, upper, n, list[0].position)
    if (pts) {
      const ordered = [...list.slice(l, k), { id: movedId, position: NaN }, ...list.slice(k, r + 1)]
      const out: PositionChange[] = []
      ordered.forEach((s, i) => {
        if (s.id === movedId || s.position !== pts[i]) out.push({ id: s.id, position: pts[i] })
      })
      // The moved item first: its change is the one callers merge container fields into.
      out.sort((a, b) => (a.id === movedId ? -1 : b.id === movedId ? 1 : 0))
      return out
    }
    // Grow towards the side with fewer window items first; a side is blocked at an
    // item that must not be rewritten.
    const canLeft = l > 0 && writable(list[l - 1])
    const canRight = r < list.length - 1 && writable(list[r + 1])
    if (!canLeft && !canRight) return null
    const leftCount = k - l
    const rightCount = r - k + 1
    if (canLeft && (!canRight || leftCount <= rightCount)) l--
    else r++
  }
}

/**
 * Plan a keyboard step: one place up (-1) or down (+1), or to the top or bottom of
 * `siblings`. Null when the item is not in the list or already at that edge (the
 * key then does nothing and queues no op).
 */
export function planStep<T extends Positioned>(
  siblings: T[], id: string, step: -1 | 1 | 'top' | 'bottom', opts: { writable?: (item: T) => boolean } = {},
): PositionChange[] | null {
  const sorted = [...siblings].sort(compareByPosition)
  const i = sorted.findIndex((s) => s.id === id)
  if (i < 0) return null
  const last = sorted.length - 1
  const target = step === 'top' ? 0 : step === 'bottom' ? last : i + step
  if (target < 0 || target > last || target === i) return null
  const plan = planMove(sorted, id, target, opts)
  return plan && plan.length ? plan : null
}

/**
 * The single position that moves `id` one place up (-1) or down (+1), or null at
 * an edge or when the gap is exhausted (use planStep, which renumbers, instead).
 * Kept for board-view callers and tests.
 */
export function positionForStep<T extends Positioned>(siblings: T[], id: string, delta: -1 | 1): number | null {
  const plan = planStep(siblings, id, delta)
  return plan && plan.length === 1 ? plan[0].position : null
}
