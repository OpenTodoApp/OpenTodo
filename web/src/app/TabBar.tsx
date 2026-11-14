// The phone navigation (OpenSpec change ux-overhaul, app-shell "Phone navigation"):
// below 768 px a bottom tab bar with Inbox, Today and Upcoming in the user's
// destination order, then Search, and a floating add button that opens quick add as a
// bottom sheet; the drawer opens from the top bar's menu button (precision-phone D3).
// Both hide while a sheet is open and on the task page; tabs are 56 px tall (`TAB_HEIGHT`)
// and sit above the bottom safe area. While the list scrolls down the bar drops its
// labels to 40 px of icons and the button slides out (phone-v2 D6). The current tab
// is marked in the strong text tone, not the accent, as the sidebar marks its current
// page (precision-phone D3).
import { Icon, type IconName } from '../ui'
import { forwardRef } from 'react'
import { tabBarDestinations } from '../lib/appearance'
import { t, msg, translatedList } from '../lib/i18n'
import { useUserPrefsRow } from '../lib/localData'
import { navigate, type Route } from './router'
import { TAB_BAR_FRAME, TAB_FRAME, TAB_HEIGHT } from './phoneFrame'

export const TAB_BAR_HEIGHT_REM = 3.5

const TABS: { id: string; label: string; icon: IconName; route?: Route }[] = translatedList<{ id: string; label: string; icon: IconName; route?: Route }, 'label'>([
  { id: 'inbox', label: msg('Inbox'), icon: 'inbox', route: { view: 'inbox' } },
  { id: 'today', label: msg('Today'), icon: 'sun', route: { view: 'today' } },
  { id: 'upcoming', label: msg('Upcoming'), icon: 'calendar-days', route: { view: 'upcoming' } },
  { id: 'search', label: msg('Search'), icon: 'search' },
], 'label')
const TAB_BY_ID = Object.fromEntries(TABS.map((item) => [item.id, item]))

export function TabBar({ route, onSearch, minimised = false }: { route: Route; onSearch: () => void; minimised?: boolean }) {
  // Search is not a destination: it stays last, whatever order the three lists are in.
  const tabs = [...tabBarDestinations(useUserPrefsRow()).map((id) => TAB_BY_ID[id]), TAB_BY_ID.search]
  return (
    <nav aria-label={t('Primary destinations')} data-tab-bar data-minimised={minimised || undefined}
      className={TAB_BAR_FRAME}>
      {tabs.map((item) => {
        const active = !!item.route && route.view === item.route.view
        const onClick = item.route ? () => navigate(item.route!) : onSearch
        return (
          <button key={item.id} type="button" onClick={onClick} data-tab={item.id} aria-current={active ? 'page' : undefined}
            aria-haspopup={item.id === 'search' ? 'dialog' : undefined}
            className={`${TAB_FRAME} text-hint transition-[min-height] duration-(--duration-ui) press-selected ${minimised ? 'min-h-10' : TAB_HEIGHT} ${active ? 'text-strong' : 'text-muted'}`}>
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
/** On the Notes page it starts a note (`note`, notes-home): the one add of that phone screen. */
export const AddButton = forwardRef<HTMLButtonElement, { onClick: () => void; open: boolean; away?: boolean; note?: boolean }>(function AddButton({ onClick, open, away = false, note = false }, ref) {
  return (
    <button ref={ref} type="button" onClick={onClick} aria-label={note ? t('New note') : t('Add a task')} aria-haspopup={note ? undefined : 'dialog'} aria-expanded={note ? undefined : open} data-add-button
      data-away={away || undefined} tabIndex={away ? -1 : undefined} aria-hidden={away || undefined}
      className={`fixed right-[calc(1rem+var(--safe-right))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-3 press-accent-hover transition-transform duration-(--duration-ui) md:hidden ${away ? 'pointer-events-none translate-y-[calc(100%+6rem)]' : ''}`}
      style={{ bottom: `calc(${TAB_BAR_HEIGHT_REM}rem + 0.75rem + var(--safe-bottom))` }}>
      <Icon name="plus" size="lg" />
    </button>
  )
})
