// The Completed view as a logbook (OpenSpec change `completed-date-filters`,
// design D4): completions newest first, grouped by the local day they happened,
// rendered a page at a time. Pure; the view passes the viewer's `today`.
import { addDaysISO, currentDateTime, formatDate, todayISO, type ResolvedDateTime } from './dates'
import type { Task } from './types'
import { t } from './i18n'

/** Completions rendered at first and added by each "Show more". */
export const LOGBOOK_PAGE = 100

export interface LogbookGroup {
  /** The local completion day, YYYY-MM-DD. */
  date: string
  tasks: Task[]
}

/** "Today", "Yesterday", then the weekday and date, with the year outside the current year. */
export function logbookHeading(date: string, today: string, p: ResolvedDateTime = currentDateTime()): string {
  if (date === today) return t('Today')
  if (date === addDaysISO(today, -1)) return t('Yesterday')
  return formatDate(date, date.slice(0, 4) === today.slice(0, 4) ? 'heading' : 'long', p, today)
}

/**
 * The first `limit` completed tasks, newest first, grouped by local completion day
 * (days newest first). `total` counts every completed, live task given.
 */
export function logbookGroups(tasks: readonly Task[], limit: number): { groups: LogbookGroup[]; total: number } {
  const done = tasks.filter((task) => task.completed_at !== null && !task.deleted_at)
    .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const groups: LogbookGroup[] = []
  for (const tk of done.slice(0, Math.max(0, limit))) {
    const date = todayISO(new Date(tk.completed_at!))
    const last = groups[groups.length - 1]
    if (last && last.date === date) last.tasks.push(tk)
    else groups.push({ date, tasks: [tk] })
  }
  return { groups, total: done.length }
}
