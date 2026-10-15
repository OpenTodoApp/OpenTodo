// The user's date and time preferences (OpenSpec `date-time-preferences`, design D1):
// one synced `user_prefs` row with the id "me" in the personal scope. Written
// through ops like any other data, so a change works offline, reaches the user's
// other devices and converges per field by last-writer-wins.
import { mutate, USER_PREFS_DEFAULTS } from './ops'
import type { DateFormatPref, LanguagePref, TimeFormatPref, UserPrefs, WeekStartPref } from './types'

export const USER_PREFS_ID = 'me'

export const DATE_FORMATS: readonly DateFormatPref[] = ['system', 'day-month', 'month-day', 'iso']
export const TIME_FORMATS: readonly TimeFormatPref[] = ['system', '12h', '24h']
export const WEEK_STARTS: readonly WeekStartPref[] = ['system', 'mon', 'sun', 'sat']
/** Every language value a client may store (app-localization D1); offered ones are the shipped catalogs. */
export const LANGUAGES: readonly LanguagePref[] = ['system', 'en', 'de', 'fr', 'es', 'it', 'pt']

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

/** The stored interface language; a missing row or an unknown code (a catalog this client lacks) means 'system'. */
export function readLanguage(row: Partial<UserPrefs> | null | undefined): LanguagePref {
  return pick(LANGUAGES, row?.language)
}

export const DEFAULT_PREFS: DateTimePrefs = {
  date_format: USER_PREFS_DEFAULTS.date_format, time_format: USER_PREFS_DEFAULTS.time_format, week_start: USER_PREFS_DEFAULTS.week_start,
}

type SettablePrefs = DateTimePrefs & Pick<UserPrefs, 'language'>

/** Changes one preference through the op log (offline-safe). */
export function setUserPref<K extends keyof SettablePrefs>(field: K, value: SettablePrefs[K]): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { [field]: value })
}
