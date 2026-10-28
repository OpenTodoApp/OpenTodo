// The selection bar stays in sight while a long list scrolls (issue 518): it is
// sticky, pinned just below the page's own sticky header, whose height depends
// on the page (one row, a second row of tabs, a wrapped title). The offset is
// measured from the header and follows its size; a header that does not stick
// (a phone's day head scrolls away) leaves the bar at the very top.
import { type RefObject, useLayoutEffect, useState } from 'react'

/** The `top` (px) that keeps `el` below the sticky page header of its page. */
export function useBelowStickyHeader(el: RefObject<HTMLElement | null>, active: boolean): number {
  const [top, setTop] = useState(0)
  useLayoutEffect(() => {
    if (!active) return
    const header = el.current?.closest('[data-page-body]')?.querySelector<HTMLElement>('[data-page-header]')
    if (!header) return
    const measure = () => setTop(getComputedStyle(header).position === 'sticky' ? header.offsetHeight : 0)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(header)
    return () => ro.disconnect()
  }, [el, active])
  return top
}
