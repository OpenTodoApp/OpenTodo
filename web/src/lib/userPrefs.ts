// The user's date and time preferences (OpenSpec `date-time-preferences`, design D1):
// one synced `user_prefs` row with the id "me" in the personal scope. Written
// through ops like any other data, so a change works offline, reaches the user's
// other devices and converges per field by last-writer-wins.
import { mutate, USER_PREFS_DEFAULTS } from './ops'
import type { DateFormatPref, TimeFormatPref, UserPrefs, WeekStartPref } from './types'

export const USER_PREFS_ID = 'me'

export const DATE_FORMATS: readonly DateFormatPref[] = ['system', 'day-month', 'month-day', 'iso']
export const TIME_FORMATS: readonly TimeFormatPref[] = ['system', '12h', '24h']
export const WEEK_STARTS: readonly WeekStartPref[] = ['system', 'mon', 'sun', 'sat']

export type DateTimePrefs = Pick<UserPrefs, 'date_format' | 'time_format' | 'week_start'>

const pick = <T extends string>(allowed: readonly T[], v: unknown): T => (allowed.includes(v as T) ? (v as T) : ('system' as T))

/** Reads a stored row; a missing row or an unknown value (from a newer client) means 'system'. The row itself is not changed. */
export function readUserPrefs(row: Partial<UserPrefs> | null | undefined): DateTimePrefs {
  return {
    date_format: pick(DATE_FORMATS, row?.date_format),
    time_format: pick(TIME_FORMATS, row?.time_format),
    week_start: pick(WEEK_STARTS, row?.week_start),
  }
}

export const DEFAULT_PREFS: DateTimePrefs = { ...USER_PREFS_DEFAULTS }

/** Changes one preference through the op log (offline-safe). */
export function setUserPref<K extends keyof DateTimePrefs>(field: K, value: DateTimePrefs[K]): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { [field]: value })
}
