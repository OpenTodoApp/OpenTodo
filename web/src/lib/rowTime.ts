// The time column of task lists (OpenSpec change rows-v2, task-list-presentation
// "Time column", design D2 and D3). A row's column holds the one value that places
// the task in the day: its due time, else (no due time) the part of the day as its icon
// (sidebar-brand-and-row-grid D4), else its deadline countdown, else nothing. Whether a list shows the column at all is one fact of the whole list,
// computed once where the list is built, so titles align and the column never
// flickers row by row. Presentation only: it reads the tasks' own fields.
import type { Task } from './types'

type ColumnFields = Pick<Task, 'due' | 'deadline' | 'completed_at'> & Partial<Pick<Task, 'evening' | 'day_part'>>

/** Whether the task has a value for the column: a due time, or, while open, a part of the day or a deadline. */
export function hasColumnValue(task: ColumnFields): boolean {
  if (task.due?.time) return true
  return !task.completed_at && (!!task.deadline || !!task.evening || task.day_part === 'morning' || task.day_part === 'afternoon')
}

/**
 * Whether a list shows the column: at least one of its visible rows has a value for
 * it. `slotted` adds the tasks a calendar slot holds, which show the slot's start
 * (calendar-slots D8).
 */
export function hasTimeColumn<T extends ColumnFields>(tasks: Iterable<T>, slotted?: (task: T) => boolean): boolean {
  for (const task of tasks) if (hasColumnValue(task) || (slotted && !task.completed_at && slotted(task))) return true
  return false
}

/**
 * The column's width for the user's time format: the widest value it can hold in
 * tabular figures at the metadata size ("23:59" or "12:00 PM"; the deadline
 * countdown "12d over" fits in either). Applied once, as `--row-time-w`.
 */
export function rowTimeWidth(hour12: boolean): string {
  return hour12 ? '4.75rem' : '3.25rem'
}
