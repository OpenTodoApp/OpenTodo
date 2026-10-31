// Recurring task flows (OpenSpec change recurring-tasks, design D5; series-exceptions
// D2). Pure planning functions: given the series row and the local task set they
// return the field changes to write; ops.ts applies them in one mutateMany batch.
// Every value is a function of inputs all devices share (series id, rule, due date,
// occurrence date, the series' records), so devices acting on the same occurrence
// offline write identical entities and converge under last-writer-wins without a
// coordinator. The server's port is internal/sync/occurrences.go, pinned with this
// module by series.fixture.json.
import { addDaysISO, daysBetweenISO } from './dates'
import { occurrenceId } from './ids'
import { nextFree } from './occurrences'
import type { Change } from './ops'
import { parseRule, type Rule } from './recurrence'
import type { Due, Task } from './types'

/** The parsed rule of an open, live series, or null when `task` is not one. */
export function seriesRule(task: Task | undefined): Rule | null {
  if (!task || !task.recurrence || task.completed_at || task.deleted_at) return null
  const parsed = parseRule(task.recurrence)
  return parsed.ok ? parsed.rule : null
}

/** The date of the occurrence the series currently stands on. */
export function occurrenceDate(series: Task, today: string): string {
  return series.due?.date ?? today
}

// ---- records (series-exceptions M3) ----

export type RecordState = 'open' | 'done' | 'skipped'

export interface OccurrenceRecord {
  task: Task
  /** The occurrence date the record stands for (RECURRENCE-ID). */
  date: string
  state: RecordState
}

/** The occurrence date a task stands for: `occurrence_date`, or its due date for a record written before the field. */
export function recordDate(task: Pick<Task, 'occurrence_date' | 'due'>): string | null {
  return task.occurrence_date ?? task.due?.date ?? null
}

/** True for an occurrence record of `seriesId`: it points at the series and has the id derived from its date. */
export function isRecordOf(seriesId: string, task: Task): boolean {
  if (task.series_id !== seriesId) return false
  const date = recordDate(task)
  return !!date && task.id === occurrenceId(seriesId, date)
}

/** True for any occurrence record (of whatever series). */
export function isOccurrenceRecord(task: Task): boolean {
  return !!task.series_id && isRecordOf(task.series_id, task)
}

/** An open occurrence record whose series is still repeating: deleting it is a skip (D3). */
export function skipsInstead(task: Task, byId: Map<string, Task>): boolean {
  return !task.completed_at && !task.deleted_at && isOccurrenceRecord(task) && !!seriesRule(byId.get(task.series_id as string))
}

export function recordState(task: Task): RecordState {
  if (!task.completed_at) return 'open'
  return task.skipped ? 'skipped' : 'done'
}

/**
 * The live occurrence records of a series. A trashed record is left out: the app
 * never trashes one (removing an occurrence is a skip, design D3), and an Undo of a
 * completion trashes the record it created so the date is free again.
 */
export function recordsOf(seriesId: string, tasks: Iterable<Task>): OccurrenceRecord[] {
  const out: OccurrenceRecord[] = []
  for (const task of tasks) {
    if (task.deleted_at || !isRecordOf(seriesId, task)) continue
    out.push({ task, date: recordDate(task) as string, state: recordState(task) })
  }
  return out
}

/** The exception dates of a series: the dates of its records, whatever their state (M4). */
export function exceptionDates(seriesId: string, tasks: Iterable<Task>): Set<string> {
  return new Set(recordsOf(seriesId, tasks).map((r) => r.date))
}

/**
 * What `for N times` has used (M6, D9): done and open records, never skipped ones,
 * leaving out the record of `exceptDate` (the occurrence being acted on), and the
 * series' exception dates.
 */
export function seriesBudget(seriesId: string, tasks: Iterable<Task>, exceptDate?: string): { taken: number; done: number; except: Set<string> } {
  let done = 0
  let open = 0
  const except = new Set<string>()
  for (const r of recordsOf(seriesId, tasks)) {
    except.add(r.date)
    if (r.date === exceptDate) continue
    if (r.state === 'done') done++
    else if (r.state === 'open') open++
  }
  return { taken: done + open, done, except }
}

/**
 * Completed occurrence records of a series, leaving out the one of `exceptDate`. The
 * `for N times` count converges with the records themselves, without a separate counter.
 */
export function completedOccurrences(seriesId: string, tasks: Iterable<Task>, exceptDate?: string): number {
  return seriesBudget(seriesId, tasks, exceptDate).done
}

// ---- dates ----

/** The series' due on another date, keeping its time and zone (absolute-datetimes, design D7). */
function moveDue(due: Due | null, date: string): Due {
  if (!due?.time) return { date }
  return due.tz ? { date, time: due.time, tz: due.tz } : { date, time: due.time }
}

/**
 * The series' dates on another occurrence: the due date moves to `next`, and a
 * deadline and start move by the same number of calendar days (OpenSpec change
 * deadlines, design D8). A series without a deadline writes no deadline field.
 */
export function moveDates(series: Task, next: string, today: string): Record<string, unknown> {
  const out: Record<string, unknown> = { due: moveDue(series.due, next) }
  if (series.deadline) out.deadline = shiftDate(series.deadline, occurrenceDate(series, today), next)
  // A start date moves the same way; evening stays on the series (someday-and-evening D8).
  if (series.start && series.start !== 'someday') out.start = shiftDate(series.start, occurrenceDate(series, today), next)
  return out
}

/** `date` moved by as many calendar days as from `from` to `to` (Go: recurrence.ShiftDate). */
export function shiftDate(date: string, from: string, to: string): string {
  return addDaysISO(date, daysBetweenISO(from, to))
}

/** Fields an occurrence record inherits from its series, on the occurrence date `date`. */
export function recordFields(series: Task, date: string, now: number, today: string): Record<string, unknown> {
  const dates = moveDates(series, date, today)
  return {
    title: series.title, description: series.description, project_id: series.project_id, parent_id: series.parent_id,
    priority: series.priority, labels: [...series.labels], position: series.position,
    created_at: now, deleted_at: null, estimate_minutes: series.estimate_minutes, recurrence: null, series_id: series.id,
    ...dates, occurrence_date: date, completed_at: null, skipped: false,
    // Same project, same column (board-view); only sent when set.
    ...(series.section_id ? { section_id: series.section_id } : {}),
    ...(series.start === 'someday' ? { start: series.start } : {}),
    ...(series.evening ? { evening: true } : {}),
    // The record keeps the part of the day (day-parts D2); only sent when set.
    ...(series.day_part ? { day_part: series.day_part } : {}),
    // And the energy (task-energy); only sent when set.
    ...(series.energy ? { energy: series.energy } : {}),
    ...(series.assignee_id ? { assignee_id: series.assignee_id } : {}),
    ...(series.location ? { location: series.location } : {}),
    // Custom field values, null included, as the server's record (custom-fields);
    // mutateMany writes one `fields.<id>` op each.
    ...(series.fields && Object.keys(series.fields).length ? { fields: { ...series.fields } } : {}),
  }
}

// ---- the current occurrence ----

/**
 * The occurrence the series stands on for acting: its due date, or, when another
 * device's record made that date an exception (M5), the next free date after it.
 * Null when no free date remains (the series is at its end).
 */
export function currentOccurrence(series: Task, rule: Rule, tasks: Iterable<Task>, today: string): string | null {
  const date = occurrenceDate(series, today)
  const { taken, except } = seriesBudget(series.id, tasks)
  if (!except.has(date) || rule.afterCompletion) return date
  // The series needs one occurrence the records have not used up.
  return nextFree(rule, date, today, today, taken - 1, except)
}

/** The series as it stands on `date` (its dates moved there when a late record moved it, M5). */
export function standOn(series: Task, date: string, today: string): Task {
  if (date === occurrenceDate(series, today)) return series
  return { ...series, ...(moveDates(series, date, today) as Partial<Task>) }
}

export type CompletionPlan =
  | { kind: 'roll'; changes: Change[]; recordId: string; next: string }
  | { kind: 'end' }

/**
 * Completing the series' current occurrence: create the occurrence record and move
 * the series to the next occurrence that is not an exception, or report that the
 * end condition is reached (the caller then completes the series like a plain task).
 */
export function planCompletion(series: Task, rule: Rule, tasks: Iterable<Task>, now: number, today: string): CompletionPlan {
  const list = [...tasks]
  const date = currentOccurrence(series, rule, list, today)
  if (date === null) return { kind: 'end' }
  const at = standOn(series, date, today)
  const { taken, except } = seriesBudget(series.id, list, date)
  const next = nextFree(rule, at.due?.date ?? null, today, today, taken, except)
  if (next === null) return { kind: 'end' }
  const recordId = occurrenceId(series.id, date)
  return {
    kind: 'roll', recordId, next,
    changes: [
      { entity: 'task', entityId: recordId, patch: { ...recordFields(at, date, now, today), completed_at: now } },
      { entity: 'task', entityId: series.id, patch: moveDates(at, next, today) },
    ],
  }
}

/** Skips never count towards `for N times` (a negative count never reaches the end). */
const UNCOUNTED = -1

/**
 * The occurrence after the current one for skip: calendar rules use the schedule
 * (so two devices skipping the same occurrence land on the same date), completion-
 * relative rules count from today; exception dates are jumped over. Null when it
 * would pass `until`.
 */
export function nextOnSkip(series: Task, rule: Rule, today: string, tasks: Iterable<Task> = []): string | null {
  const { except } = seriesBudget(series.id, tasks)
  return nextFree(rule, series.due?.date ?? null, today, today, UNCOUNTED, except)
}

/**
 * Skipping the current occurrence moves the series on. For a habit it also writes
 * the occurrence record (same derived id a completion writes) marked `skipped`, in
 * the same batch, so a skipped day is distinguishable from a missed one and two
 * devices skipping (or one completing, one skipping) converge to one record
 * (OpenSpec habits, design D2). A plain series writes only the due change (D3).
 */
export function planSkip(series: Task, rule: Rule, now: number, today: string, tasks: Iterable<Task> = []): Change[] | null {
  const list = [...tasks]
  const date = currentOccurrence(series, rule, list, today)
  if (date === null) return null
  const at = standOn(series, date, today)
  const next = nextOnSkip(at, rule, today, list)
  if (!next) return null
  const move: Change = { entity: 'task', entityId: series.id, patch: moveDates(at, next, today) }
  if (!series.habit) return [move]
  return [
    { entity: 'task', entityId: occurrenceId(series.id, date), patch: { ...recordFields(at, date, now, today), completed_at: now, skipped: true } },
    move,
  ]
}
