// Deadlines as dates (OpenSpec change deadline-dates): `user_prefs.deadline_dates` "on"
// makes task rows show a deadline as its date ("Nov 28") instead of the countdown
// ("5d"), in the same tone. Synced like full titles. Read-time fallback: "" or an unknown
// value reads as off and is never rewritten.
import { useUserPrefsRow } from './localData'
import { mutate } from './ops'
import type { UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'

/** Whether the account shows deadlines as dates; a missing row or an unknown value is off. */
export function deadlineDatesOn(row: Pick<UserPrefs, 'deadline_dates'> | null | undefined): boolean {
  return row?.deadline_dates === 'on'
}

/** The account's choice, live. */
export function useDeadlineDates(): boolean {
  return deadlineDatesOn(useUserPrefsRow())
}

/** Turns deadlines as dates on or off as one synced op; works offline. Off is stored as "". */
export function setDeadlineDates(on: boolean): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { deadline_dates: on ? 'on' : '' })
}
