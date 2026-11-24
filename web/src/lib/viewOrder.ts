// A label page's or saved view's own manual order (OpenSpec change
// view-manual-order). The order is stored on the label or the view as the ids
// of the tasks placed by hand (`manual_order`, design D1); the tasks' project
// positions are never written. Pure functions: the order of a page, a move's
// new stored list (D2) and a keyboard step's anchor (D4). The write is in
// viewOrderMove.ts.
import { compareDue } from './dates'
import type { Task } from './types'

/** The most ids a stored order holds; the op schema refuses more (design D2). */
export const MAX_VIEW_ORDER = 500

type OrderTask = Pick<Task, 'id' | 'position' | 'due' | 'priority'>

/** Where a moved task goes: right before or after another task of the page. */
export type ViewPlacement = { before: string } | { after: string }

/** A keyboard step (manual-ordering "Keyboard moves"). */
export type ViewStep = -1 | 1 | 'top' | 'bottom'

/** Each placed id's rank; a missing or malformed stored value places nothing. */
export function orderRank(order: unknown): Map<string, number> {
  const rank = new Map<string, number>()
  if (Array.isArray(order)) for (const id of order) if (typeof id === 'string' && !rank.has(id)) rank.set(id, rank.size)
  return rank
}

/**
 * The fallback for tasks never placed: what the page showed before it had its own
 * order (position, then due, priority and id, as a view's "position" sort).
 */
export function compareUnplaced(a: OrderTask, b: OrderTask): number {
  return a.position - b.position || compareDue(a.due, b.due) || a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** Manual order ascending: placed tasks in the stored order, then the rest by the fallback. */
export function compareManual<T extends OrderTask>(rank: ReadonlyMap<string, number>, unplaced: (a: T, b: T) => number = compareUnplaced): (a: T, b: T) => number {
  return (a, b) => {
    const ra = rank.get(a.id)
    const rb = rank.get(b.id)
    if (ra !== undefined && rb !== undefined) return ra - rb
    if (ra !== undefined) return -1
    if (rb !== undefined) return 1
    return unplaced(a, b)
  }
}

/** The page's task ids in manual order ascending, each once. */
export function manualSequence<T extends OrderTask>(tasks: readonly T[], rank: ReadonlyMap<string, number>, unplaced: (a: T, b: T) => number = compareUnplaced): string[] {
  const seen = new Set<string>()
  const unique = tasks.filter((task) => !seen.has(task.id) && !!seen.add(task.id))
  return unique.sort(compareManual(rank, unplaced)).map((task) => task.id)
}

/**
 * The stored list after moving `moved` next to an anchor (design D2). `seq` is the
 * page's visible task ids in manual order (manualSequence) and must hold both. The
 * new list is the new sequence up to its last placed task, so tasks below stay
 * unplaced; a stored id not on the page right now is kept after the id that
 * preceded it when `keep` says so (an open task the page may show again), else
 * dropped. At most MAX_VIEW_ORDER ids (boundOrder): `explicit` are the ids placed
 * by hand before this move (default: `stored`); `moved` always stays. Null when
 * nothing changes or the move is impossible.
 */
export function planViewOrder(
  seq: readonly string[], stored: readonly string[], moved: string, at: ViewPlacement, keep: (id: string) => boolean,
  explicit: ReadonlySet<string> = new Set(stored),
): string[] | null {
  const anchor = 'before' in at ? at.before : at.after
  if (anchor === moved || !seq.includes(moved) || !seq.includes(anchor)) return null
  const rest = seq.filter((id) => id !== moved)
  const k = rest.indexOf(anchor) + ('before' in at ? 0 : 1)
  const next = [...rest.slice(0, k), moved, ...rest.slice(k)]
  if (next.every((id, i) => id === seq[i])) return null
  const placed = new Set(stored)
  placed.add(moved)
  let last = -1
  next.forEach((id, i) => { if (placed.has(id)) last = i })
  const out = next.slice(0, last + 1)
  // Ids not shown now: back after their stored predecessor, in stored order.
  const onPage = new Set(seq)
  const hidden = new Set<string>()
  stored.forEach((id, i) => {
    if (onPage.has(id) || hidden.has(id) || !keep(id)) return
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      // The moved task left its place: a hidden id stays with the neighbours it had.
      const p = stored[j] === moved ? -1 : out.indexOf(stored[j])
      if (p >= 0) { at = p + 1; break }
    }
    out.splice(at, 0, id)
    hidden.add(id)
  })
  const bounded = boundOrder(out, [moved, anchor], explicit, hidden)
  return bounded.length === stored.length && bounded.every((id, i) => id === stored[i]) ? null : bounded
}

/**
 * A list cut to MAX_VIEW_ORDER ids, each pass from the end: first the ids no one placed
 * by hand (shown rows a first move seeded, or unplaced rows between placed ones), then
 * the placed ids the page does not show (`hidden`), then the other placed ones. The
 * moved task and its anchor (`pinned`) never leave, so a move at any row takes effect.
 */
export function boundOrder(list: readonly string[], pinned: readonly string[], explicit: ReadonlySet<string>, hidden: ReadonlySet<string>): string[] {
  const out = [...list]
  const stays = new Set(pinned)
  const passes: ((id: string) => boolean)[] = [(id) => !explicit.has(id) && !hidden.has(id), (id) => hidden.has(id), () => true]
  for (const evict of passes) {
    for (let i = out.length - 1; out.length > MAX_VIEW_ORDER && i >= 0; i--) if (!stays.has(out[i]) && evict(out[i])) out.splice(i, 1)
  }
  return out
}

/**
 * The anchor of a keyboard step within a group (design D4): `group` is the group's
 * task ids in manual order. Null at the edge, as in a project.
 */
export function stepAnchor(group: readonly string[], id: string, step: ViewStep): ViewPlacement | null {
  const i = group.indexOf(id)
  const last = group.length - 1
  if (i < 0) return null
  if (step === -1) return i > 0 ? { before: group[i - 1] } : null
  if (step === 1) return i < last ? { after: group[i + 1] } : null
  if (step === 'top') return i > 0 ? { before: group[0] } : null
  return i < last ? { after: group[last] } : null
}
