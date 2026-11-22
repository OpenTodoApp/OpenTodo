// Whether a click came from a finger (haptic-kinds D2): a control plays `selection`
// only for a change made by touch, never by keyboard, mouse or script. The pointerdown
// before the click names the pointer; a click without one (Space, Enter, a script)
// is not a touch.
import { useRef } from 'react'

export function useTouchPress(): { down: (e: { pointerType: string }) => void; byTouch: () => boolean } {
  const touch = useRef(false)
  return {
    down: (e) => { touch.current = e.pointerType === 'touch' },
    byTouch: () => { const was = touch.current; touch.current = false; return was },
  }
}

/** The `selection` feedback, loaded on the first touch so the primitives add nothing to the first load. */
export function selectionHaptic(): void {
  void import('../lib/haptics').then((m) => m.playHaptic('selection'), () => {})
}
