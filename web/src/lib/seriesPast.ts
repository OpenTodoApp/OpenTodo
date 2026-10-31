// "All occurrences" with "Also past ones" (OpenSpec change series-all-scope, design
// D1, D2): an edit of a series that also reaches its past, the done and skipped
// occurrence records and the earlier pieces of its lineage with their records.
// Past records take the descriptive fields only, where they still hold their
// series' value; their completion, skip and dates never change. Earlier pieces take
// those fields, a new time on their own dates and a new rule within their own
// range. Later pieces are never written. Pure functions over local rows, kept out
// of the first load; pinned by the client-only cases of series.fixture.json.
import { lineageOf, pieceEnd } from './lineage'
import type { Change } from './ops'
import { canonicalOf, parseRule } from './recurrence'
import { recordsOf } from './recurring'
import { planCarry } from './seriesPlan'
import type { Due, Task } from './types'

/** Fields "Also past ones" writes to past records and earlier pieces (D2): title, notes, labels, project with its section, priority. */
export const PAST_FIELDS = ['title', 'description', 'labels', 'project_id', 'section_id', 'priority'] as const

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** The pieces of the lineage before `series` (its earlier pieces), oldest first. */
function earlierPieces(series: Task, tasks: readonly Task[]): Task[] {
  const pieces = lineageOf(series, tasks)
  const i = pieces.findIndex((p) => p.task.id === series.id)
  return i > 0 ? pieces.slice(0, i).map((p) => p.task) : []
}

/** True when an All-occurrences edit of `series` has a past to affect: an earlier piece, or a done or skipped record of the series (D1). */
export function hasPast(series: Task, tasks: Iterable<Task>): boolean {
  const list = [...tasks]
  if (earlierPieces(series, list).length) return true
  return recordsOf(series.id, list).some((r) => r.state !== 'open')
}

/** The past fields of `patch` that change `before`, the series' previous values. */
function pastPatch(patch: Record<string, unknown>, before: Task): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const prev = before as unknown as Record<string, unknown>
  for (const f of PAST_FIELDS) if (f in patch && !same(patch[f], prev[f])) out[f] = patch[f]
  // A new project leaves the old project's section.
  if ('project_id' in out && !('section_id' in patch) && before.section_id) out.section_id = null
  return out
}

/** The past fields of `change` written to the done and skipped records of `of` that still hold its previous value. */
function pastRecords(of: Task, change: Record<string, unknown>, tasks: readonly Task[]): Change[] {
  if (!Object.keys(change).length) return []
  const prev = of as unknown as Record<string, unknown>
  const out: Change[] = []
  for (const r of recordsOf(of.id, tasks)) {
    if (r.state === 'open') continue
    const rec = r.task as unknown as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    for (const [f, v] of Object.entries(change)) if (same(rec[f], prev[f])) patch[f] = v
    if (Object.keys(patch).length) out.push({ entity: 'task', entityId: r.task.id, patch })
  }
  return out
}

/** What an earlier piece takes from the edit: the past fields, a new time on its own date, a new calendar rule within its range (D2.3). */
function piecePatch(piece: Task, end: string | null, patch: Record<string, unknown>, before: Task): Record<string, unknown> {
  const out: Record<string, unknown> = { ...pastPatch(patch, before) }
  for (const f of PAST_FIELDS) if (f in out && same(out[f], (piece as unknown as Record<string, unknown>)[f])) delete out[f]
  if ('project_id' in out && !('section_id' in out) && piece.section_id) out.section_id = null
  const due = patch.due as Due | null | undefined
  if (due && before.due && piece.due && (due.time !== before.due.time || due.tz !== before.due.tz)
    && (due.time !== piece.due.time || due.tz !== piece.due.tz)) {
    out.due = due.time ? { date: piece.due.date, time: due.time, ...(due.tz ? { tz: due.tz } : {}) } : { date: piece.due.date }
  }
  if (typeof patch.recurrence === 'string' && patch.recurrence !== before.recurrence) {
    const next = parseRule(patch.recurrence)
    const own = piece.recurrence ? parseRule(piece.recurrence) : null
    if (next.ok && !next.rule.afterCompletion) {
      const ownUntil = own?.ok ? own.rule.until : undefined
      const until = [ownUntil, end ?? undefined].filter((d): d is string => !!d).sort()[0]
      const rule = canonicalOf(until ? { ...next.rule, until, count: 0 } : next.rule)
      if (rule !== piece.recurrence) out.recurrence = rule
    }
  }
  return out
}

/**
 * The writes "Also past ones" adds to an All-occurrences edit of `series` with
 * `patch` (applied to `series` as it was), beyond the series' own change and the
 * carry to its open records: the done and skipped records of the series, every
 * earlier piece and every record of an earlier piece (D2). Empty when the edit
 * reaches nothing past.
 */
export function planPast(series: Task, patch: Record<string, unknown>, tasks: Iterable<Task>): Change[] {
  if (!series.recurrence) return []
  const list = [...tasks]
  const out: Change[] = [...pastRecords(series, pastPatch(patch, series), list)]
  const pieces = lineageOf(series, list)
  const i = pieces.findIndex((p) => p.task.id === series.id)
  for (let k = 0; k < i; k++) {
    const piece = pieces[k].task
    const change = piecePatch(piece, pieceEnd(pieces, k), patch, series)
    if (!Object.keys(change).length) continue
    out.push({ entity: 'task', entityId: piece.id, patch: change })
    // The piece's own records against the piece's values, as if it had been edited.
    out.push(...planCarry(piece, change, list), ...pastRecords(piece, pastPatch(change, piece), list))
  }
  return merge(out)
}

/** One change per row: later patches of the same row join the first. */
function merge(changes: Change[]): Change[] {
  const by = new Map<string, Change>()
  for (const c of changes) {
    const key = `${c.entity}:${c.entityId}`
    const had = by.get(key)
    if (had) had.patch = { ...had.patch, ...c.patch }
    else by.set(key, { ...c, patch: { ...c.patch } })
  }
  return [...by.values()]
}
