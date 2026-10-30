// Keeping the keyboard cursor's row in sight (issue 514). `scrollIntoView({
// block: 'nearest' })` brings a row to the scroller's top edge, where the sticky
// page header (and a pinned group header) covers it, and stops at the first row,
// so whatever is above the list never comes back. revealRow scrolls by hand:
// below everything pinned at the top, above the bottom edge, and all the way to
// the top for the first row.

/** Room kept between the row and a pinned header or the bottom edge, in px. */
const GAP = 4

/** The nearest ancestor that scrolls vertically, or null. */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY
    if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

/**
 * How far down from the scroller's top the sticky elements pinned there reach
 * (viewport y), counting a stack: the page header, then what is pinned right
 * under it (the selection bar, a group header).
 */
export function pinnedBottom(scroller: HTMLElement, row: HTMLElement): number {
  let bottom = scroller.getBoundingClientRect().top
  const pinned: DOMRect[] = []
  for (const s of scroller.querySelectorAll<HTMLElement>('*')) {
    if (s.contains(row) || getComputedStyle(s).position !== 'sticky') continue
    const r = s.getBoundingClientRect()
    if (r.height > 0) pinned.push(r)
  }
  pinned.sort((a, b) => a.top - b.top)
  for (const r of pinned) if (r.top <= bottom + 1 && r.bottom > bottom) bottom = r.bottom
  return bottom
}

/**
 * Scroll so `row` is fully visible below the pinned headers. `first` (the
 * list's first row) scrolls to the very top, so the page's header and quick add
 * show again. Without a scrolling ancestor it falls back to the browser.
 */
export function revealRow(row: HTMLElement, opts: { first?: boolean } = {}): void {
  const scroller = scrollParent(row)
  if (!scroller) {
    row.scrollIntoView?.({ block: 'nearest' })
    return
  }
  if (opts.first) {
    scroller.scrollTop = 0
    return
  }
  const r = row.getBoundingClientRect()
  const visibleTop = pinnedBottom(scroller, row) + GAP
  const visibleBottom = scroller.getBoundingClientRect().bottom - GAP
  if (r.top < visibleTop) scroller.scrollTop -= visibleTop - r.top
  else if (r.bottom > visibleBottom) scroller.scrollTop += Math.min(r.bottom - visibleBottom, r.top - visibleTop)
}

/** The first task row of the list holding `row` (`[data-task-list]` root, else the page). */
export function isFirstRow(row: HTMLElement, root?: HTMLElement | null): boolean {
  const first = (root ?? document).querySelector('li[data-task-id]')
  return first === row
}
