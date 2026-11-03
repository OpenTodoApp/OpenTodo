// The quick add stays reachable in long lists (OpenSpec change add-position, design
// D4): from 768 px, where no floating Add button is shown, the list page's quick add
// row sticks right under the sticky page header and the rows scroll under it. Below
// 768 px it scrolls with the list as before. On a phone held in landscape (coarse
// pointer, under 500 px tall) the pinned row would cover the top of the list, so the
// `pins` variant leaves it unstuck there too; revealRow reads the computed position,
// so it stops counting the row as soon as it no longer sticks.
// No scroll padding on the scroller: the browser would read the stuck field itself
// as covered and scroll the list back up each time the field takes focus.
import type { RefObject } from 'react'
import { useBelowStickyHeader } from '../bulk/useBelowStickyHeader'

/**
 * The classes that make the wrapper stick from 768 px, except on a landscape phone (the
 * `pins` variant), on the page surface with its bottom border. The row keeps its box (the
 * page's left edge and spacing do not move); a pseudo-element paints the surface into the
 * page gutters so rows never show beside it.
 */
export const STICKY_QUICK_ADD = 'pins:sticky pins:z-9 pins:bg-surface pins:before:pointer-events-none pins:before:absolute pins:before:inset-y-0 pins:before:-inset-x-8 pins:before:-z-10 pins:before:bg-surface'

/** The `top` (px) of the sticky quick add: just below the sticky page header. */
export function useStickyQuickAdd(el: RefObject<HTMLElement | null>, active: boolean): number {
  return useBelowStickyHeader(el, active)
}
