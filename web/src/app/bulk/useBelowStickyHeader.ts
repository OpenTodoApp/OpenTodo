// An element that stays in sight while a long list scrolls (the sticky quick add):
// sticky, pinned just below the page's own sticky header, whose height depends
// on the page (one row, a second row of tabs, a wrapped title). The offset is
// measured from the header and follows its size; a header that does not stick
// (a phone's day head scrolls away) leaves the element at the very top.
import { type RefObject, useLayoutEffect, useState } from 'react'

/** Where `el` sticks below the page header: `top` (px), and the header's bottom margin (`gap`, px) it paints over. */
export interface BelowHeader { top: number; gap: number }

/**
 * The place that keeps `el` below the sticky page header of its page, where it already
 * rests (#1441): the header's own sticky `top` (the list page's top padding), its height
 * and the margin under it. Sticking any higher would make the element jump on the first
 * scroll; `gap` is the margin, for the element to paint so rows never show through it.
 */
export function useBelowStickyHeader(el: RefObject<HTMLElement | null>, active: boolean): BelowHeader {
  const [place, setPlace] = useState<BelowHeader>({ top: 0, gap: 0 })
  useLayoutEffect(() => {
    if (!active) return
    const header = el.current?.closest('[data-page-body]')?.querySelector<HTMLElement>('[data-page-header]')
    if (!header) return
    const measure = () => {
      const cs = getComputedStyle(header)
      if (cs.position !== 'sticky') { setPlace((p) => (p.top === 0 && p.gap === 0 ? p : { top: 0, gap: 0 })); return }
      const gap = parseFloat(cs.marginBottom) || 0
      const top = (parseFloat(cs.top) || 0) + header.offsetHeight + gap
      setPlace((p) => (p.top === top && p.gap === gap ? p : { top, gap }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(header)
    return () => ro.disconnect()
  }, [el, active])
  return place
}
