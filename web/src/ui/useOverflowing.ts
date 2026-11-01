// Whether an element's text is cut (OpenSpec change task-list-width, design D3): a
// title clamped to two lines, or text cut with an ellipsis, gets its whole text in a
// Tooltip only while it is cut. One ResizeObserver serves every element on the page,
// so a list of two thousand rows costs one observer, not two thousand.
import { type RefObject, useLayoutEffect, useState } from 'react'
import { resettable } from '../lib/moduleState'

/** True while the element's text overflows its box (a line clamp or an ellipsis). */
export function isOverflowing(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
}

const watchers = new Map<Element, () => void>()
let observer: ResizeObserver | null = null
resettable('overflowing', () => { observer?.disconnect(); observer = null; watchers.clear() })

function watch(el: Element, update: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {}
  observer ??= new ResizeObserver((entries) => { for (const e of entries) watchers.get(e.target)?.() })
  watchers.set(el, update)
  observer.observe(el)
  return () => {
    watchers.delete(el)
    observer?.unobserve(el)
  }
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
    const update = () => setCut(isOverflowing(el))
    update()
    return watch(el, update)
  }, [ref, text, on])
  return cut
}
