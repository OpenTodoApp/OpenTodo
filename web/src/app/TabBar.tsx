// The phone navigation (OpenSpec change ux-overhaul, app-shell "Phone navigation"):
// below 768 px a bottom tab bar with Today, Inbox, Upcoming, Search and More (the
// sidebar as a drawer), and a floating add button that opens quick add as a bottom
// sheet. Both hide while a sheet or the task panel is open; tabs are at least 44 px
// tall and sit above the bottom safe area.
import { Icon, type IconName } from '../ui'
import { forwardRef } from 'react'
import { navigate, type Route } from './router'

export const TAB_BAR_HEIGHT_REM = 3.5

const TABS: { id: string; label: string; icon: IconName; route?: Route }[] = [
  { id: 'today', label: 'Today', icon: 'calendar-check', route: { view: 'today' } },
  { id: 'inbox', label: 'Inbox', icon: 'inbox', route: { view: 'inbox' } },
  { id: 'upcoming', label: 'Upcoming', icon: 'calendar-days', route: { view: 'upcoming' } },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'more', label: 'More', icon: 'menu' },
]

export function TabBar({ route, onSearch, onMore, moreOpen = false }: { route: Route; onSearch: () => void; onMore: () => void; moreOpen?: boolean }) {
  return (
    <nav aria-label="Primary destinations" data-tab-bar
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-default bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {TABS.map((t) => {
        const active = t.route ? route.view === t.route.view : t.id === 'more' && moreOpen
        const onClick = t.route ? () => navigate(t.route!) : t.id === 'search' ? onSearch : onMore
        return (
          <button key={t.id} type="button" onClick={onClick} data-tab={t.id} aria-current={t.route && active ? 'page' : undefined}
            aria-haspopup={t.id === 'search' ? 'dialog' : t.id === 'more' ? 'true' : undefined} aria-expanded={t.id === 'more' ? moreOpen : undefined}
            className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-hint ${active ? 'text-accent' : 'text-muted'}`}>
            <Icon name={t.icon} size="md" />
            <span className="truncate">{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

/** The floating add button above the tab bar; the sheet it opens is anchored to it. */
export const AddButton = forwardRef<HTMLButtonElement, { onClick: () => void; open: boolean }>(function AddButton({ onClick, open }, ref) {
  return (
    <button ref={ref} type="button" onClick={onClick} aria-label="Add a task" aria-haspopup="dialog" aria-expanded={open} data-add-button
      className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-3 md:hidden"
      style={{ bottom: `calc(${TAB_BAR_HEIGHT_REM}rem + 0.75rem + env(safe-area-inset-bottom))` }}>
      <Icon name="plus" size="lg" />
    </button>
  )
})
