// The phone tab bar minimises while the list scrolls down (OpenSpec change phone-v2,
// design D6): one hook on the content scroller, not a listener per view. Down by more
// than 24 px minimises; any scroll up, reaching the end, or 600 ms without scrolling
// restores. Under reduced motion nothing moves, so the bar stays full.
import { type RefObject, useEffect, useState } from 'react'

/** Downward travel before the bar minimises. */
export const MINIMISE_AFTER_PX = 24
/** Quiet time after which the bar comes back. */
export const RESTORE_AFTER_MS = 600

/** Stories only: show the bar minimised without scrolling (the visual gate cannot scroll a list). */
let forced = false
export function forceMinimisedForStory(on: boolean): void { forced = on }

export function useScrollMinimised(scroller: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [minimised, setMinimised] = useState(false)
  useEffect(() => {
    const el = scroller.current
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!el || !enabled || reduced) { setMinimised(false); return }
    let last = el.scrollTop
    let down = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const onScroll = () => {
      const y = el.scrollTop
      const delta = y - last
      last = y
      clearTimeout(timer)
      const atEnd = y + el.clientHeight >= el.scrollHeight - 2
      if (delta < 0 || atEnd) { down = 0; setMinimised(false); return }
      down += delta
      if (down > MINIMISE_AFTER_PX) setMinimised(true)
      timer = setTimeout(() => { down = 0; setMinimised(false) }, RESTORE_AFTER_MS)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); clearTimeout(timer) }
  }, [scroller, enabled])
  return enabled && (minimised || forced)
}
