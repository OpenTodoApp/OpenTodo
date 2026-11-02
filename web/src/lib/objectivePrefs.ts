// The Objectives switch (OpenSpec change plan-objectives, design D8): the synced
// user_prefs.objectives, "on" or off ('' and any unknown value). Off hides the
// Plan's strip and the review's section; objectives themselves are kept.
import { useUserPrefsRow } from './localData'
import { mutate } from './ops'
import type { UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'

/** Whether the switch is on; '', a missing field and an unknown value read as off. */
export function objectivesOn(prefs: Partial<Pick<UserPrefs, 'objectives'>> | null | undefined): boolean {
  return prefs?.objectives === 'on'
}

/** Turns Objectives on or off for the account: one synced op, offline included. */
export function setObjectivesOn(on: boolean): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { objectives: on ? 'on' : '' })
}

/** The account's switch, live (off while loading). */
export function useObjectivesOn(): boolean {
  return objectivesOn(useUserPrefsRow())
}
