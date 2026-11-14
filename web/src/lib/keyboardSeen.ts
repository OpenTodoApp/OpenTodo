// Keyboard hints only where a key can be pressed (OpenSpec change touch-keyboard-hints).
// The stylesheet hides shortcut chips and keyboard-only hint lines on a device whose
// pointers are all coarse and cannot hover (a phone, a tablet). CSS has no question for
// "is a keyboard attached", so a tablet with a keyboard but no trackpad is told apart
// here: the first key press only a hardware keyboard can make marks the page, and the
// hints show from then on. Nothing is stored; the next start asks again.

/** The mark on the root element the stylesheet reads. */
export const KEYBOARD_ATTR = 'data-keyboard'

const ALWAYS = new Set(['Tab', 'Escape'])

type Press = Pick<KeyboardEvent, 'isTrusted' | 'key' | 'keyCode' | 'isComposing' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && typeof el.tagName === 'string' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || !!el.isContentEditable)
}

/**
 * A key press that an on-screen keyboard cannot make: one outside a text field (the
 * on-screen keyboard is only up while a field has focus), a chord with Ctrl, Alt or
 * Meta, or Tab or Escape. Composition events and presses made by scripts never count.
 */
export function fromHardwareKeyboard(e: Press): boolean {
  if (!e.isTrusted || e.isComposing || e.keyCode === 229 || e.key === 'Unidentified') return false
  return ALWAYS.has(e.key) || e.ctrlKey || e.metaKey || e.altKey || !typing(e.target)
}

/** Marks the page at the first hardware key press, then stops listening. */
export function watchHardwareKeyboard(doc: Document = document): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (!fromHardwareKeyboard(e)) return
    doc.documentElement.setAttribute(KEYBOARD_ATTR, '')
    stop()
  }
  const stop = () => doc.removeEventListener('keydown', onKey, true)
  doc.addEventListener('keydown', onKey, true)
  return stop
}
