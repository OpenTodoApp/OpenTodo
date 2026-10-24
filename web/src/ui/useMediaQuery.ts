// A media query as React state (OpenSpec change ux-overhaul, app-shell "No desktop
// top bar"): the page header and the shell's phone bar mount a page's actions in
// one place at a time, so a menu or a dialog never exists twice.
import { useSyncExternalStore } from 'react'

const matches = (query: string): boolean => (typeof matchMedia === 'function' ? matchMedia(query).matches : true)

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof matchMedia !== 'function') return () => {}
      const mql = matchMedia(query)
      mql.addEventListener?.('change', onChange)
      return () => mql.removeEventListener?.('change', onChange)
    },
    () => matches(query),
    () => true,
  )
}

/** The breakpoint above which the page header shows its own title row (below it, the shell's phone bar does). */
export const DESKTOP_HEADER_QUERY = '(min-width: 48rem)'
