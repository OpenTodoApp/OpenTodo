// The project timeline's math (OpenSpec `month-and-timeline-views`, design D5, D6):
// pure functions from tasks to bars, axis columns, date shifts and dependency edges.
import { addDaysISO, daysBetweenISO, dueFromView, localDueOf } from './dates'
import type { Task } from './types'

export interface Span {
  from: string
  to: string
  /** The due day as seen in the viewer's zone, when the task has a due. */
  dueAt?: string
  deadlineAt?: string
  /** The deadline lies before today (the overdue tone). */
  late: boolean
}

type Dated = Pick<Task, 'due'> & { start?: string | null; deadline?: string | null }

/** A task's bar: earliest to latest of start, due (viewer's zone) and deadline; null for none or a `someday` start. */
export function spanOf(task: Dated, today: string, zone?: string): Span | null {
  const start = task.start ?? null
  if (start === 'someday') return null
  const due = task.due ? localDueOf(task.due, zone).date : undefined
  const deadline = task.deadline ?? undefined
  const dates = [start, due, deadline].filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  if (!dates.length) return null
  return { from: dates[0], to: dates[dates.length - 1], dueAt: due, deadlineAt: deadline, late: !!deadline && deadline < today }
}

export type Zoom = 'day' | 'week'

/** Pixels per day at each zoom. */
export const PX_PER_DAY: Record<Zoom, number> = { day: 32, week: 8 }

/** The visible window (design D6): anchor − 4 weeks … anchor + 12 weeks. */
export const WINDOW_BEFORE_DAYS = 28
export const WINDOW_AFTER_DAYS = 84

/**
 * The axis columns around `anchor`: one ISO date per day, or the first day of each
 * week (starting on `weekStart`, 0 = Sunday) at week zoom.
 */
export function axis(anchor: string, zoom: Zoom, weekStart = 1): { columns: string[]; from: string; to: string; pxPerDay: number } {
  let from = addDaysISO(anchor, -WINDOW_BEFORE_DAYS)
  const to = addDaysISO(anchor, WINDOW_AFTER_DAYS)
  if (zoom === 'week') {
    const [y, m, d] = from.split('-').map(Number)
    from = addDaysISO(from, -((new Date(y, m - 1, d).getDay() - weekStart + 7) % 7))
  }
  const step = zoom === 'week' ? 7 : 1
  const columns: string[] = []
  for (let c = from; c <= to; c = addDaysISO(c, step)) columns.push(c)
  return { columns, from, to, pxPerDay: PX_PER_DAY[zoom] }
}

/** Offset in days of `iso` from the axis start (may be negative or past the end). */
export function dayOffset(from: string, iso: string): number {
  return daysBetweenISO(from, iso)
}

/**
 * The patch that moves a task's dates by `days`: start, due and deadline, each only
 * when present. The due keeps its time and zone (dueFromView on the viewed date).
 */
export function shiftDates(task: Dated, days: number, zone?: string): Partial<Pick<Task, 'due' | 'start' | 'deadline'>> {
  const patch: Partial<Pick<Task, 'due' | 'start' | 'deadline'>> = {}
  if (!days) return patch
  if (task.start && task.start !== 'someday') patch.start = addDaysISO(task.start, days)
  if (task.due) {
    const view = localDueOf(task.due, zone)
    patch.due = dueFromView(task.due, { ...view, date: addDaysISO(view.date, days) }, zone)
  }
  if (task.deadline) patch.deadline = addDaysISO(task.deadline, days)
  return patch
}

/**
 * Dependency arrows among the rows: one per open row blocked by another open row
 * of the same list. Blockers outside the rows, completed or deleted are left out.
 */
export function edges(rows: readonly Pick<Task, 'id' | 'blocked_by' | 'completed_at' | 'deleted_at'>[]): { from: string; to: string }[] {
  const open = new Map(rows.filter((r) => !r.completed_at && !r.deleted_at).map((r) => [r.id, r]))
  const out: { from: string; to: string }[] = []
  for (const r of open.values()) {
    for (const id of r.blocked_by ?? []) if (id !== r.id && open.has(id)) out.push({ from: id, to: r.id })
  }
  return out
}
