// The quick add stays reachable in long lists (OpenSpec change add-position, design
// D4): from 768 px, where no floating Add button is shown, the list page's quick add
// row sticks right under the sticky page header and the rows scroll under it. Below
// 768 px it scrolls with the list as before. A row the keyboard cursor moves to is
// kept below it by revealRow, which counts every sticky element pinned at the top.
// No scroll padding on the scroller: the browser would read the stuck field itself
// as covered and scroll the list back up each time the field takes focus.
import type { RefObject } from 'react'
import { useBelowStickyHeader } from '../bulk/useBelowStickyHeader'

/**
 * The classes that make the wrapper stick from 768 px, on the page surface with its
 * bottom border. The row keeps its box (the page's left edge and spacing do not move);
 * a pseudo-element paints the surface into the page gutters so rows never show beside it.
 */
export const STICKY_QUICK_ADD = 'md:sticky md:z-9 md:bg-surface md:before:pointer-events-none md:before:absolute md:before:inset-y-0 md:before:-inset-x-8 md:before:-z-10 md:before:bg-surface'

/** The `top` (px) of the sticky quick add: just below the sticky page header. */
export function useStickyQuickAdd(el: RefObject<HTMLElement | null>, active: boolean): number {
  return useBelowStickyHeader(el, active)
}
