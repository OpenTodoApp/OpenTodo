// Moving a task to another day (OpenSpec change upcoming-drag-day): the one rule the
// calendar's Month and Plan drops and Upcoming's drops and keys share. Pure, so both
// surfaces behave the same and the rule is tested without a browser.
import { addDaysISO, daysBetweenISO, dueFromView, localDueOf } from './dates'
import { moveSpanPatch, spanOf } from './span'
import type { Task } from './types'
import { deferredUnplaced, upcomingDate } from './views'

/** The date field that places a task on its day. */
export type DayField = 'due' | 'start' | 'deadline'

export type DayPatch = Pick<Partial<Task>, 'due' | 'start' | 'deadline'>

type Movable = Pick<Task, 'due' | 'start' | 'span' | 'deadline' | 'completed_at'>

/**
 * The patch that moves `task` (its stored row) to the day `to`, or null when nothing
 * changes. A span shown from `from` moves whole, start and due by the same days. By
 * default the due date moves: same time, same zone (a zoned due is read and written
 * in the viewer's zone); a task without one gets a date-only due. `field` names
 * another date that placed the task on its day, so that one moves instead.
 * A completed task never moves.
 */
export function dayMovePatch(task: Movable, to: string, opts: { from?: string; field?: DayField; zone?: string } = {}): DayPatch | null {
  if (task.completed_at) return null
  if (opts.from !== undefined && spanOf(task)) {
    const days = daysBetweenISO(opts.from, to)
    return days === 0 ? null : moveSpanPatch(task, days)
  }
  const field = opts.field ?? 'due'
  if (field === 'start') return task.start === to ? null : { start: to }
  if (field === 'deadline') return task.deadline === to ? null : { deadline: to }
  const shown = task.due ? localDueOf(task.due, opts.zone) : null
  if (shown?.date === to) return null
  return { due: dueFromView(task.due, { date: to, ...(shown?.time ? { time: shown.time } : {}) }, opts.zone) }
}

type Listed = Movable & Pick<Task, 'project_id'>

/**
 * The date that lists a task under its day in Upcoming (`upcomingDate`) and so moves
 * with a drop: a span's first day, the due date, a deferred task's start, else the
 * deadline. A task with none of them (a started task in Start with Today) gets a due.
 */
export function upcomingMovePatch(task: Listed, to: string, today: string, zone?: string): DayPatch | null {
  const from = upcomingDate(task, today) ?? undefined
  const field: DayField = task.due || spanOf(task) ? 'due' : deferredUnplaced(task, today) ? 'start' : task.deadline ? 'deadline' : 'due'
  return dayMovePatch(task, to, { from, field, zone })
}

/**
 * The day a key step moves a task listed under `listed` to in Upcoming: one day
 * earlier or later, never before today (a task from an earlier day steps from today).
 * Null when the step would land before today.
 */
export function upcomingStep(listed: string | null, today: string, dir: 1 | -1): string | null {
  const from = listed && listed > today ? listed : today
  const next = addDaysISO(from, dir)
  return next < today ? null : next
}
