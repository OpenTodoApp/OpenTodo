// Where focus came from (OpenSpec change touch-no-tooltips): a key or a press. A tap
// focuses the button it lands on only after the finger has lifted (pointerdown,
// pointerup, then the browser's mousedown and the focus), so a control cannot tell
// a tap's focus from Tab's by watching its own pointer events. The page remembers
// the last input instead: focus that follows a key press is keyboard focus, focus
// that follows a press of a finger, a mouse or a pen is not. Nothing is stored.
import { fromHardwareKeyboard } from './keyboardSeen'
import { resettable } from './moduleState'

let last: 'key' | 'press' | null = null
resettable('focusSource', () => { last = null })

const coarse = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

/**
 * A key press that can move focus as a keyboard does. On a touch-first device only a
 * press an on-screen keyboard cannot make counts, so Enter in a field does not turn
 * the focus that follows into keyboard focus.
 */
export function keyPress(e: KeyboardEvent, touchFirst: boolean): boolean {
  return !touchFirst || fromHardwareKeyboard(e)
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => { if (keyPress(e, coarse())) last = 'key' }, true)
  document.addEventListener('pointerdown', () => { last = 'press' }, true)
}

/** True when focus arriving now was moved by a key, or by the page before any press. */
export function focusFromKeyboard(): boolean {
  return last !== 'press'
}
