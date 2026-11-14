// The room a page header has (OpenSpec change tablet-header-room): a header follows
// its own width, not the window's. A 768 px window with the sidebar open, a list
// beside the docked task panel and a 500 px window leave the same header, so the
// header and the page that fills it measure the column they sit in.
import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useFinePointer } from './overlay/stack'

/**
 * Below this width a header is narrow: it keeps one row and hands the rest to its menu, as
 * the phone bar does. Controls are 44 px on touch and 32 px with a mouse, so the same
 * header needs less room with a mouse: a list beside the docked panel at 1280 px keeps all of it.
 */
export const NARROW_HEADER_REM = 40
export const NARROW_HEADER_FINE_REM = 28

const rem = (): number => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

/**
 * Whether the element given to the returned ref is narrower than 40 rem (28 rem with a mouse). A page passes
 * its root, the header its own element: both span the column. An element without a
 * width (not laid out) is not narrow. `also`: a ref of the caller's that gets the same element.
 */
export function useNarrow<T extends HTMLElement = HTMLElement>(also?: RefObject<T | null>): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null)
  const [narrow, setNarrow] = useState(false)
  const limit = useFinePointer() ? NARROW_HEADER_FINE_REM : NARROW_HEADER_REM
  useLayoutEffect(() => {
    if (!el) { setNarrow(false); return }
    const update = () => { const w = el.clientWidth; setNarrow(w > 0 && w < limit * rem()) }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el, limit])
  const ref = useCallback((node: T | null) => { if (also) also.current = node; setEl(node) }, [also])
  return [ref, narrow]
}

/**
 * True while the element's one line of content is wider than its box. For text that
 * shows whole or not at all: the caller hides it with `invisible`, which keeps the box,
 * so the measure stays the same while hidden.
 */
export function useCut<T extends HTMLElement = HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [cut, setCut] = useState(false)
  // After every render: the content can change while the box stays as it is. The same value ends the chain.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current
    if (el) setCut(el.scrollWidth > el.clientWidth + 1)
  })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setCut(el.scrollWidth > el.clientWidth + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, cut]
}
