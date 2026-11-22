import { mutate } from './ops'
import type { UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'

export function completionSoundOn(row: Partial<UserPrefs> | null | undefined): boolean {
  return row?.completion_sound === 'on'
}

export function setCompletionSound(on: boolean): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { completion_sound: on ? 'on' : 'off' })
}
