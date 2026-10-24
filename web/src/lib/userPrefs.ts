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

export const DEFAULT_PREFS: DateTimePrefs = {
  date_format: USER_PREFS_DEFAULTS.date_format, time_format: USER_PREFS_DEFAULTS.time_format, week_start: USER_PREFS_DEFAULTS.week_start,
}

/** The day starts the Settings panel offers (day-boundary D7): whole hours from midnight to 06:00. */
export const DAY_STARTS = ['00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00'] as const
export type DayStartPref = (typeof DAY_STARTS)[number]

/**
 * The stored day start as minutes after midnight (day-boundary D1): `HH:MM` from
 * 00:00 to 06:00, minutes allowed (a newer client may write `03:30`); an empty,
 * malformed or out-of-range value (`09:00`, `4am`) reads as 0, midnight. The row
 * itself is not changed.
 */
export function readDayStart(row: Partial<UserPrefs> | null | undefined): number {
  const m = /^(\d{2}):([0-5]\d)$/.exec(typeof row?.day_start === 'string' ? row.day_start : '')
  if (!m) return 0
  const minutes = Number(m[1]) * 60 + Number(m[2])
  return minutes <= 360 ? minutes : 0
}

/** Interface language values (app-localization D1): 'system' and the shipped language codes. */
export const LANGUAGES: readonly LanguagePref[] = ['system', 'en', 'de', 'fr', 'es', 'it', 'pt']

/** The stored interface language; a missing row or a code this build does not ship reads as 'system', without rewriting the row. */
export function readLanguage(row: Partial<UserPrefs> | null | undefined): LanguagePref {
  return pick(LANGUAGES, row?.language)
}

type SettablePrefs = DateTimePrefs & { language: LanguagePref; day_start: DayStartPref }

/** Changes one preference through the op log (offline-safe). */
export function setUserPref<K extends keyof SettablePrefs>(field: K, value: SettablePrefs[K]): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { [field]: value })
}

/** The first-run card (OpenSpec change ux-overhaul, first-run): shown until the account marks it done on any device. */
export function firstRunDone(row: Partial<UserPrefs> | null | undefined): boolean {
  return row?.first_run === 'done'
}

/** Marks the first run finished or skipped; an ordinary op, so it syncs to the account's other devices. */
export function setFirstRunDone(): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { first_run: 'done' })
}

/** The owner's welcome note (OpenSpec change welcome-note): shown until it is closed on any device. */
export function welcomeSeen(row: Partial<UserPrefs> | null | undefined): boolean {
  return row?.welcome === 'seen'
}

/** Marks the welcome note seen; an ordinary op, so it never shows again on the account's other devices. */
export function setWelcomeSeen(): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { welcome: 'seen' })
}

/** The first-day checklist (OpenSpec change moments-and-onboarding, D5): its sidebar entry was hidden on any device. */
export function startChecklistHidden(row: Partial<UserPrefs> | null | undefined): boolean {
  return row?.start_checklist === 'hidden'
}

/** Hides the first-day checklist's sidebar entry; an ordinary op, so no device of the account shows it again. */
export function hideStartChecklist(): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { start_checklist: 'hidden' })
}

/** The day pages' briefing (OpenSpec change briefing-links, D4): hidden on any device of the account. */
export function briefingHidden(row: Partial<UserPrefs> | null | undefined): boolean {
  return row?.briefing === 'hidden'
}

/** Shows or hides the briefing on Today and Upcoming; an ordinary op, so it syncs to the account's other devices. */
export function setBriefingShown(shown: boolean): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { briefing: shown ? 'shown' : 'hidden' })
}
