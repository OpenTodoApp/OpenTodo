// A tap on the iPhone's status bar scrolls to the top (OpenSpec change
// status-bar-scroll-top, design D3). The page scrolls an inner element, so iOS cannot;
// the shell sends `opentodo:scroll-top` instead, and the frontmost scroller goes to its
// top: the topmost open sheet, dialog or panel, else the page's main scroller (the
// innermost `[data-main-scroller]` that scrolls). Loaded only in a shell that lists
// `scroll-top`.

export const SCROLL_TOP_EVENT = 'opentodo:scroll-top'

function scrolls(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)
}

/** The layer's own scroller: itself, or the first of its descendants that scrolls. */
function scrollerIn(layer: HTMLElement): HTMLElement | null {
  if (scrolls(layer)) return layer
  for (const el of layer.querySelectorAll<HTMLElement>('*')) if (scrolls(el)) return el
  return null
}

/** What a status bar tap scrolls: null when the frontmost layer has nothing to scroll. */
export function scrollTopTarget(doc: Document = document): HTMLElement | null {
  // Overlays render at the end of the body, so the last layer is the frontmost.
  const layers = [...doc.querySelectorAll<HTMLElement>('[data-panel-frame], [data-overlay-root]')]
  const front = layers.at(-1)
  if (front) return scrollerIn(front)
  return [...doc.querySelectorAll<HTMLElement>('[data-main-scroller]')].filter(scrolls).at(-1) ?? null
}

function reducedMotion(): boolean {
  return document.documentElement.dataset.motion === 'none'
    || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

/** Scrolls the frontmost scroller to its top, smoothly unless motion is reduced. */
export function scrollToTop(doc: Document = document): void {
  scrollTopTarget(doc)?.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })
}

/** Answers the shell's event from now on; returns the stop. */
export function listenForScrollTop(): () => void {
  const on = () => scrollToTop()
  window.addEventListener(SCROLL_TOP_EVENT, on)
  return () => window.removeEventListener(SCROLL_TOP_EVENT, on)
}
