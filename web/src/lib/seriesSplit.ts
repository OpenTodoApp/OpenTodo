// "This and following" (OpenSpec change series-split, design D1, D6): change a
// series from one of its later occurrences on by ending it the day before and
// starting a new series, the piece, on that date; and "Delete this and following",
// which only ends it. Pure planning over the local rows, loaded with the panel's
// scope control and the projection menu; the server's port is
// internal/sync/lineage.go, pinned with this module by series.fixture.json.
import { addDaysISO } from './dates'
import { pieceId } from './ids'
import { nextFree } from './occurrences'
import type { Change } from './ops'
import { canonicalOf, firstOccurrence, parseRule, type Rule } from './recurrence'
import { currentOccurrence, recordFields, seriesBudget, seriesRule } from './recurring'
import { actsOnFuture, copyReminders, isActionable, planCarry } from './seriesPlan'
import type { Due, Reminder, Task } from './types'

/** The rule with its end replaced by `until` (the pattern unchanged). */
export function endedRule(rule: Rule, until: string): string {
  return canonicalOf({ ...rule, until, count: 0 })
}

/**
 * Whether the series can be split, or ended, from `date`: a calendar rule, and a
 * date after the current occurrence that is one of its occurrences (a projection or
 * a record of its own). On the current occurrence an All-occurrences edit does the same.
 */
export function splittable(series: Task, date: string, tasks: Iterable<Task>, today: string): boolean {
  const rule = seriesRule(series)
  if (!actsOnFuture(rule)) return false
  const list = [...tasks]
  const current = currentOccurrence(series, rule, list, today)
  return current !== null && date > current && isActionable(series, rule, date, list, today)
}

export interface SplitPlan {
  changes: Change[]
  pieceId: string
  /** The piece's first occurrence date. */
  first: string
}

/**
 * Split the series from `date` with `patch` (task fields) applied from there on:
 * the series' rule ends the day before, the piece (id derived from series and
 * date, so two devices splitting alike make one) carries the series' fields with
 * the change, `split_from`, the habit flag and the series' end condition (or the
 * change's rule), its due on the first occurrence of its rule from `date` that is
 * not an exception of the lineage, at the series' time unless the change sets
 * another; the series' relative reminders are copied, and the change carries to
 * the series' open records from `date` on that still hold the old value. Null when
 * the series cannot be split there.
 */
export function planSplit(
  series: Task, date: string, patch: Record<string, unknown>, tasks: Iterable<Task>, now: number, today: string, reminders: readonly Reminder[] = [],
): SplitPlan | null {
  const list = [...tasks]
  const rule = seriesRule(series)
  if (!rule || !series.due || !splittable(series, date, list, today)) return null
  let text = series.recurrence as string
  if (typeof patch.recurrence === 'string') {
    const parsed = parseRule(patch.recurrence)
    if (!parsed.ok || parsed.rule.afterCompletion) return null
    text = parsed.canonical
  } else if ('recurrence' in patch) return null
  const own = parseRule(text)
  if (!own.ok) return null
  const b = seriesBudget(series, list, undefined, today)
  let first: string | null = firstOccurrence(own.rule, date)
  if (b.except.has(first)) first = nextFree(own.rule, first, today, today, -1, b.except)
  if (first === null || (own.rule.until && first > own.rule.until)) return null
  const id = pieceId(series.id, date)
  const due = pieceDue(series.due, first, patch)
  const fields: Record<string, unknown> = { ...recordFields(series, first, now, today) }
  delete fields.occurrence_date
  const { due: _due, recurrence: _rule, ...rest } = patch
  Object.assign(fields, rest, {
    due, recurrence: text, series_id: null, split_from: { series: series.id, date }, created_at: now, completed_at: null, deleted_at: null,
    ...(series.habit ? { habit: true } : {}),
  })
  return {
    pieceId: id, first,
    changes: [
      { entity: 'task', entityId: series.id, patch: { recurrence: endedRule(rule, addDaysISO(date, -1)) } },
      { entity: 'task', entityId: id, patch: fields },
      ...copyReminders(series.id, id, due, reminders, now),
      ...planCarry(series, patch, list, date),
    ],
  }
}

/** The piece's due: on its first date, at the change's time (and zone) when it sets one, else the series'. */
function pieceDue(base: Due, date: string, patch: Record<string, unknown>): Due {
  const from = (patch.due as Due | null | undefined) ?? base
  return from.time ? { date, time: from.time, ...(from.tz ? { tz: from.tz } : {}) } : { date }
}

/** "Delete this and following": the series ends the day before `date`, no piece (records stay). Null when it cannot. */
export function planEndFrom(series: Task, date: string, tasks: Iterable<Task>, today: string): Change[] | null {
  const rule = seriesRule(series)
  if (!rule || !splittable(series, date, tasks, today)) return null
  return [{ entity: 'task', entityId: series.id, patch: { recurrence: endedRule(rule, addDaysISO(date, -1)) } }]
}
