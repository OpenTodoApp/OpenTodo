// The query filters of the Calendar, of Upcoming (OpenSpec change calendar-clarity,
// design D4) and of each project (project-query-filter D1): one query each, in this
// device's meta, never synced.
import { setMeta } from './db'

/** Device meta keys: one filter for the Calendar's four modes, one for Upcoming. */
export const CALENDAR_FILTER_KEY = 'calendar.filter'
export const UPCOMING_FILTER_KEY = 'upcoming.filter'

/** The device meta key of one project's filter, in every layout of its page. */
export const projectFilterKey = (projectId: string): string => `project.filter.${projectId}`

/** Stores the query under `key`; an empty one turns the filter off. */
export async function saveQueryFilter(key: string, query: string): Promise<void> {
  await setMeta(key, query.trim())
}
