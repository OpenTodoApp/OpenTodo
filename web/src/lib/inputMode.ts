// The input in use (OpenSpec change touch-input-mode D2): an element a tap focused
// carries `data-tap`, so it draws no focus ring, while one a keyboard, a mouse or a
// trackpad focused does. Assistive technology moves focus without a pointer or a key,
// so it keeps whatever ring the last input allowed. `data-keyboard` (keyboardSeen.ts)
// keeps its own meaning, for key hints.
//
// Only the focused element is marked, never the root: the focus-ring rules then depend
// on one element's attribute, so a change of input restyles that element alone. An
// attribute on <html> that every element's ring depended on restyled the whole page on
// the first tap after a key, 200 ms with a 2,000-row list on a mid-range phone (#1761).

import { fromHardwareKeyboard } from './keyboardSeen'

export const TAP_ATTR = 'data-tap'

/** Whether a pointer press is a finger: mouse, trackpad and pen presses keep the rings. */
export function isTap(pointerType: string): boolean {
  return pointerType === 'touch'
}

/** Marks what taps focus, and unmarks it on a hardware key or another pointer; returns the stop. */
export function watchInputMode(doc: Document = document): () => void {
  let touch = false
  let marked: Element | null = null
  const unmark = () => {
    marked?.removeAttribute(TAP_ATTR)
    marked = null
  }
  const mark = (el: Element | null) => {
    if (el === marked) return
    unmark()
    if (!el || el === doc.body || el === doc.documentElement) return
    el.setAttribute(TAP_ATTR, '')
    marked = el
  }
  // The element focused before the tap loses its ring too, as every ring did before.
  const onPointer = (e: PointerEvent) => {
    if (!e.isTrusted) return
    touch = isTap(e.pointerType)
    if (touch) mark(doc.activeElement)
    else unmark()
  }
  const onKey = (e: KeyboardEvent) => {
    if (!fromHardwareKeyboard(e)) return
    touch = false
    unmark()
  }
  const onFocus = (e: FocusEvent) => {
    if (touch) mark(e.target instanceof Element ? e.target : null)
    else unmark()
  }
  const opts = { capture: true, passive: true }
  doc.addEventListener('pointerdown', onPointer, opts)
  doc.addEventListener('keydown', onKey, opts)
  doc.addEventListener('focusin', onFocus, opts)
  return () => {
    doc.removeEventListener('pointerdown', onPointer, opts)
    doc.removeEventListener('keydown', onKey, opts)
    doc.removeEventListener('focusin', onFocus, opts)
    unmark()
  }
}
