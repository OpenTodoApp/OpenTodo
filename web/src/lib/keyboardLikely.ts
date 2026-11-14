// "Can a key be pressed here?" (OpenSpec changes touch-keyboard-hints, touch-sheet-focus).
// One definition for the stylesheet and for scripts: a device has no keyboard-like input
// when none of its pointers is fine and none can hover (a phone, a tablet), and no
// hardware key press was seen since the page started (keyboardSeen.ts sets the mark).
// The stylesheet hides shortcut hints on that answer; overlays keep the on-screen
// keyboard down on it. Where the question cannot be asked the answer is "a keyboard".

/** The mark on the root element once a hardware key was pressed. */
export const KEYBOARD_ATTR = 'data-keyboard'

/**
 * A mouse, a trackpad or anything that hovers: the stylesheet's
 * `not ((any-pointer: fine) or (any-hover: hover))`, written as a list so a browser
 * without the `or` syntax still answers.
 */
export const KEYBOARD_LIKELY = '(any-pointer: fine), (any-hover: hover)'

/** True on a device with only touch input on which no hardware key was pressed yet. */
export function touchOnly(win: Pick<Window, 'matchMedia' | 'document'> | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  if (!win || typeof win.matchMedia !== 'function') return false
  return !win.matchMedia(KEYBOARD_LIKELY).matches && !win.document.documentElement.hasAttribute(KEYBOARD_ATTR)
}

const NO_KEYBOARD = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'])

/** Whether focusing `el` brings the on-screen keyboard (or a native picker) up: a text field, not a button or a switch. */
export function raisesKeyboard(el: Element | null | undefined): boolean {
  if (!el) return false
  if (el.tagName === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true') return true
  return el.tagName === 'INPUT' && !NO_KEYBOARD.has((el.getAttribute('type') ?? 'text').toLowerCase())
}
