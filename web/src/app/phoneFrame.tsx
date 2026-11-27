// The frame of the phone's chrome (app-shell "Phone navigation"): where the bar at the
// top and the tab bar at the bottom sit and how tall they are. The shell's bar, the tab
// bar and the cold-start skeleton (shell-first-paint) all take it from here, so the
// skeleton cannot drift from the chrome that replaces it.
import type { ReactNode } from 'react'
import type { Route } from './router'

/** The bar at the top: its height, its padding under the status area, phones only. A size container, so
 * its actions can measure its width in the root's rem, which follows the text size (text-size D5). */
export const PHONE_BAR_FRAME = 'flex min-h-12 items-center gap-1 ps-2 pe-2 pt-[max(0.25rem,var(--safe-top))] md:hidden @container'
/** Its hairline; a day page's bar has none (precision-phone D1). */
export const PHONE_BAR_LINE = 'border-b border-soft'
/** The tab bar: a capsule floating 8 px above the safe area and 12 px in from the sides, phones only (phone-modern-look D1). */
export const TAB_BAR_FRAME = 'fixed inset-s-[calc(0.75rem+var(--safe-start))] bottom-[calc(0.5rem+var(--safe-bottom))] z-40 flex gap-0.5 rounded-full border border-soft bg-surface/90 p-1 shadow-3 backdrop-blur-xl backdrop-saturate-150 dark:bg-raised/90 md:hidden'
/** The tab bar's whole frame: it ends before the add button, which sits beside it at its height, or at the gutter when there is none. */
export function tabBarFrame(withAdd: boolean): string {
  return `${TAB_BAR_FRAME} ${withAdd ? 'inset-e-[calc(5.25rem+var(--safe-end))]' : 'inset-e-[calc(0.75rem+var(--safe-end))]'} transition-[inset-inline-end] duration-(--duration-ui)`
}
/** One tab's box; its height is `TAB_HEIGHT`, or `min-h-10` minimised. The current one sits on a pill. */
export const TAB_FRAME = 'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1'
/**
 * A tab's height, 56 px (the bar is `TAB_BAR_HEIGHT_REM` with its padding). Important, because the touch rule that
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
        <div aria-hidden className={tabBarFrame(true)}>
          {/* Buttons, as the tabs are: the touch rules that size a real tab size these too. */}
          {[0, 1, 2, 3].map((i) => <button key={i} disabled className={`${TAB_FRAME} ${TAB_HEIGHT}`}>{BLOCK}</button>)}
        </div>
      )}
    </div>
  )
}
