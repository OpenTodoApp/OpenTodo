import { type RefObject, type SyntheticEvent, useEffect, useLayoutEffect, useRef } from 'react'
import { captureFocus, focusInto, lockScroll, pushOverlay } from './stack'
import { useBackToClose } from './useBackToClose'

/**
 * Behaviour every overlay shares (design D1): Escape through the overlay stack,
 * focus moved in on open and back to the trigger on close, and (modal overlays)
 * the page behind kept from scrolling.
 */
export function useOverlay({ panel, onClose, modal = true, trigger }: {
  panel: RefObject<HTMLElement | null>
  onClose: () => void
  modal?: boolean
  trigger?: RefObject<HTMLElement | null>
}) {
  const close = useRef(onClose)
  useLayoutEffect(() => { close.current = onClose })
  useBackToClose(modal, onClose)
  useEffect(() => {
    const { pop } = pushOverlay(() => close.current())
    const unlock = modal ? lockScroll() : () => {}
    const el = panel.current
    const inside = (a: unknown) => !!el && el.contains(a as Node)
    const restore = modal ? captureFocus(trigger?.current, undefined, inside) : () => {}
    // After layout: an anchored panel is placed in a layout effect first.
    const raf = modal ? requestAnimationFrame(() => { if (panel.current) focusInto(panel.current) }) : 0
    if (modal && panel.current) focusInto(panel.current)
    return () => {
      cancelAnimationFrame(raf)
      pop()
      unlock()
      restore()
    }
    // Mount-only: the overlay is mounted while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; modal, panel and trigger are fixed for the overlay's lifetime
  }, [])
}

const stop = (e: SyntheticEvent) => e.stopPropagation()

/**
 * Overlays render in a portal, and React bubbles portal events to the component
 * that rendered them (a sidebar row that starts a drag on pointerdown, a list that
 * reads keys). The overlay is its own layer: events stop at its root.
 */
export const isolate = {
  onClick: stop,
  onPointerDown: stop,
  onMouseDown: stop,
  onTouchStart: stop,
  onKeyDown: stop,
  onContextMenu: stop,
  onFocus: stop,
  onBlur: stop,
}
