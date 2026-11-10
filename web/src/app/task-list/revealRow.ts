// Keeping the keyboard cursor's row in sight (issue 514). `scrollIntoView({
// block: 'nearest' })` brings a row to the scroller's top edge, where the sticky
// page header (and a pinned group header) covers it, and stops at the first row,
// so whatever is above the list never comes back. revealRow scrolls by hand:
// below everything pinned at the top, above the bottom edge, and all the way to
// the top for the first row.

import { resettable } from '../../lib/moduleState'

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
 * under it (the quick add, a group header).
 */
/** The elements that can be sticky in a scroller, found again at most every STICKY_TTL_MS. */
const STICKY_TTL_MS = 1_000
let stickyCache: { scroller: HTMLElement; at: number; list: HTMLElement[] } | null = null
/** Calls of revealRow so far: the frames that check a reveal stop once there is a newer one. */
let reveals = 0
resettable('revealRow', () => { stickyCache = null; reveals = 0 })

function stickyCandidates(scroller: HTMLElement): HTMLElement[] {
  const now = performance.now()
  if (stickyCache?.scroller === scroller && now - stickyCache.at < STICKY_TTL_MS) return stickyCache.list.filter((el) => el.isConnected)
  // Only what can be sticky (the app pins with Tailwind's sticky classes): reading
  // the style of every element cost 80 ms a key in a 2,000-row list (performance-10k),
  // and finding them again on every key of a run of j presses most of the rest. A
  // task row holds nothing sticky, so the walk skips each row's subtree: matching
  // the selectors against every element of 2,000 rows took 8 ms a key
  // (list-rendering-at-scale).
  const list: HTMLElement[] = []
  const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => ((n as HTMLElement).dataset?.taskId !== undefined ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n as HTMLElement
    if (el.className?.toString().includes('sticky') || el.getAttribute('style')?.includes('sticky')) list.push(el)
  }
  stickyCache = { scroller, at: now, list }
  return list
}

export function pinnedBottom(scroller: HTMLElement, row: HTMLElement): number {
  let bottom = scroller.getBoundingClientRect().top
  const pinned: DOMRect[] = []
  for (const s of stickyCandidates(scroller)) {
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
  // A row far from the viewport is skipped by the browser (content-visibility, the
  // cursor row included, list-rendering-at-scale D6): it and its neighbours stand at
  // their remembered or estimated height until they are drawn, so the scroll is
  // checked again in the next frames, once they have their own height.
  const skipped = typeof row.checkVisibility === 'function' && !row.checkVisibility({ contentVisibilityAuto: true })
  revealOnce(row, opts)
  const call = ++reveals
  if (!skipped || typeof requestAnimationFrame !== 'function') return
  let frames = 3
  const check = () => {
    // A later reveal (the cursor moved on) wins.
    if (!row.isConnected || call !== reveals) return
    revealOnce(row, opts)
    if (--frames > 0) requestAnimationFrame(check)
  }
  requestAnimationFrame(check)
}

function revealOnce(row: HTMLElement, opts: { first?: boolean }): void {
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
  const box = scroller.getBoundingClientRect()
  // The selection bar floats over the bottom of the content (no-layout-jump): rows stay above it.
  const bar = document.querySelector('[data-selection-bar]')?.getBoundingClientRect()
  const visibleBottom = (bar && bar.height > 0 && bar.top < box.bottom ? bar.top : box.bottom) - GAP
  // What is pinned at the top never reaches past the scroller's middle: a row
  // below it needs no look at the pinned headers, which reads the style of
  // every element of the list (performance-10k: 80 ms a key at 2,000 rows).
  const middle = box.top + box.height / 2
  if (r.top >= middle) {
    if (r.bottom > visibleBottom) scroller.scrollTop += Math.min(r.bottom - visibleBottom, r.top - middle)
    return
  }
  const visibleTop = pinnedBottom(scroller, row) + GAP
  if (r.top < visibleTop) scroller.scrollTop -= visibleTop - r.top
  else if (r.bottom > visibleBottom) scroller.scrollTop += Math.min(r.bottom - visibleBottom, r.top - visibleTop)
}

/** The first task row of the list holding `row` (`[data-task-list]` root, else the page). */
export function isFirstRow(row: HTMLElement, root?: HTMLElement | null): boolean {
  const first = (root ?? document).querySelector('li[data-task-id]')
  return first === row
}
