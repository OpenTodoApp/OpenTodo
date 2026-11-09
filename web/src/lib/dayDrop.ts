// A task dropped on another day in Upcoming (OpenSpec change upcoming-drag): the
// same rule as a drop on a day of the calendar. The do-on date moves to that day and
// keeps its time and zone; a span moves whole; the deadline never moves. A task
// Upcoming lists by its start (deferred, without a project or a date) keeps being
// deferred, to the new day. Pure: the caller reads the rows and records the batch.
import { daysBetweenISO, dueFromView, viewedTask } from './dates'
import type { Change } from './ops'
import { moveSpanPatch, spanOf } from './span'
import type { Task } from './types'
import { deferredUnplaced } from './views'

/** The patch that puts one task on `date`, or null when it is already there or cannot move. */
export function dayDropPatch(task: Task, date: string, today: string, zone?: string): Partial<Task> | null {
  if (task.deleted_at || task.completed_at) return null
  const viewed = viewedTask(task, zone)
  const span = spanOf(viewed)
  if (span) {
    const whole = span.first === date ? null : moveSpanPatch(viewed, daysBetweenISO(span.first, date))
    return whole ? { start: whole.start, due: dueFromView(task.due, whole.due, zone) } : null
  }
  if (viewed.due) {
    if (viewed.due.date === date) return null
    return { due: dueFromView(task.due, { date, ...(viewed.due.time ? { time: viewed.due.time } : {}) }, zone) }
  }
  // Listed by its start: still deferred, to the new day; on today it becomes due today.
  if (deferredUnplaced(task, today)) {
    if (task.start === date) return null
    return date > today ? { start: date } : { start: null, due: { date } }
  }
  // Listed by its deadline (or not dated at all): the drop plans it for that day, the deadline stays.
  return { due: { date } }
}

/** One change per task that moves; tasks already on that day write nothing. */
export function planDayDrop(tasks: readonly Task[], date: string, today: string, zone?: string): Change[] {
  return tasks.flatMap((task): Change[] => {
    const patch = dayDropPatch(task, date, today, zone)
    return patch ? [{ entity: 'task', entityId: task.id, patch }] : []
  })
}
