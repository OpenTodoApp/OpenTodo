// Where a task added in the Inbox went when its line scheduled it (OpenSpec change
// inbox-means-unplaced, design D5; web-app "Standard views"): a scheduled task is
// not an Inbox task, so quick add says where it is instead of it silently not
// appearing. Pure: the caller shows the words and opens the view.
import { formatDate, formatDateHeading, localDueOf, type ResolvedDateTime } from '../lib/dates'
import { t } from '../lib/i18n'
import { isInboxTask } from '../lib/inbox'
import type { Task } from '../lib/types'
import { inToday } from '../lib/views'

export interface AddedWhere {
  label: string
  view: 'today' | 'upcoming' | 'someday'
}

/** What to announce for a task created in the Inbox, or null when it is listed there. */
export function addedWhere(task: Task, today: string, prefs: ResolvedDateTime): AddedWhere | null {
  if (isInboxTask(task) || task.project_id !== null) return null
  if (task.start === 'someday' && !task.due) return { label: t('Added to Someday'), view: 'someday' }
  if (inToday(task, today)) return { label: t('Added to Today'), view: 'today' }
  if (task.due) return { label: t('Added to {day}', { day: formatDateHeading(localDueOf(task.due).date, today, prefs) }), view: 'upcoming' }
  if (task.start) return { label: t('Added to Upcoming, starts {date}', { date: formatDate(task.start, 'compact', prefs) }), view: 'upcoming' }
  return null
}
