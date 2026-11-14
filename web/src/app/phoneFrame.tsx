// The frame of the phone's chrome (app-shell "Phone navigation"): where the bar at the
// top and the tab bar at the bottom sit and how tall they are. The shell's bar, the tab
// bar and the cold-start skeleton (shell-first-paint) all take it from here, so the
// skeleton cannot drift from the chrome that replaces it.
import type { ReactNode } from 'react'
import type { Route } from './router'

/** The bar at the top: its height, its padding under the status area, phones only. */
export const PHONE_BAR_FRAME = 'flex min-h-12 items-center gap-1 pl-2 pr-2 pt-[max(0.25rem,var(--safe-top))] md:hidden'
/** Its hairline; a day page's bar has none (precision-phone D1). */
export const PHONE_BAR_LINE = 'border-b border-soft'
/** The tab bar: fixed to the bottom, above the safe area, phones only. */
export const TAB_BAR_FRAME = 'fixed inset-x-0 bottom-0 z-40 flex border-t border-soft bg-canvas px-safe pb-safe md:hidden'
/** One tab's box; its height is `TAB_HEIGHT`, or `min-h-10` minimised. */
export const TAB_FRAME = 'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1'
/**
 * A tab's height, 56 px (`TAB_BAR_HEIGHT_REM`). Important, because the touch rule that
 * makes every button at least 44 px is outside the layers and would otherwise replace
 * it: the tabs were 44 px on a touch screen (touch-pressed-states).
 */
export const TAB_HEIGHT = 'min-h-14!'

/** Whether a route's screen has the tab bar; the task page and the routine editor have their own bars. */
export function hasPhoneChrome(route: Route): boolean {
  if (route.view === 'rules' && !!(route.id || route.create)) return false
  return !['share', 'invite', 'project-invite', 'workspace-invite', 'reset', 'task'].includes(route.view)
}

// Still, unlike the rows: the chrome is not what is loading.
const BLOCK = <span className="block h-5 w-5 rounded-chip bg-sunken dark:bg-raised" />

/**
 * The phone's chrome around the cold-start skeleton (App): on a phone that was signed in
 * it holds the place of the bar and the tab bar, so nothing moves when the app replaces it.
 */
export function PhoneFrameSkeleton({ route, signedIn, children }: { route: Route; signedIn: boolean; children: ReactNode }) {
  const chrome = signedIn && hasPhoneChrome(route)
  // A day page (Today, Upcoming) keeps its title in the page: its bar has no hairline.
  const day = route.view === 'today' || route.view === 'upcoming'
  return (
    <div className="px-safe">
      {chrome && (
        <div aria-hidden className={`${PHONE_BAR_FRAME} ${day ? '' : PHONE_BAR_LINE}`}>
          {/* The menu button's box: 40 px, 44 px on a touch screen. */}
          <span className="p-2.5 pointer-coarse:p-3">{BLOCK}</span>
        </div>
      )}
      {children}
      {chrome && (
        <div aria-hidden className={TAB_BAR_FRAME}>
          {/* Buttons, as the tabs are: the touch rules that size a real tab size these too. */}
          {[0, 1, 2, 3].map((i) => <button key={i} disabled className={`${TAB_FRAME} ${TAB_HEIGHT}`}>{BLOCK}</button>)}
        </div>
      )}
    </div>
  )
}
