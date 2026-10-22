// The haptics preference (OpenSpec change motion-v2, appearance-preferences "Haptic
// feedback preference", design D6): an additive `user_prefs.haptics` field, "on" or
// "off", synced and editable offline. Anything but "off" reads as on, and an unknown
// value from a newer client is kept as stored.
import { liveQuery } from 'dexie'
import { db } from './db'
import { mutate } from './ops'
import type { UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'

export function hapticsPrefOn(row: Partial<UserPrefs> | null | undefined): boolean {
  return row?.haptics !== 'off'
}

/** Turns the tick on or off on every device of this user. */
export function setHapticsPref(on: boolean): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { haptics: on ? 'on' : 'off' })
}

export async function readHapticsPref(): Promise<boolean> {
  return hapticsPrefOn(await db.userPrefs.get(USER_PREFS_ID))
}

/** Follows the preference as it changes here or arrives from another device. */
export function watchHapticsPref(onChange: (on: boolean) => void): () => void {
  const sub = liveQuery(() => db.userPrefs.get(USER_PREFS_ID)).subscribe({ next: (row) => onChange(hapticsPrefOn(row)), error: () => {} })
  return () => sub.unsubscribe()
}
