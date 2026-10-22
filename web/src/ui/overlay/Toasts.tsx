import { useEffect, useState, type ReactNode, type RefObject } from 'react'

/**
 * Toast region (OpenSpec change `mobile-layout`): bottom-centred across the screen on
 * phones, bottom-right from 640 px up, clear of the home indicator and the on-screen
 * keyboard. Children are the toasts; only they take taps. `side="start"` moves it to
 * the bottom left from 640 px (the toast primitive, moments-and-onboarding D9).
 */
export function ToastRegion({ children, live = 'polite', label, side = 'end', regionRef }: {
  children: ReactNode
  live?: 'polite' | 'assertive'
  label?: string
  side?: 'end' | 'start'
  regionRef?: RefObject<HTMLDivElement | null>
}) {
  return (
    <div ref={regionRef} role="region" aria-live={live} aria-label={label} data-toast-region data-toast-side={side}
      className={`pointer-events-none fixed inset-x-0 z-40 flex flex-col items-stretch gap-2 px-3 sm:w-[22rem] sm:px-0 ${side === 'start' ? 'sm:left-4 sm:right-auto' : 'sm:left-auto sm:right-4'}`}
      style={{ bottom: 'calc(var(--vv-bottom, 0px) + max(1rem, env(safe-area-inset-bottom)))' }}>
      {children}
    </div>
  )
}

const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/**
 * A toast never covers the element that has focus (WCAG 2.2, 2.4.11; design-system
 * "Toast primitive"). The content column keeps a bottom scroll padding taller than a
 * toast (`--list-scroll-pad`, rows-v2 D7), so while `active` a focused element under
 * the region is scrolled into view with `block: 'nearest'`, as far as that needs; from
 * 640 px up, one still under it (an open panel's field) sends the toast to the
 * opposite corner. Returns the side.
 */
export function useToastClearance(region: RefObject<HTMLDivElement | null>, active: boolean): 'end' | 'start' {
  const [side, setSide] = useState<'end' | 'start'>('end')
  useEffect(() => {
    if (!active) { setSide('end'); return }
    const check = () => {
      const el = region.current
      const focused = document.activeElement as HTMLElement | null
      if (!el) return
      if (!focused || focused === document.body || el.contains(focused)) return
      let box = el.getBoundingClientRect()
      if (!overlaps(focused.getBoundingClientRect(), box)) return
      focused.scrollIntoView?.({ block: 'nearest' })
      box = el.getBoundingClientRect()
      const wide = window.matchMedia?.('(min-width: 640px)').matches ?? false
      if (wide && overlaps(focused.getBoundingClientRect(), box)) setSide((s) => (s === 'end' ? 'start' : 'end'))
    }
    check()
    document.addEventListener('focusin', check)
    return () => document.removeEventListener('focusin', check)
  }, [region, active])
  return side
}
