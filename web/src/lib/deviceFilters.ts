// The query filters of the Calendar and of Upcoming (OpenSpec change calendar-clarity,
// design D4): one query each, in this device's meta, never synced.
import { setMeta } from './db'

/** Device meta keys: one filter for the Calendar's four modes, one for Upcoming. */
export const CALENDAR_FILTER_KEY = 'calendar.filter'
export const UPCOMING_FILTER_KEY = 'upcoming.filter'

/** Stores the query under `key`; an empty one turns the filter off. */
export async function saveQueryFilter(key: string, query: string): Promise<void> {
  await setMeta(key, query.trim())
}
