// The input in use (OpenSpec change touch-input-mode D2): `data-input` on the root
// element says what moved focus last, so a tap draws no focus ring while a keyboard,
// a mouse or a trackpad does. Assistive technology moves focus without a pointer or a
// key, so it keeps whatever ring the last input allowed. `data-keyboard`
// (keyboardSeen.ts) keeps its own meaning, for key hints.

import { fromHardwareKeyboard } from './keyboardSeen'

export const INPUT_ATTR = 'data-input'

export type InputMode = 'touch' | 'keyboard' | 'pointer'

/** The mode a pointer press stands for: a finger is touch, a mouse, trackpad or pen a pointer. */
export function pointerMode(pointerType: string): InputMode {
  return pointerType === 'touch' ? 'touch' : 'pointer'
}

/** Writes `data-input` on every pointer press and hardware key press; returns the stop. */
export function watchInputMode(doc: Document = document): () => void {
  const set = (mode: InputMode) => {
    if (doc.documentElement.getAttribute(INPUT_ATTR) !== mode) doc.documentElement.setAttribute(INPUT_ATTR, mode)
  }
  const onPointer = (e: PointerEvent) => { if (e.isTrusted) set(pointerMode(e.pointerType)) }
  const onKey = (e: KeyboardEvent) => { if (fromHardwareKeyboard(e)) set('keyboard') }
  const opts = { capture: true, passive: true }
  doc.addEventListener('pointerdown', onPointer, opts)
  doc.addEventListener('keydown', onKey, opts)
  return () => {
    doc.removeEventListener('pointerdown', onPointer, opts)
    doc.removeEventListener('keydown', onKey, opts)
  }
}
