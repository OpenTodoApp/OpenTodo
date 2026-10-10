// Recurring task flows (OpenSpec change recurring-tasks, design D5). Pure planning
// functions: given the series row and the local task set they return the field
// changes to write; ops.ts applies them in one mutateMany batch. Every value is a
// function of inputs all devices share (series id, rule, due date, occurrence date),
// so devices acting on the same occurrence offline write identical entities and
// converge under last-writer-wins without a coordinator.
import { detachedId, occurrenceId } from './ids'
import type { Change } from './ops'
import { followingOccurrence, nextAfterCompletion, nextCalendar, parseRule, type Rule } from './recurrence'
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

/**
 * Completed occurrence records of a series: live tasks pointing at it whose id is
 * the one derived from their own due date. Detached copies (different id scheme)
 * and reopened records (no completed_at) are not counted, so the `for N times`
 * count converges with the records themselves, without a separate counter.
 */
export function completedOccurrences(seriesId: string, tasks: Iterable<Task>, exceptDate?: string): number {
  let n = 0
  for (const t of tasks) {
    if (t.series_id !== seriesId || !t.completed_at || t.deleted_at || !t.due) continue
    if (t.due.date === exceptDate) continue
    if (t.id === occurrenceId(seriesId, t.due.date)) n++
  }
  return n
}

/** The series' due on another date, keeping its time and zone (absolute-datetimes, design D7). */
function moveDue(due: Due | null, date: string): Due {
  if (!due?.time) return { date }
  return due.tz ? { date, time: due.time, tz: due.tz } : { date, time: due.time }
}

/** Fields an occurrence copy inherits from its series. */
function copyOf(series: Task, now: number): Record<string, unknown> {
  return {
    title: series.title, description: series.description, project_id: series.project_id, parent_id: series.parent_id,
    priority: series.priority, due: series.due ?? null, labels: [...series.labels], position: series.position,
    created_at: now, deleted_at: null, estimate_minutes: series.estimate_minutes, recurrence: null, series_id: series.id,
  }
}

export type CompletionPlan =
  | { kind: 'roll'; changes: Change[]; recordId: string; next: string }
  | { kind: 'end' }

/**
 * Completing the series' current occurrence: create the occurrence record and move
 * the series to the next occurrence, or report that the end condition is reached
 * (the caller then completes the series like a plain task).
 */
export function planCompletion(series: Task, rule: Rule, tasks: Iterable<Task>, now: number, today: string): CompletionPlan {
  const date = occurrenceDate(series, today)
  const done = completedOccurrences(series.id, tasks, date)
  const next = followingOccurrence(rule, series.due?.date ?? null, today, today, done)
  if (next === null) return { kind: 'end' }
  const recordId = occurrenceId(series.id, date)
  return {
    kind: 'roll', recordId, next,
    changes: [
      { entity: 'task', entityId: recordId, patch: { ...copyOf(series, now), due: series.due ?? { date }, completed_at: now } },
      { entity: 'task', entityId: series.id, patch: { due: moveDue(series.due, next) } },
    ],
  }
}

/**
 * The occurrence after the current one for skip and detach: calendar rules use the
 * schedule (so two devices skipping the same occurrence land on the same date),
 * completion-relative rules count from today. Null when it would pass `until`.
 * Skips never count towards `for N times`.
 */
export function nextOnSkip(series: Task, rule: Rule, today: string): string | null {
  const next = rule.afterCompletion ? nextAfterCompletion(rule, today) : nextCalendar(rule, series.due?.date ?? null, today)
  return rule.until && next > rule.until ? null : next
}

export function planSkip(series: Task, rule: Rule, today: string): Change[] | null {
  const next = nextOnSkip(series, rule, today)
  return next ? [{ entity: 'task', entityId: series.id, patch: { due: moveDue(series.due, next) } }] : null
}

/** "This occurrence only": a standalone copy of the current occurrence, and the series moves on. */
export function planDetach(series: Task, rule: Rule, now: number, today: string): { changes: Change[]; copyId: string } | null {
  const next = nextOnSkip(series, rule, today)
  if (!next) return null
  const date = occurrenceDate(series, today)
  const copyId = detachedId(series.id, date)
  return {
    copyId,
    changes: [
      { entity: 'task', entityId: copyId, patch: { ...copyOf(series, now), due: series.due ?? { date }, completed_at: null } },
      { entity: 'task', entityId: series.id, patch: { due: moveDue(series.due, next) } },
    ],
  }
}
