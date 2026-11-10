import { Children, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

/**
 * Toast region (OpenSpec change `mobile-layout`): bottom-centred across the screen on
 * phones, bottom-right from 640 px up, clear of the home indicator and the on-screen
 * keyboard. Children are the toasts; only they take taps. `side="start"` moves it to
 * the bottom left from 640 px (the toast primitive, moments-and-onboarding D9). From 768 px
 * it sits above the sidebar column, which it covers there (accessibility-aa), and under dialogs.
 */
export function ToastRegion({ children, live = 'polite', label, side, regionRef }: {
  children: ReactNode
  live?: 'polite' | 'assertive'
  label?: string
  /** Set by a host that keeps its own clearance; otherwise the region keeps clear of the focus itself. */
  side?: ToastSide
  regionRef?: RefObject<HTMLDivElement | null>
}) {
  const own = useRef<HTMLDivElement | null>(null)
  const ref = regionRef ?? own
  const kept = useToastClearance(ref, side === undefined && Children.count(children) > 0, false)
  const at = side ?? kept
  // 'top' (accessibility-aa): on a phone, a toast that would still cover the focused element
  // after scrolling moves under the top bar until the focus leaves it.
  const top = at === 'top'
  return (
    <div ref={ref} role="region" aria-live={live} aria-label={label} data-toast-region data-toast-side={at}
      className={`pointer-events-none fixed inset-x-0 z-40 md:z-[46] flex flex-col items-stretch gap-2 pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))] sm:w-[22rem] sm:px-0 ${at === 'start' ? 'sm:left-[calc(1rem+var(--safe-left))] sm:right-auto' : 'sm:left-auto sm:right-[calc(1rem+var(--safe-right))]'}`}
      style={top ? { top: 'calc(var(--safe-top) + 4rem)' } : { bottom: 'calc(var(--vv-bottom, 0px) + var(--toast-lift, 0px) + var(--selection-lift, 0px) + max(1rem, var(--safe-bottom)))' }}>
      {children}
    </div>
  )
}

export type ToastSide = 'end' | 'start' | 'top'

/** Where a phone's toast sits when it moves to the top: under the bar with the page title. */
const TOP_OFFSET = 64

const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/**
 * A toast never covers the element that has focus (WCAG 2.2, 2.4.11; design-system
 * "Toast primitive"). The content column keeps a bottom scroll padding taller than a
 * toast (`--list-scroll-pad`, rows-v2 D7), so while `active` a focused element under
 * the region is scrolled into view with `block: 'nearest'`; one still under it (a tall
 * reminder, the last row of a list) is scrolled clear by the overlap where its scroller
 * can go further. From 640 px up, one still covered sends the toast to the opposite
 * corner; on a phone, to the top (accessibility-aa). Returns the side. `pointer`: also
 * for focus a tap or click moved (the action toasts, as before); without it only keyboard
 * focus is followed, and nothing is measured for a click (a reminder shown while someone
 * works through a long list must not cost every click a layout).
 */
export function useToastClearance(region: RefObject<HTMLDivElement | null>, active: boolean, pointer = true): ToastSide {
  const [side, setSide] = useState<ToastSide>('end')
  // The gap under the toast at the bottom (the tab bar and the home indicator), last measured there.
  const endGap = useRef(72)
  useEffect(() => {
    if (!active) { setSide('end'); return }
    /** On a phone: the bottom when the focus is clear of it there, else the top when clear there, else as it is. */
    const phoneSide = (f: DOMRect, box: DOMRect, current: ToastSide): ToastSide => {
      const h = box.height
      const clear = (top: number, bottom: number) => f.bottom <= top || f.top >= bottom
      if (clear(window.innerHeight - endGap.current - h, window.innerHeight - endGap.current)) return 'end'
      if (clear(TOP_OFFSET, TOP_OFFSET + h)) return 'top'
      return current
    }
    /**
     * Back to its own place: a phone's toast at the top goes back to the bottom, and a region that follows only
     * keyboard focus also leaves the other corner; it moved only while keyboard focus would be under it there.
     */
    const down = () => setSide((s) => (s === 'top' || (!pointer && s === 'start') ? 'end' : s))
    const check = () => {
      const el = region.current
      const focused = document.activeElement as HTMLElement | null
      if (!el) return
      if (el.contains(focused)) return
      // Nothing focused, or focus a tap moved: a toast that moved goes back, without measuring.
      if (!focused || focused === document.body) { down(); return }
      if (!pointer && !keyboardFocus(focused)) { down(); return }
      let box = el.getBoundingClientRect()
      const wide = window.matchMedia?.('(min-width: 40rem)').matches ?? false
      if (!wide && el.dataset.toastSide !== 'top') endGap.current = Math.max(0, window.innerHeight - box.bottom)
      if (!overlaps(focused.getBoundingClientRect(), box)) {
        // Back to the bottom once the focus is clear of where the toast would sit there.
        if (!wide) setSide((s) => (s === 'top' ? phoneSide(focused.getBoundingClientRect(), box, s) : s))
        return
      }
      focused.scrollIntoView?.({ block: 'nearest' })
      box = el.getBoundingClientRect()
      // Keyboard focus only from here (WCAG 2.4.11 is about it): a tap or click focuses what the
      // person already sees, and moving the toast under their finger would get in the way.
      if (!keyboardFocus(focused)) { if (wide && overlaps(focused.getBoundingClientRect(), box)) setSide((s) => (s === 'end' ? 'start' : 'end')); return }
      const still = focused.getBoundingClientRect()
      if (overlaps(still, box)) scrollerOf(focused)?.scrollBy?.({ top: still.bottom - box.top + 8, behavior: 'instant' })
      if (!overlaps(focused.getBoundingClientRect(), el.getBoundingClientRect())) return
      if (wide) setSide((s) => (s === 'end' ? 'start' : 'end'))
      else setSide((s) => phoneSide(focused.getBoundingClientRect(), el.getBoundingClientRect(), s))
    }
    // Focus that leaves for nothing (Escape from a menu, a removed control) fires no focusin.
    const onFocusOut = (e: FocusEvent) => { if (!e.relatedTarget) requestAnimationFrame(check) }
    // A tap or click anywhere but the toast: the person is not following keyboard focus.
    const onPointer = (e: PointerEvent) => { if (!region.current?.contains(e.target as Node)) down() }
    check()
    // Capture: an overlay stops focus events at its root (ui/overlay isolate), a bubbling listener here would miss them.
    document.addEventListener('focusin', check, true)
    document.addEventListener('focusout', onFocusOut, true)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      document.removeEventListener('focusin', check, true)
      document.removeEventListener('focusout', onFocusOut, true)
      document.removeEventListener('pointerdown', onPointer, true)
    }
  }, [region, active, pointer])
  return side
}

/** Focus the keyboard moved (`:focus-visible`; an engine without it counts as the keyboard). */
function keyboardFocus(el: HTMLElement): boolean {
  try { return el.matches(':focus-visible') } catch { return true }
}

/** The nearest ancestor that scrolls vertically. */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let a = el.parentElement; a; a = a.parentElement) {
    const y = getComputedStyle(a).overflowY
    if ((y === 'auto' || y === 'scroll') && a.scrollHeight > a.clientHeight) return a
  }
  return document.scrollingElement as HTMLElement | null
}
