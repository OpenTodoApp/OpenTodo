// The haptics preference (OpenSpec change motion-v2, appearance-preferences "Haptic
// feedback preference", design D6): an additive `user_prefs.haptics` field, "on" or
// "off", synced and editable offline. Anything but "off" reads as on, and an unknown
// value from a newer client is kept as stored.
import { liveQuery } from 'dexie'
import { db } from './db'
import { resettable } from './moduleState'
import { mutate } from './ops'
import { has, shellHaptic, type ShellHaptic } from './shell'
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

// ---- the player (motion-v2 D6, haptic-kinds D1) ----

let hapticsOn: boolean | null = null
let watching = false

function watchHaptics(): void {
  if (watching) return
  watching = true
  watchHapticsPref((on) => { hapticsOn = on })
}

const browserVibrates = () => typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function'

/** Whether this device can give feedback at all: a shell with `haptics`, or a browser that vibrates (the Appearance switch shows only then). */
export function canVibrate(): boolean {
  return has('haptics') || browserVibrates()
}

/** The shell's own feedback for the kind (shell-repairs D5), else the browser's 10 ms vibration. */
function play(kind: ShellHaptic): void {
  if (!shellHaptic(kind) && browserVibrates()) navigator.vibrate(10)
}

/**
 * Plays a kind of feedback unless haptics are off (haptic-kinds D1: the page names a
 * meaning, the shell picks the platform's feedback, and a shell that does not know the
 * kind plays `tick`).
 */
export function playHaptic(kind: ShellHaptic): void {
  if (!canVibrate()) return
  watchHaptics()
  if (hapticsOn === null) {
    void readHapticsPref().then((on) => { hapticsOn = on; if (on) play(kind) }, () => {})
    return
  }
  if (hapticsOn) play(kind)
}

/** Tests: forget the cached preference. */
export function resetHaptics(): void {
  hapticsOn = null
}
resettable('haptics', resetHaptics)
