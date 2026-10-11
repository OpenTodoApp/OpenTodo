import type { ReactNode } from 'react'

/**
 * Toast region (OpenSpec change `mobile-layout`): bottom-centred across the screen on
 * phones, bottom-right from 640 px up, clear of the home indicator and the on-screen
 * keyboard. Children are the toasts; only they take taps.
 */
export function ToastRegion({ children, live = 'polite', label }: { children: ReactNode; live?: 'polite' | 'assertive'; label?: string }) {
  return (
    <div aria-live={live} aria-label={label} data-toast-region
      className="pointer-events-none fixed inset-x-0 z-40 flex flex-col items-stretch gap-2 px-3 sm:left-auto sm:right-4 sm:w-[22rem] sm:px-0"
      style={{ bottom: 'calc(var(--vv-bottom, 0px) + max(1rem, env(safe-area-inset-bottom)))' }}>
      {children}
    </div>
  )
}
