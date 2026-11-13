// Acting on a habit (OpenSpec change habits-home, design D5, D6, D7): checking in
// (full or the tiny version), editing a past day, graduating and resuming, and
// creating or turning a task into a habit. The planners are pure functions of the
// local rows; the actions apply them as one batch with one Undo, locally first, so
// everything works offline and converges as ordinary field operations.
import { addDaysISO, logicalToday } from './dates'
import { db } from './db'
import { habitRule, isGraduated, pieceFor, scheduled } from './habits'
import { occurrenceId, pieceId } from './ids'
import { lineageRows } from './lineageRows'
import { nextFree } from './occurrences'
import { actOnOccurrenceUndoable, type OccurrenceResult } from './occurrenceActions'
import { getDeviceId, planTask, type Change } from './ops'
import { canonicalOf, compatibleRule, firstOccurrence, parseRule } from './recurrence'
import { recordFields, seriesBudget } from './recurring'
import { copyReminders } from './seriesPlan'
import { endedRule } from './seriesSplit'
import type { Reminder, Task } from './types'
import { applyBatch } from './undo'
import type { ProposedChange } from './assistantTypes'
import { t } from './i18n'

/** What a past day can be set to (D6). */
export type DayChoice = 'done' | 'tiny' | 'skipped' | 'clear'

/**
 * Setting a past scheduled day (D6): Done, Tiny and Skipped write that date's
 * record (the derived id of the piece whose range holds it) without moving the
 * series; Clear tombstones it so the day reads as missed. Null when there is
 * nothing to write (Clear on a day without a record).
 */
export function planPastDay(series: Task, tasks: readonly Task[], date: string, choice: DayChoice, now: number, today: string): Change[] | null {
  const piece = pieceFor(series, tasks, date)
  const id = occurrenceId(piece.id, date)
  const existing = tasks.find((x) => x.id === id && !x.deleted_at)
  if (choice === 'clear') return existing ? [{ entity: 'task', entityId: id, patch: { deleted_at: now } }] : null
  const state = { completed_at: now, skipped: choice === 'skipped', tiny: choice === 'tiny' }
  if (existing) return [{ entity: 'task', entityId: id, patch: state }]
  return [{ entity: 'task', entityId: id, patch: { ...recordFields(piece, date, now, today), ...state } }]
}

/** The last date the rule schedules before `today`, within a year; null when none. */
function lastScheduledBefore(series: Task, today: string): string | null {
  const rule = habitRule(series)
  if (!rule) return null
  const due = series.due?.date ?? today
  for (let d = addDaysISO(today, -1), i = 0; i < 366; i++, d = addDaysISO(d, -1)) if (scheduled(rule, due, d)) return d
  return null
}

/**
 * Graduate (D7): `habit_graduated_at` and the rule's `until` set to the last
 * scheduled date before today, in one batch, so older clients stop producing
 * occurrences too. Null for a task that is not an ungraduated habit with a calendar rule.
 */
export function planGraduate(series: Task, now: number, today: string): Change[] | null {
  const rule = habitRule(series)
  if (!series.habit || !rule || isGraduated(series)) return null
  const until = lastScheduledBefore(series, today) ?? addDaysISO(today, -1)
  const ends = rule.until && rule.until < until ? rule.until : until
  return [{ entity: 'task', entityId: series.id, patch: { habit_graduated_at: now, recurrence: endedRule(rule, ends) } }]
}

/**
 * Resume (D7): a new piece of the lineage from the logical today, with the rule as
 * it was before graduating (without the `until`), due on its first scheduled date
 * on or after today that is not an exception. The graduated piece keeps its flag
 * and its records, so the days in between are outside every piece's range and read
 * as unscheduled. Null when the series is not graduated or has no calendar rule.
 */
export function planResume(series: Task, tasks: readonly Task[], now: number, today: string, reminders: readonly Reminder[] = []): { changes: Change[]; pieceId: string } | null {
  const rule = habitRule(series)
  if (!rule || !isGraduated(series) || !series.due) return null
  const text = canonicalOf({ ...rule, until: null })
  const own = parseRule(text)
  if (!own.ok) return null
  const b = seriesBudget(series, tasks, undefined, today)
  let first: string | null = firstOccurrence(own.rule, today)
  if (b.except.has(first)) first = nextFree(own.rule, first, today, today, -1, b.except)
  if (first === null) return null
  const id = pieceId(series.id, today)
  const base = series.due
  const due = base.time ? { date: first, time: base.time, ...(base.tz ? { tz: base.tz } : {}) } : { date: first }
  const fields: Record<string, unknown> = { ...recordFields(series, first, now, today) }
  delete fields.occurrence_date
  Object.assign(fields, {
    due, recurrence: compatibleRule(text, first), series_id: null, split_from: { series: series.id, date: today },
    created_at: now, completed_at: null, deleted_at: null, habit: true, habit_graduated_at: null,
    ...(series.habit_tiny ? { habit_tiny: series.habit_tiny } : {}),
    ...(series.habit_anchor ? { habit_anchor: series.habit_anchor } : {}),
    ...(series.rotation?.length ? { rotation: series.rotation } : {}),
    ...(series.notes_doc ? { notes_doc: series.notes_doc } : {}),
  })
  return { pieceId: id, changes: [{ entity: 'task', entityId: id, patch: fields }, ...copyReminders(series.id, id, due, reminders, now)] }
}

/** What the New habit form fills in (D9: title, how often, tiny version, anchor, part of the day). */
export interface HabitInput {
  title: string
  /** A calendar rule in any spelling the grammar accepts. */
  rule: string
  tiny: string
  anchor: string
  /** Morning, Afternoon, This Evening, or none (Any time). */
  part: 'morning' | 'afternoon' | 'evening' | null
  projectId?: string | null
}

/** Why a habit cannot be made from a rule: none (ok), not a valid rule, or a completion-relative rule. */
export function habitRuleProblem(rule: string): 'invalid' | 'after-completion' | null {
  const p = parseRule(rule)
  if (!p.ok) return 'invalid'
  return p.rule.afterCompletion ? 'after-completion' : null
}

/** The habit fields of the form, as a task patch. */
function habitPatch(input: HabitInput): Record<string, unknown> {
  return {
    habit: true, habit_tiny: input.tiny.trim(), habit_anchor: input.anchor.trim(),
    evening: input.part === 'evening', day_part: input.part === 'morning' || input.part === 'afternoon' ? input.part : null,
  }
}

/**
 * Make it a habit (D9): the task keeps its calendar rule, or gets the form's; the flag,
 * tiny version, anchor and part of the day in the same batch. Null for a
 * completion-relative or invalid rule (the form asks for a calendar rule first).
 */
export function planMakeHabit(task: Task, input: HabitInput, today: string): Change[] | null {
  if (habitRuleProblem(input.rule)) return null
  const p = parseRule(input.rule)
  if (!p.ok) return null
  const patch: Record<string, unknown> = { ...habitPatch(input), title: input.title.trim() || task.title }
  if (task.recurrence !== p.canonical) {
    const due = task.due ?? { date: firstOccurrence(p.rule, today) }
    patch.recurrence = compatibleRule(p.canonical, due.date)
    if (!task.due) patch.due = due
  }
  return [{ entity: 'task', entityId: task.id, patch }]
}

/** The rule the form proposes for a task (D9): its own rule (a completion-relative one is then refused), else `every day`. */
export function proposedRule(task: Pick<Task, 'recurrence'> | null | undefined): string {
  return task?.recurrence || 'every day'
}

// ---- the actions (one batch, one Undo) ----

async function apply(changes: Change[], label: string) {
  await getDeviceId()
  const proposed: ProposedChange[] = []
  for (const c of changes) {
    const local = c.entity === 'task' ? await db.tasks.get(c.entityId) : c.entity === 'reminder' ? await db.reminders.get(c.entityId) : undefined
    proposed.push({ entity: c.entity, entityId: c.entityId, patch: c.patch, ...(local ? {} : { create: true }) })
  }
  const entry = await applyBatch(proposed, { source: 'action', label })
  return entry ? { entry, label } : null
}

/** Check in the current occurrence (D5): completes it exactly as completing the task does; `tiny` logs the tiny version. */
export function checkIn(seriesId: string, tiny = false, opts: { now?: number; today?: string } = {}): Promise<OccurrenceResult | null> {
  return actOnOccurrenceUndoable(seriesId, null, { kind: 'complete', ...(tiny ? { tiny: true } : {}) }, opts)
}

/** Set a past day (D6) with an Undo offer. */
export async function setPastDay(seriesId: string, date: string, choice: DayChoice, now = Date.now(), today = logicalToday()) {
  const series = await db.tasks.get(seriesId)
  if (!series) return null
  const changes = planPastDay(series, await lineageRows(seriesId), date, choice, now, today)
  return changes ? apply(changes, choice === 'clear' ? t('Day cleared') : t('Day changed')) : null
}

/** Graduate a habit (D7) with an Undo offer. */
export async function graduate(seriesId: string, now = Date.now(), today = logicalToday()) {
  const series = await db.tasks.get(seriesId)
  const changes = series ? planGraduate(series, now, today) : null
  return changes ? apply(changes, t('Habit graduated')) : null
}

/** Resume a graduated habit (D7) with an Undo offer. */
export async function resume(seriesId: string, now = Date.now(), today = logicalToday()) {
  const series = await db.tasks.get(seriesId)
  if (!series) return null
  const reminders = await db.reminders.where('task_id').equals(seriesId).toArray()
  const plan = planResume(series, await lineageRows(seriesId), now, today, reminders.filter((r) => !r.deleted_at))
  return plan ? apply(plan.changes, t('Habit resumed')) : null
}

/** Create a habit from the form (D9): one task, one batch, one Undo. */
export async function createHabit(input: HabitInput) {
  if (habitRuleProblem(input.rule)) return null
  const planned = await planTask({ title: input.title, recurrence: input.rule, project_id: input.projectId ?? null })
  const patch = { ...planned.change.patch, ...habitPatch(input) }
  const r = await apply([{ entity: 'task', entityId: planned.id, patch }], t('Habit created'))
  return r ? { ...r, id: planned.id } : null
}

/** Make an existing task a habit (D9) with an Undo offer. */
export async function makeHabit(taskId: string, input: HabitInput, today = logicalToday()) {
  const task = await db.tasks.get(taskId)
  const changes = task ? planMakeHabit(task, input, today) : null
  return changes ? apply(changes, t('Habit created')) : null
}
