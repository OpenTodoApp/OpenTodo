// The phone navigation (OpenSpec change ux-overhaul, app-shell "Phone navigation"):
// below 768 px a bottom tab bar with Inbox, Today, Upcoming and Search, and a floating
// add button that opens quick add as a bottom sheet; the drawer opens from the top
// bar's menu button (precision-phone D3). Both hide while a sheet is open and on the
// task page; tabs are at least 48 px tall and sit above the bottom safe area. While the
// list scrolls down the bar drops its labels to 40 px of icons and the button slides
// out (phone-v2 D6). The current tab is marked in the strong text tone, not the accent,
// as the sidebar marks its current page (precision-phone D3).
import { Icon, type IconName } from '../ui'
import { forwardRef } from 'react'
import { navigate, type Route } from './router'
import { t, msg, translatedList } from '../lib/i18n'

export const TAB_BAR_HEIGHT_REM = 3.5

const TABS: { id: string; label: string; icon: IconName; route?: Route }[] = translatedList<{ id: string; label: string; icon: IconName; route?: Route }, 'label'>([
  { id: 'inbox', label: msg('Inbox'), icon: 'inbox', route: { view: 'inbox' } },
  { id: 'today', label: msg('Today'), icon: 'sun', route: { view: 'today' } },
  { id: 'upcoming', label: msg('Upcoming'), icon: 'calendar-days', route: { view: 'upcoming' } },
  { id: 'search', label: msg('Search'), icon: 'search' },
], 'label')

export function TabBar({ route, onSearch, minimised = false }: { route: Route; onSearch: () => void; minimised?: boolean }) {
  return (
    <nav aria-label={t('Primary destinations')} data-tab-bar data-minimised={minimised || undefined}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-soft bg-canvas pb-[env(safe-area-inset-bottom)] md:hidden">
      {TABS.map((item) => {
        const active = !!item.route && route.view === item.route.view
        const onClick = item.route ? () => navigate(item.route!) : onSearch
        return (
          <button key={item.id} type="button" onClick={onClick} data-tab={item.id} aria-current={active ? 'page' : undefined}
            aria-haspopup={item.id === 'search' ? 'dialog' : undefined}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-hint transition-[min-height] duration-(--duration-ui) ${minimised ? 'min-h-10' : 'min-h-14'} ${active ? 'text-strong' : 'text-muted'}`}>
            <Icon name={item.icon} size="md" />
            {/* Minimised, the word stays the tab's name for assistive technology. */}
            <span className={minimised ? 'sr-only' : 'truncate'}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

/** The floating add button above the tab bar; the sheet it opens is anchored to it. */
export const AddButton = forwardRef<HTMLButtonElement, { onClick: () => void; open: boolean; away?: boolean }>(function AddButton({ onClick, open, away = false }, ref) {
  return (
    <button ref={ref} type="button" onClick={onClick} aria-label={t('Add a task')} aria-haspopup="dialog" aria-expanded={open} data-add-button
      data-away={away || undefined} tabIndex={away ? -1 : undefined} aria-hidden={away || undefined}
      className={`fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-3 transition-transform duration-(--duration-ui) md:hidden ${away ? 'pointer-events-none translate-y-[calc(100%+6rem)]' : ''}`}
      style={{ bottom: `calc(${TAB_BAR_HEIGHT_REM}rem + 0.75rem + env(safe-area-inset-bottom))` }}>
      <Icon name="plus" size="lg" />
    </button>
  )
})
