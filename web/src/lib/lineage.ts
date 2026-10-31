// The pieces of a split series (OpenSpec change series-split, M7, D3): "This and
// following" ends a series the day before a date and starts a new series, the
// piece, whose `split_from` names it and that date. The pieces of one lineage are
// the root and every task whose `split_from` chain leads to it; ordered by their
// dates, each produces occurrences from its own date to the day before the next
// piece's, whatever its stored `until` says, so two devices splitting at different
// dates offline converge without a coordinator. Derived from synced rows only.
// The Go port is internal/sync/lineage.go, pinned with this module by
// series.fixture.json.
import { addDaysISO } from './dates'
import type { Rule } from './recurrence'
import type { SplitFrom, Task } from './types'

/** Pieces of one lineage taken into account at most; older ones end at their own `until` (design, Risks). */
export const MAX_PIECES = 50

/** A task's `split_from` when it is well formed (a value from a newer or broken client is ignored). */
export function splitOf(task: Pick<Task, 'split_from'>): SplitFrom | null {
  const s = task.split_from
  return s && typeof s.series === 'string' && typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s : null
}

export interface Piece {
  task: Task
  /** The first date it produces occurrences on: its `split_from.date`, null for the root. */
  start: string | null
}

/**
 * The lineage `series` belongs to among `tasks`: the root first, then the pieces by
 * date (by id on a tie). A series nobody split, and the common case of no split at
 * all, is a lineage of one. `series` stands for its own row (it may carry unsaved
 * values).
 */
export function lineageOf(series: Task, tasks: Iterable<Task>): Piece[] {
  const list = Array.isArray(tasks) ? (tasks as Task[]) : [...tasks]
  const pieces = list.filter((t) => splitOf(t) && !t.deleted_at && !t.series_id)
  if (!pieces.length && !splitOf(series)) return [{ task: series, start: null }]
  if (splitOf(series) && !pieces.some((p) => p.id === series.id)) pieces.push(series)
  // Only the rows a split names are looked up.
  const named = new Set([...pieces, series].map((p) => splitOf(p)?.series))
  const byId = new Map<string, Task>()
  for (const t of list) if ((named.has(t.id) || splitOf(t)) && !t.deleted_at && !t.series_id) byId.set(t.id, t)
  byId.set(series.id, series)
  // Up the chain to the first series that continues none (a cycle, which derived
  // ids cannot make, stops where it closes).
  const rootOf = (t: Task): Task => {
    const seen = new Set<string>()
    let cur = t
    for (let s = splitOf(cur); s && !seen.has(cur.id); s = splitOf(cur)) {
      seen.add(cur.id)
      const up = byId.get(s.series)
      if (!up) break
      cur = up
    }
    return cur
  }
  const root = rootOf(series)
  const later = pieces
    .filter((p) => p.id !== root.id && rootOf(p).id === root.id)
    .map((p): Piece => ({ task: p.id === series.id ? series : p, start: splitOf(p)!.date }))
    .sort((a, b) => (a.start! < b.start! ? -1 : a.start! > b.start! ? 1 : a.task.id < b.task.id ? -1 : 1))
  const out: Piece[] = [{ task: root.id === series.id ? series : root, start: null }, ...later]
  if (out.length <= MAX_PIECES) return out
  const kept = out.slice(out.length - MAX_PIECES)
  return kept.some((p) => p.task.id === series.id) ? kept : [{ task: series, start: null }]
}

/** The last date piece `i` produces occurrences on: the day before the next piece's date, null when it is the last. */
export function pieceEnd(pieces: readonly Piece[], i: number): string | null {
  const next = pieces[i + 1]
  return next?.start ? addDaysISO(next.start, -1) : null
}

/** The rule with its `until` no later than `end` (a piece's derived end). */
export function bounded(rule: Rule, end: string | null): Rule {
  return end && (!rule.until || rule.until > end) ? { ...rule, until: end } : rule
}
