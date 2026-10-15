// The Month view's calendar math (OpenSpec `month-and-timeline-views`, design D1):
// pure functions over ISO dates and tasks; the view only renders them.
import { weekDates } from './calendar'
import { viewedTask } from './dates'
import type { Task } from './types'

/** Six weeks of seven ISO dates covering the month of `anchor`, starting on `weekStart` (0 = Sunday). */
export function monthGrid(anchor: string, weekStart = 1): string[][] {
  const first = `${anchor.slice(0, 7)}-01`
  let start = weekDates(first, weekStart)[0]
  const rows: string[][] = []
  for (let r = 0; r < 6; r++) {
    const week = weekDates(start, weekStart)
    rows.push(week)
    const [y, m, d] = week[6].split('-').map(Number)
    const next = new Date(y, m - 1, d + 1)
    start = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
  }
  return rows
}

/**
 * The tasks shown on `date`, by their due as seen in `zone` (a zoned due counts on
 * the viewer's day): timed ones first by time, then by priority (1 first), then by
 * position. Returns the stored tasks, so writes start from the original due.
 */
export function cellTasks<T extends Pick<Task, 'due' | 'priority' | 'position'>>(tasks: readonly T[], date: string, zone?: string): T[] {
  const out: { task: T; time: string | undefined }[] = []
  for (const task of tasks) {
    const due = viewedTask(task, zone).due
    if (due?.date === date) out.push({ task, time: due.time })
  }
  out.sort((a, b) => {
    if (!!a.time !== !!b.time) return a.time ? -1 : 1
    if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1
    if (a.task.priority !== b.task.priority) return a.task.priority - b.task.priority
    return a.task.position - b.task.position
  })
  return out.map((x) => x.task)
}

/** The rows a cell can show in `max` lines: all of them, or `max − 1` and a "+N more" count. */
export function visibleRows<T>(cell: readonly T[], max: number): { shown: T[]; hidden: number } {
  if (cell.length <= max) return { shown: [...cell], hidden: 0 }
  const keep = Math.max(0, max - 1)
  return { shown: cell.slice(0, keep), hidden: cell.length - keep }
}
