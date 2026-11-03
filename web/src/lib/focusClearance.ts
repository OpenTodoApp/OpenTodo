// Focus not obscured (OpenSpec change accessibility-aa, WCAG 2.2 2.4.11): an element
// that receives focus and lands under a sticky or fixed bar (a page header, the filter's
// Save bar, the task page's comment box, the phone tab bar) is scrolled clear of it.
// The browser scrolls a focused element into view, but a sticky bar inside the same
// scroller still covers it. Toasts keep clear of the focus themselves
// (useToastClearance), so they are left out here.

/** The nearest ancestor that scrolls vertically, or the document's scroller. */
function scrollerOf(el: Element): Element | null {
  for (let a = el.parentElement; a; a = a.parentElement) {
    const y = getComputedStyle(a).overflowY
    if ((y === 'auto' || y === 'scroll') && a.scrollHeight > a.clientHeight) return a
  }
  return document.scrollingElement
}

/** The sticky or fixed bar painted over `el` at the point, if any (not a toast, not an ancestor of el). */
function coverAt(el: Element, x: number, y: number): Element | null {
  const hit = document.elementFromPoint(x, y)
  if (!hit || el.contains(hit) || hit.contains(el)) return null
  for (let a: Element | null = hit; a && a !== document.body; a = a.parentElement) {
    if (a.closest('[data-toast-region]')) return null
    const pos = getComputedStyle(a).position
    if (pos === 'sticky' || pos === 'fixed') return a.contains(el) ? null : a
  }
  return null
}

/** Scrolls the focused element out from under a sticky or fixed bar; returns how far it moved. */
export function clearFocusOfBars(el: Element): number {
  const r = el.getBoundingClientRect()
  if (!r.width || !r.height) return 0
  // A link wrapped over two lines is two boxes: look at the middle of each, not between them.
  const lines = [...el.getClientRects()].filter((q) => q.width > 1 && q.height > 1)
  const boxes = lines.length > 1 ? lines : [r]
  let cover: Element | null = null
  for (const b of boxes) {
    const x = b.left + Math.min(b.width / 2, 12)
    cover = coverAt(el, x, b.top + b.height / 2) ?? coverAt(el, x, b.top + Math.min(4, b.height / 2)) ?? coverAt(el, x, b.bottom - Math.min(4, b.height / 2))
    if (cover) break
  }
  const scroller = scrollerOf(el)
  if (!cover || !scroller) return 0
  // A bar in the upper half of the scroller is a header: scroll the element down below it; one in the
  // lower half, a footer (the element may sit higher than a header's middle when it is under it).
  const c = cover.getBoundingClientRect()
  const view = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect()
  const by = c.top + c.height / 2 < (view.top + view.bottom) / 2 ? r.top - c.bottom - 8 : r.bottom - c.top + 8
  if (!by) return 0
  const before = scroller.scrollTop
  // At once: a smooth scroll would leave the focus covered while it moves.
  scroller.scrollBy({ top: by, behavior: 'instant' })
  return scroller.scrollTop - before
}

/** Installs the check for focus moved by the keyboard (a pointer focuses what it can see). Returns the uninstall. */
export function watchFocusClearance(): () => void {
  if (typeof document === 'undefined') return () => {}
  const onFocus = (e: FocusEvent) => {
    const el = e.target as Element | null
    if (!el || !(el instanceof Element) || !el.matches(':focus-visible')) return
    // After the browser's own scroll into view.
    requestAnimationFrame(() => { if (document.activeElement === el) clearFocusOfBars(el) })
  }
  // Capture: an overlay stops focus events at its root (ui/overlay isolate), a bubbling listener would miss them.
  document.addEventListener('focusin', onFocus, true)
  return () => document.removeEventListener('focusin', onFocus, true)
}
