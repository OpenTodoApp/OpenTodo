// Acting on one occurrence of a series (OpenSpec change series-exceptions, design
// D2, D4, D6, D8): the planning beyond the current occurrence, kept apart from
// recurring.ts so the first load carries only what completing and skipping need;
// the panel, the calendar menu and the repair after a pull load it on first use.
// Pure functions; the server's port is internal/sync/occurrences.go, pinned with
// this module by series.fixture.json.
import { nameId, occurrenceId } from './ids'
import { nextFree, walkOccurrences } from './occurrences'
import type { Change } from './ops'
import type { Rule } from './recurrence'
import {
  currentOccurrence, exceptionDates, isRecordOf, moveDates, planCompletion, planSkip, recordFields, recordsOf, seriesBudget, seriesRule, standOn,
} from './recurring'
import { relativeFireAt } from './reminderTime'
import type { Due, Reminder, Task } from './types'

/**
 * "This occurrence only": the current occurrence's open record (id derived from
 * series and date, `occurrence_date` set) and the series moves on to its next free
 * occurrence. Null when there is none (the record would use up the last one).
 */
export function planDetach(series: Task, now: number, today: string, tasks: Iterable<Task> = [], reminders: readonly Reminder[] = []): { changes: Change[]; copyId: string } | null {
  const plan = planActOn(series, null, { kind: 'detach' }, tasks, now, today, reminders)
  return plan ? { changes: plan.changes, copyId: plan.recordId } : null
}

// ---- acting on one occurrence (D2, D4) ----

export type OccurrenceAction =
  | { kind: 'complete' }
  | { kind: 'skip' }
  | { kind: 'move'; due: Due }
  | { kind: 'edit'; patch: Record<string, unknown> }
  | { kind: 'detach' }

export interface ActPlan {
  changes: Change[]
  recordId: string
  /** The record existed before this action. */
  existed: boolean
  /** The record's fields as an untouched open occurrence on its date: what an Undo goes back to. */
  base: Record<string, unknown>
  /** Completing the current occurrence reached the end condition: the caller completes the series like a plain task (no changes here). */
  end?: true
}

/** True when the series' future occurrences can be acted on: a calendar rule (D4). */
export function actsOnFuture(rule: Rule | null): rule is Rule {
  return !!rule && !rule.afterCompletion
}

/**
 * Whether `date` is an occurrence of the series the user can act on: the current
 * occurrence, a projected date (within the end condition, not an exception), or a
 * date with a record.
 */
export function isActionable(series: Task, rule: Rule, date: string, tasks: Iterable<Task>, today: string): boolean {
  const list = [...tasks]
  const current = currentOccurrence(series, rule, list, today)
  if (current === null || date < current) return false
  const { taken, except } = seriesBudget(series.id, list, current)
  if (except.has(date) || date === current) return true
  if (rule.afterCompletion) return false
  return walkOccurrences(rule, current, today, taken, date, date, (d) => d, except).dates.includes(date)
}

/**
 * Act on one occurrence (`date`, or the current one when null): complete, skip,
 * move, edit or detach it alone. On the current occurrence the series also moves to
 * its next free date; on a later one only the record is written (the series stays).
 * An existing record is updated in place. Moving, editing or detaching writes an
 * open record and copies the series' relative reminders onto it (D7). Null when the
 * date cannot be acted on.
 */
export function planActOn(
  series: Task, date: string | null, action: OccurrenceAction, tasks: Iterable<Task>, now: number, today: string, reminders: readonly Reminder[] = [],
): ActPlan | null {
  const rule = seriesRule(series)
  if (!rule) return null
  const list = [...tasks]
  const current = currentOccurrence(series, rule, list, today)
  if (current === null) return null
  const on = date ?? current
  if (!isActionable(series, rule, on, list, today)) return null
  const recordId = occurrenceId(series.id, on)
  const existing = list.find((t) => t.id === recordId && !t.deleted_at && isRecordOf(series.id, t))
  const at = standOn(series, current, today)
  const base = recordFields(at, on, now, today)
  const state = statePatch(action, now)
  if (existing) {
    if (action.kind === 'detach') return null
    return { recordId, existed: true, base, changes: [{ entity: 'task', entityId: recordId, patch: state }] }
  }
  if (on === current && (action.kind === 'complete' || action.kind === 'skip')) {
    const changes = action.kind === 'complete' ? planCompletion(series, rule, list, now, today) : null
    if (changes) return changes.kind === 'roll' ? { recordId, existed: false, base, changes: changes.changes } : { recordId, existed: false, base, changes: [], end: true }
    const skip = planSkip(series, rule, now, today, list)
    return skip ? { recordId, existed: false, base, changes: skip } : null
  }
  const changes: Change[] = [{ entity: 'task', entityId: recordId, patch: { ...base, ...state } }]
  if (on === current) {
    // The record uses up an occurrence: the series continues only within the budget.
    const { taken, except } = seriesBudget(series.id, list, on)
    const next = nextFree(rule, on, today, today, taken, new Set([...except, on]))
    if (next === null) return null
    changes.push({ entity: 'task', entityId: series.id, patch: moveDates(at, next, today) })
  }
  if (!state.completed_at) changes.push(...copyReminders(series.id, recordId, (state.due as Due | undefined) ?? (base.due as Due), reminders, now))
  return { recordId, existed: false, base, changes }
}

/** The fields an action writes on a record. */
function statePatch(action: OccurrenceAction, now: number): Record<string, unknown> {
  switch (action.kind) {
    case 'complete': return { completed_at: now, skipped: false }
    case 'skip': return { completed_at: now, skipped: true }
    case 'move': return { due: action.due }
    case 'edit': return { ...action.patch }
    case 'detach': return {}
  }
}

/**
 * Copies of the series' relative reminders for a materialised occurrence (D7): ids
 * derived from the record and the reminder so devices converge, fire_at from the
 * record's own due. Absolute and deadline reminders stay on the series.
 */
export function copyReminders(seriesId: string, recordId: string, due: Due, reminders: readonly Reminder[], now: number): Change[] {
  return reminders
    .filter((r) => r.task_id === seriesId && !r.deleted_at && (r.kind ?? 'relative') === 'relative')
    .map((r) => ({
      entity: 'reminder' as const, entityId: nameId('occurrence-reminder', `${recordId}:${r.id}`),
      patch: { task_id: recordId, kind: 'relative', offset_minutes: r.offset_minutes, fire_at: relativeFireAt(due, r.offset_minutes), delivered_at: null, dismissed_at: null, created_at: now, deleted_at: null },
    }))
}

// ---- carry (D6) ----

/** Fields an All-occurrences edit carries to untouched open records (D6). */
export const CARRIED_FIELDS = ['title', 'priority', 'labels', 'project_id', 'section_id', 'estimate_minutes', 'assignee_id', 'location'] as const

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * An All-occurrences edit of the series (`patch`, applied to `series` as it was)
 * also writes the new value to every open record whose value still equals the
 * series' previous one. Done and skipped records, notes and record dates never
 * change. The due's time and zone carry; its date does not.
 */
export function planCarry(series: Task, patch: Record<string, unknown>, tasks: Iterable<Task>): Change[] {
  if (!series.recurrence) return []
  const out: Change[] = []
  for (const r of recordsOf(series.id, tasks)) {
    if (r.state !== 'open') continue
    const carry: Record<string, unknown> = {}
    const rec = r.task as unknown as Record<string, unknown>
    const before = series as unknown as Record<string, unknown>
    for (const f of CARRIED_FIELDS) {
      if (!(f in patch) || same(patch[f], before[f])) continue
      if (same(rec[f], before[f])) carry[f] = patch[f]
    }
    const due = patch.due as Due | null | undefined
    if (due && series.due && r.task.due && (due.time !== series.due.time || due.tz !== series.due.tz)
      && r.task.due.time === series.due.time && r.task.due.tz === series.due.tz) {
      carry.due = due.time ? { date: r.task.due.date, time: due.time, ...(due.tz ? { tz: due.tz } : {}) } : { date: r.task.due.date }
    }
    if (Object.keys(carry).length) out.push({ entity: 'task', entityId: r.task.id, patch: carry })
  }
  return out
}

// ---- repair (M5, D8) ----

/**
 * A series due on one of its exception dates (it rolled before this device saw
 * another device's record) moves to the next free occurrence; every device computes
 * the same value. When none is left the series completes as at its end condition.
 * Empty when nothing needs repair.
 */
export function planRepair(series: Task, tasks: Iterable<Task>, today: string, now: number): Change[] {
  const rule = seriesRule(series)
  if (!actsOnFuture(rule) || !series.due) return []
  const list = [...tasks]
  const date = series.due.date
  if (!exceptionDates(series.id, list).has(date)) return []
  const next = currentOccurrence(series, rule, list, today)
  if (next === null) return [{ entity: 'task', entityId: series.id, patch: { completed_at: now } }]
  return [{ entity: 'task', entityId: series.id, patch: moveDates(series, next, today) }]
}
