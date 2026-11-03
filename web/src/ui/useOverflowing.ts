// Whether an element's text is cut (OpenSpec change task-list-width, design D3): a
// title clamped to two lines, or text cut with an ellipsis, gets its whole text in a
// Tooltip only while it is cut. One ResizeObserver serves every element on the page,
// so a list of two thousand rows costs one observer, not two thousand.
//
// An element in content the browser skips (a list row far from the viewport,
// `content-visibility: auto`, list-rendering-at-scale) is neither measured nor
// observed until that content is drawn: reading its size made the browser lay out
// that one row on its own (150 rows a step cost about half a second in the phone
// profile while a long list was drawn), and observing every title of a 2,000-row
// list cost each frame about 10 ms there. Where the browser cannot say what it
// skips, every element is measured and observed as before.
import { type RefObject, useLayoutEffect, useState } from 'react'
import { resettable } from '../lib/moduleState'

/** True while the element's text overflows its box (a line clamp or an ellipsis). */
export function isOverflowing(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
}

/** One followed element: what to call with its state. */
interface Follow { set: (cut: boolean) => void }

/** Followed elements that are drawn: observed for size changes. */
const watched = new Map<Element, Follow>()
/** Followed elements in skipped content: measured and observed once it is drawn. */
const waiting = new Map<HTMLElement, Follow>()
let observer: ResizeObserver | null = null
/** Elements waiting for their first measurement, and the frame that takes it. */
const queued = new Map<HTMLElement, Follow>()
let frame = 0
let listening = false

resettable('overflowing', () => {
  observer?.disconnect()
  observer = null
  watched.clear()
  waiting.clear()
  queued.clear()
  frame = 0
})

/** The browser tells which content it skips, and when that changes. */
const knowsSkipped = (): boolean => typeof ContentVisibilityAutoStateChangeEvent === 'function' && typeof HTMLElement.prototype.checkVisibility === 'function'

/** The element sits in content the browser skips (it is far from the viewport). */
const isSkipped = (el: HTMLElement): boolean => !el.checkVisibility({ contentVisibilityAuto: true })

function observe(el: HTMLElement, f: Follow) {
  if (typeof ResizeObserver === 'undefined') return
  observer ??= new ResizeObserver((entries) => {
    // All reads first, then the states: one layout for every changed element.
    const read = entries.flatMap((e) => {
      const w = watched.get(e.target)
      return w ? [[w, isOverflowing(e.target as HTMLElement)] as const] : []
    })
    for (const [w, cut] of read) w.set(cut)
  })
  watched.set(el, f)
  observer.observe(el)
}

function unobserve(el: Element) {
  if (watched.delete(el)) observer?.unobserve(el)
}

/** Content that starts or stops being drawn: its elements are measured, or set aside. */
function onSkipChange(e: Event) {
  const target = e.target as Node
  const skipped = (e as ContentVisibilityAutoStateChangeEvent).skipped
  if (skipped) {
    for (const [el, f] of watched) {
      if (!target.contains(el)) continue
      unobserve(el)
      waiting.set(el as HTMLElement, f)
    }
    return
  }
  // The drawn element's own descendants: a row holds a few dozen, the waiting list
  // thousands while a long list is open.
  if (!(target instanceof Element)) return
  for (const el of target.getElementsByTagName('*')) {
    const f = waiting.get(el as HTMLElement)
    if (!f) continue
    waiting.delete(el as HTMLElement)
    measureSoon(el as HTMLElement, f)
  }
}

/** Measures the queued elements in one frame, all reads before any state is set. */
function measureQueued() {
  frame = 0
  const batch = [...queued]
  queued.clear()
  const skips = knowsSkipped()
  const drawn = skips ? batch.filter(([el, f]) => {
    if (!isSkipped(el)) return true
    waiting.set(el, f)
    return false
  }) : batch
  const cut = drawn.map(([el]) => isOverflowing(el))
  drawn.forEach(([el, f], i) => {
    f.set(cut[i])
    observe(el, f)
  })
}

function measureSoon(el: HTMLElement, f: Follow) {
  if (typeof requestAnimationFrame !== 'function') {
    f.set(isOverflowing(el))
    observe(el, f)
    return
  }
  if (!listening && knowsSkipped()) {
    // Capture: the event is fired at the skipped element and does not bubble.
    document.addEventListener('contentvisibilityautostatechange', onSkipChange, true)
    listening = true
  }
  queued.set(el, f)
  frame ||= requestAnimationFrame(measureQueued)
}

function forget(el: HTMLElement) {
  queued.delete(el)
  waiting.delete(el)
  unobserve(el)
}

/**
 * Follows whether `ref`'s element overflows, re-measuring when it resizes and when
 * `text` changes. `on: false` measures nothing and reads false.
 */
export function useOverflowing(ref: RefObject<HTMLElement | null>, text: string, on = true): boolean {
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el) { setCut(false); return }
    // Measured with every other element in one frame, all reads before any
    // state is set: measuring here forced a layout per row while a list mounted
    // (performance-10k: 3 s for 2,000 rows).
    measureSoon(el, { set: setCut })
    return () => forget(el)
  }, [ref, text, on])
  return cut
}
