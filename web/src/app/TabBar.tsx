// The phone navigation (OpenSpec change ux-overhaul, app-shell "Phone navigation"):
// below 768 px a bottom tab bar with Inbox, Today and Upcoming in the user's
// destination order, then Search, and a floating add button that opens quick add as a
// bottom sheet; the drawer opens from the top bar's menu button (precision-phone D3).
// Both hide while a sheet is open and on the task page; tabs are 56 px tall (`TAB_HEIGHT`)
// and sit above the bottom safe area. While the list scrolls down the bar drops its
// labels to 40 px of icons and the button slides out (phone-v2 D6). The current tab
// is marked in the strong text tone, not the accent, as the sidebar marks its current
// page (precision-phone D3). The room the shell keeps under the content follows the
// bar's real height as it minimises and returns (`--tab-bar-h`, issue #1908).
import { Icon, type IconName } from '../ui'
import { forwardRef, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { tabBarDestinations } from '../lib/appearance'
import { t, msg, translatedList } from '../lib/i18n'
import { useUserPrefsRow } from '../lib/localData'
import { playHaptic } from '../lib/haptics'
import { useOpenTasks } from '../lib/liveTasks'
import { logicalToday } from '../lib/dates'
import { requestQuickAddSheet } from './QuickAddSheet'
import { nextTimedToday, useTabCounts } from './tabCounts'
import { openTaskPage } from './taskTrail'
import { navigate, type Route } from './router'
import { TAB_FRAME, TAB_HEIGHT, tabBarFrame } from './phoneFrame'

/** The bar's height (a 56 px tab and its 4 px padding each side) and the 8 px it floats above the safe area. */
export const TAB_BAR_HEIGHT_REM = 4
const TAB_BAR_LIFT_REM = 0.5
/** The room under the content: from the bar's top to the screen's bottom as measured, the full bar until it is. */
export const TAB_BAR_ROOM = `var(--tab-bar-h, calc(${TAB_BAR_HEIGHT_REM + TAB_BAR_LIFT_REM}rem + var(--safe-bottom)))`

/**
 * Publishes the bar's height, safe area included, as `--tab-bar-h` on the root, frame
 * by frame while it minimises or returns, so rows stay visible up to its edge.
 */
function useTabBarRoom(bar: { current: HTMLElement | null }): void {
  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const root = document.documentElement.style
    // From the bar's top to the screen's bottom: the bar floats, so its own height leaves out the gap under it.
    const publish = () => { const r = el.getBoundingClientRect(); root.setProperty('--tab-bar-h', `${Math.max(0, innerHeight - r.top)}px`) }
    publish()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null
    observer?.observe(el, { box: 'border-box' })
    return () => { observer?.disconnect(); root.removeProperty('--tab-bar-h') }
  }, [bar])
}

const TABS: { id: string; label: string; icon: IconName; route?: Route }[] = translatedList<{ id: string; label: string; icon: IconName; route?: Route }, 'label'>([
  { id: 'inbox', label: msg('Inbox'), icon: 'inbox', route: { view: 'inbox' } },
  { id: 'today', label: msg('Today'), icon: 'sun', route: { view: 'today' } },
  { id: 'upcoming', label: msg('Upcoming'), icon: 'calendar-days', route: { view: 'upcoming' } },
  { id: 'search', label: msg('Search'), icon: 'search' },
], 'label')
const TAB_BY_ID = Object.fromEntries(TABS.map((item) => [item.id, item]))

/** How long a press on a tab is held before it does the tab's hold (phone-delight D7). */
export const TAB_HOLD_MS = 450
/** The badge's largest number; more reads as this and a plus. */
const BADGE_MAX = 99

/**
 * The hold of a tab (phone-delight D7): after TAB_HOLD_MS without the finger moving away it
 * plays a tick and runs `act`; the click that ends the press is then not the tab's tap.
 */
function useTabHold() {
  const held = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancel = () => clearTimeout(timer.current)
  return {
    held,
    props: (act: (() => void) | undefined) => act ? {
      onPointerDown: (e: ReactPointerEvent) => {
        held.current = false
        if (e.button !== 0) return
        cancel()
        timer.current = setTimeout(() => { held.current = true; playHaptic('tick'); act() }, TAB_HOLD_MS)
      },
      onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel,
      // The system's long-press menu would cover what the hold opens.
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    } : {},
  }
}

export function TabBar({ route, onSearch, minimised = false, withAdd = false }: { route: Route; onSearch: () => void; minimised?: boolean; withAdd?: boolean }) {
  // Search is not a destination: it stays last, whatever order the three lists are in.
  const tabs = [...tabBarDestinations(useUserPrefsRow()).map((id) => TAB_BY_ID[id]), TAB_BY_ID.search]
  const nav = useRef<HTMLElement>(null)
  useTabBarRoom(nav)
  const counts = useTabCounts()
  const open = useOpenTasks()
  const hold = useTabHold()
  const holds: Record<string, (() => void) | undefined> = {
    // Today: the day's next timed task, else Today itself.
    today: () => { const next = nextTimedToday(open, logicalToday(), new Date()); if (next) openTaskPage(next.id, { from: '/today', label: t('Today') }); else navigate({ view: 'today' }) },
    // Inbox: the Inbox, with quick add open to add to it.
    inbox: () => { navigate({ view: 'inbox' }); setTimeout(() => requestQuickAddSheet(), 0) },
  }
  return (
    <>
    {/* The content fades into the page under the bar, so a row's text does not show through it (phone-calm D8). */}
    <div aria-hidden data-tab-fade className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-[calc(var(--tab-bar-h,5rem)+1.5rem)] bg-linear-to-t from-canvas via-canvas/80 to-transparent md:hidden" />
    <nav ref={nav} aria-label={t('Primary destinations')} data-tab-bar data-minimised={minimised || undefined}
      className={tabBarFrame(withAdd && !minimised)}>
      {tabs.map((item) => {
        const active = !!item.route && route.view === item.route.view
        const tap = item.route ? () => navigate(item.route!) : onSearch
        const onClick = () => { if (hold.held.current) { hold.held.current = false; return } tap() }
        // The current tab's screen lists its tasks: no count there (phone-calm D8).
        const count = active ? 0 : item.id === 'inbox' ? counts.inbox : item.id === 'today' ? counts.today : 0
        return (
          <button key={item.id} type="button" onClick={onClick} {...hold.props(holds[item.id])} data-tab={item.id} data-focus-key={`tab-${item.id}`} aria-current={active ? 'page' : undefined}
            aria-haspopup={item.id === 'search' ? 'dialog' : undefined}
            className={`${TAB_FRAME} text-hint transition-[min-height] duration-(--duration-ui) press-selected select-none [-webkit-touch-callout:none] ${minimised ? 'min-h-10' : TAB_HEIGHT} ${active ? 'bg-selected text-strong' : 'text-muted'}`}>
            <span className="relative flex">
              <Icon name={item.icon} size="md" />
              {/* The open count on the icon (phone-delight D7); the name says it in words. */}
              {count > 0 && (
                <span aria-hidden data-tab-count={count} className="absolute -top-1.5 start-3.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-hint leading-none font-semibold text-on-accent tabular-nums">
                  {count > BADGE_MAX ? `${BADGE_MAX}+` : count}
                </span>
              )}
            </span>
            {/* Minimised, the word stays the tab's name for assistive technology. */}
            <span data-tab-label className={minimised ? 'sr-only' : 'truncate'}>{item.label}</span>
            {count > 0 && <span className="sr-only">{`, ${t('{n, plural, one {# task} other {# tasks}}', { n: count })}`}</span>}
          </button>
        )
      })}
    </nav>
    </>
  )
}

/** The floating add button above the tab bar; the sheet it opens is anchored to it. */
/** On the Notes page it starts a note (`note`, notes-home): the one add of that phone screen. */
export const AddButton = forwardRef<HTMLButtonElement, { onClick: () => void; open: boolean; away?: boolean; note?: boolean }>(function AddButton({ onClick, open, away = false, note = false }, ref) {
  return (
    <button ref={ref} type="button" onClick={onClick} aria-label={note ? t('New note') : t('Add task')} aria-haspopup={note ? undefined : 'dialog'} aria-expanded={note ? undefined : open} data-add-button data-focus-key="add-button"
      data-away={away || undefined} tabIndex={away ? -1 : undefined} aria-hidden={away || undefined}
      className={`fixed inset-e-[calc(0.75rem+var(--safe-end))] z-40 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-on-accent shadow-3 press-accent-hover transition-transform duration-(--duration-ui) md:hidden ${away ? 'pointer-events-none translate-y-[calc(100%+6rem)]' : ''}`}
      style={{ bottom: `calc(${TAB_BAR_LIFT_REM}rem + var(--safe-bottom))` }}>
      <Icon name="plus" size="lg" />
    </button>
  )
})
