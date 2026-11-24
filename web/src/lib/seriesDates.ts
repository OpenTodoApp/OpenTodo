// A series is never moved onto one of its own records (OpenSpec change
// series-move-onto-exception, #1971): the repair after the next pull would move it
// straight back (planRepair), so every date action checks first and says why
// instead of confirming a change that will be undone.
import { db } from './db'
import { formatDate, logicalToday } from './dates'
import { t } from './i18n'
import { lineageRows } from './lineageRows'
import type { Change } from './ops'
import { exceptionOn, moveDates, seriesRule } from './recurring'
import type { Due, Task } from './types'

/** The date a change moves a task's due to, when it changes it. */
const dueDateOf = (c: Change): string | null => {
  const due = (c.patch as { due?: Due | null }).due
  return c.entity === 'task' && due ? due.date : null
}

/** Why `task` may not be moved to `date`: the state of its record there, or null. */
function takenOn(task: Task | undefined, date: string | null, rows: Iterable<Task>) {
  if (!task || !date || !seriesRule(task) || task.due?.date === date) return null
  return exceptionOn(task, date, rows)
}

/** The reason a series may not be moved to `due`, for the toast; null when the date is free or the task is not a series. */
export async function seriesDateRefusal(id: string, due: Due | null | undefined): Promise<string | null> {
  if (!due) return null
  const task = await db.tasks.get(id)
  if (!task || !seriesRule(task) || task.due?.date === due.date) return null
  const state = takenOn(task, due.date, await lineageRows(id))
  if (!state) return null
  const date = formatDate(due.date, 'long')
  if (state === 'done') return t('{date}: already done', { date })
  return state === 'skipped' ? t('{date} was skipped', { date }) : t('{date} was moved', { date })
}

/**
 * The changes of a several-task date action without those that would put a series
 * on one of its records (`all`: the live tasks), and how many were dropped.
 */
export function refusedSeries(changes: readonly Change[], all: readonly Task[]): { changes: Change[]; refused: number } {
  const byId = new Map(all.map((tk) => [tk.id, tk]))
  const kept = changes.filter((c) => !takenOn(byId.get(c.entityId), dueDateOf(c), all))
  return { changes: kept, refused: changes.length - kept.length }
}

/** A toast label with "n not moved" after it when the filter dropped some. */
export function withNotMoved(label: string, refused: number): string {
  if (!refused) return label
  const note = t('{n} not moved', { n: refused })
  return label ? `${label} · ${note}` : note
}

/** A series' new due with its start and deadline moved by the same days, as the series moves on; other tasks get the due alone. */
export function duePatch(task: Task | undefined, due: Due | null, today = logicalToday()): Record<string, unknown> {
  if (!task || !due || !seriesRule(task) || !task.due || task.due.date === due.date) return { due }
  return { ...moveDates(task, due.date, today), due }
}
