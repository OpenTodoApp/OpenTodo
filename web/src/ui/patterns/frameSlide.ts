// A standalone page frame slides to its new centre when the content column jumps
// in width (OpenSpec change page-rhythm D4): the panel docking or leaving, the
// sidebar collapsing. A centred frame's margins are `auto`, which CSS cannot
// transition, so the frame is moved back by the distance it jumped and animated
// to its place (the emphasis duration and the calm easing). Window resizes arrive
// in small steps and move nothing; reduced motion and "no motion" place it at once.
import { useEffect, useRef } from 'react'

/** A width change of the column at least this large in one step is a panel or the sidebar, not a window drag. */
export const FRAME_JUMP_PX = 160

/** The calm easing of index.css (`--ease-calm`). */
const EASE_CALM = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

/** False under reduced motion or the app's "no motion" setting. */
export function frameSlideAllowed(): boolean {
  if (typeof window === 'undefined') return false
  if (document.documentElement.dataset.motion === 'none') return false
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** The emphasis duration in ms, read from the stylesheet (0 when motion is off). */
function emphasisMs(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--duration-emphasis').trim()
  const n = parseFloat(v)
  return Number.isFinite(n) ? (v.endsWith('ms') ? n : n * 1000) : 250
}

/**
 * Decide the slide for one observation: the distance to animate from, or null.
 * Pure, for tests: `before`/`after` are the column's width and the frame's left edge.
 */
export function slideFrom(before: { width: number; left: number }, after: { width: number; left: number }, allowed: boolean): number | null {
  if (!allowed) return null
  if (Math.abs(after.width - before.width) < FRAME_JUMP_PX) return null
  const dx = before.left - after.left
  return dx === 0 ? null : dx
}

/** A ref for a standalone frame; the frame slides when its column jumps in width. */
export function useFrameSlide<T extends HTMLElement>(on: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    const column = el?.parentElement
    if (!on || !el || !column || typeof ResizeObserver === 'undefined') return
    let last = { width: column.clientWidth, left: el.offsetLeft }
    const ro = new ResizeObserver(() => {
      const now = { width: column.clientWidth, left: el.offsetLeft }
      const dx = slideFrom(last, now, frameSlideAllowed())
      last = now
      if (dx === null || typeof el.animate !== 'function') return
      el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], { duration: emphasisMs(), easing: EASE_CALM })
    })
    ro.observe(column)
    return () => ro.disconnect()
  }, [on])
  return ref
}
