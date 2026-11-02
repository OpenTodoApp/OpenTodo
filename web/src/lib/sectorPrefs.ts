// The Time sectors switch (OpenSpec change time-sectors, design D7): the synced
// user_prefs.time_sectors, "on" or off. Off hides the controls that set a sector,
// never a sector a task already has.
import { db } from './db'
import { useUserPrefsRow } from './localData'
import { mutate } from './ops'
import { timeSectorsOn } from './sectorNames'
import { USER_PREFS_ID } from './userPrefs'

/** Turns Time sectors on or off for the account: one synced op, offline included. */
export function setTimeSectors(on: boolean): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { time_sectors: on ? 'on' : '' })
}

/** The account's switch read now (one keyed read), for code outside React (the bar's add). */
export async function timeSectorsPreferred(): Promise<boolean> {
  return timeSectorsOn(await db.userPrefs.get(USER_PREFS_ID))
}

/** The account's switch, live (off while loading). */
export function useTimeSectors(): boolean {
  return timeSectorsOn(useUserPrefsRow())
}
