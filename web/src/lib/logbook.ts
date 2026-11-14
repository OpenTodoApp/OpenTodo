// The Completed view as a logbook (OpenSpec change `completed-date-filters`,
// design D4): completions newest first, grouped by the local day they happened,
// rendered a page at a time; or grouped by project (completed-view-review D2).
// Pure; the view passes the viewer's `today`.
import { addDaysISO, currentDateTime, currentDayStart, formatDate, logicalDay, type ResolvedDateTime } from './dates'
import type { Task } from './types'
import { t } from './i18n'

/** Completions rendered at first and added by each "Show more". */
export const LOGBOOK_PAGE = 100

export interface LogbookGroup {
  /** The local completion day, YYYY-MM-DD (by project: the group's newest completion day). */
  date: string
  /** Grouped by project (completed-view-review D2): the project's id, null for the Inbox; absent by day. */
  project?: string | null
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
export function logbookGroups(tasks: readonly Task[], limit: number, by: 'day' | 'project' = 'day'): { groups: LogbookGroup[]; total: number } {
  const done = tasks.filter((task) => task.completed_at !== null && !task.deleted_at)
    .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const groups: LogbookGroup[] = []
  const shown = done.slice(0, Math.max(0, limit))
  if (by === 'project') {
    // One group per project, in the order of each project's newest completion (D2).
    const byProject = new Map<string, LogbookGroup>()
    for (const tk of shown) {
      const key = tk.project_id ?? ''
      const g = byProject.get(key)
      if (g) g.tasks.push(tk)
      else {
        const group = { date: logicalDay(tk.completed_at!, currentDayStart()), project: tk.project_id ?? null, tasks: [tk] }
        byProject.set(key, group)
        groups.push(group)
      }
    }
    return { groups, total: done.length }
  }
  for (const tk of shown) {
    const date = logicalDay(tk.completed_at!, currentDayStart())
    const last = groups[groups.length - 1]
    if (last && last.date === date) last.tasks.push(tk)
    else groups.push({ date, tasks: [tk] })
  }
  return { groups, total: done.length }
}
