// The Long end-of-session alert (OpenSpec change focus-end-alert, design D2): the
// generated tone of tone.ts, louder, once a second until the person clicks, taps
// or presses a key, the page is hidden, or ten repeats have played. Each repeat
// also vibrates where the device can and haptics are on. Loaded with import()
// only when a Long end plays, so it stays out of the first load.
import { readHapticsPref } from '../haptics'
import { resettable } from '../moduleState'
import { playTone } from './tone'

/** Time between repeats, and how many play at most (about ten seconds). */
export const REPEAT_MS = 1000
export const REPEATS = 10
/** The Long tone's peak gain (Short plays at 0.2). */
export const LONG_PEAK = 0.5
const VIBRATION = [200, 100, 200]

let stop: (() => void) | null = null

const vibrate = (pattern: number | number[]) => {
  try { navigator.vibrate(pattern) } catch { /* not allowed now */ }
}

/** Starts the alert, replacing one already playing. */
export async function startAlert(): Promise<void> {
  const buzz = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && (await readHapticsPref().catch(() => false))
  stopAlert()
  let played = 0
  const ring = () => {
    played++
    void playTone(LONG_PEAK)
    if (buzz) vibrate(VIBRATION)
    if (played >= REPEATS) end(false)
  }
  const onHidden = () => { if (document.visibilityState === 'hidden') dismiss() }
  const timer = setInterval(ring, REPEAT_MS)
  // The last repeat lets its vibration finish; a dismissal cancels it.
  const end = (cancelBuzz: boolean) => {
    clearInterval(timer)
    window.removeEventListener('pointerdown', dismiss, true)
    window.removeEventListener('keydown', dismiss, true)
    document.removeEventListener('visibilitychange', onHidden)
    if (buzz && cancelBuzz) vibrate(0)
    if (stop === dismiss) stop = null
  }
  const dismiss = () => end(true)
  stop = dismiss
  window.addEventListener('pointerdown', dismiss, true)
  window.addEventListener('keydown', dismiss, true)
  document.addEventListener('visibilitychange', onHidden)
  ring()
}

/** Stops the alert, if one is playing. */
export function stopAlert(): void {
  stop?.()
}

/** Whether an alert is playing. */
export function alertPlaying(): boolean {
  return stop !== null
}

resettable('focusAlert', stopAlert)
