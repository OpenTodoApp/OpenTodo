// The synced preferences of the Inbox card of routines (OpenSpec change
// routines-editor, design D10): the seen marker and Hide successful runs.
// Small on purpose: Settings, which loads with the shell, reads it.
import { mutate } from '../ops'
import type { UserPrefs } from '../types'

export const PREFS_ID = 'me'

export const seenMarkerOf = (row: Partial<UserPrefs> | null | undefined): number => {
  const v = row?.routines_seen_at
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

/** Hide successful runs: "on"; an empty or unknown value reads as off. */
export const hidesSuccesses = (row: Partial<UserPrefs> | null | undefined): boolean => row?.routines_hide_successes === 'on'

/** Turns Hide successful runs on or off for the account: one synced op, offline included. */
export function setHideSuccesses(on: boolean): Promise<void> {
  return mutate('user_prefs', PREFS_ID, { routines_hide_successes: on ? 'on' : '' })
}
