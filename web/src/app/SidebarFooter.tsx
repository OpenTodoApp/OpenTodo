// The sidebar footer (quiet-sidebar D5, app-shell "Compact sidebar on a desktop"): one
// row. The account control (avatar and name) opens the account menu with Settings,
// Help, Keyboard shortcuts and Sign out; then the assistant launcher, notifications,
// the sync dot and, from 1024 px, the collapse control. The icon rail stacks them.
import { useState } from 'react'
import { Avatar, IconButton, Menu, MenuItem, MenuSeparator, SidebarItem } from '../ui'
import { keysOf } from '../lib/shortcuts'
import type { User } from '../lib/types'
import { t } from '../lib/i18n'
import { SignOutDialog } from './AccountSettings'
import { NotificationBell } from './NotificationBell'
import { navigate, type Route } from './router'
import { SyncStatus } from './SyncStatus'
import { RelayIndicator } from './RelaySettings'
import { TrackingIndicator } from './TrackingIndicator'

const ACTIVE = 'bg-accent-soft font-medium text-on-accent-soft'
const IDLE = 'text-muted hover:bg-sunken hover:text-default dark:hover:bg-raised'
/** Below 768 px every control of the row keeps a touch-height target. */
const TOUCH = 'max-md:min-h-11 max-md:min-w-11 touch-target'

export function SidebarFooter({ route, user, collapsed, onSearch, onShortcuts, onAssistant, onToggleCollapse, onSignOut }: {
  route: Route
  user: User
  /** The icon rail. */
  collapsed: boolean
  onSearch?: () => void
  onShortcuts?: () => void
  onAssistant?: () => void
  onToggleCollapse?: () => void
  /** Signs out of this device, after the same confirmation as Settings → Account. */
  onSignOut?: () => void
}) {
  const [signingOut, setSigningOut] = useState(false)
  const name = user.name || user.email
  // The account control is the current place while Settings, Import or Help is open.
  const current = route.view === 'settings' || route.view === 'import' || route.view === 'help'
  return (
    <div className={`shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 ${collapsed ? 'px-1.5' : 'px-3'}`} data-sidebar-footer data-footer-row={!collapsed || undefined}>
      {/* The running time entry (time-tracking D6): a status item like the sync dot, shown only while one runs. */}
      <TrackingIndicator collapsed={collapsed} />
      <div className={`flex items-center gap-0.5 ${collapsed ? 'flex-col' : 'min-w-0'}`} data-footer-icons>
        <Menu kind="menu" label={collapsed ? t('Account menu for {name}', { name }) : name} namedByContent={!collapsed} title={name}
          align="start" width="sm:w-64" tip={name} tipSide={collapsed ? 'right' : 'top'}
          triggerProps={{ 'aria-current': current ? 'page' : undefined, 'data-account-menu': true }}
          triggerClassName={`flex min-h-9 items-center gap-2 rounded-control py-1 text-left text-body pointer-fine:min-h-8 ${TOUCH} ${collapsed ? 'w-full justify-center px-0' : 'min-w-0 flex-1 px-1.5'} ${current ? ACTIVE : IDLE}`}
          trigger={<>
            <Avatar id={user.id} name={name} />
            {!collapsed && <span className="min-w-0 flex-1 truncate">{name}</span>}
          </>}>
          <MenuItem label={t('Settings')} icon="settings" shortcut={keysOf('go.settings')} onSelect={() => navigate({ view: 'settings' })} data-settings-button />
          <MenuItem label={t('Help')} icon="circle-help" shortcut={keysOf('go.help')} onSelect={() => navigate({ view: 'help' })} data-help-button />
          {onShortcuts && <MenuItem label={t('Keyboard shortcuts')} icon="keyboard" shortcut={keysOf('global.help')} onSelect={onShortcuts} data-shortcuts-button />}
          {onSignOut && <>
            <MenuSeparator />
            {/* After the menu closed and gave focus back to the account control, so Escape returns there. */}
            <MenuItem label={t('Sign out')} icon="log-out" danger onSelect={() => setTimeout(() => setSigningOut(true), 0)} data-sign-out-button />
          </>}
        </Menu>
        {onAssistant && <IconButton icon="message-circle" label={t('Assistant')} shortcut={keysOf('global.assistant')} size="sm" className={TOUCH} onClick={onAssistant} aria-haspopup="dialog" data-assistant-launcher />}
        <NotificationBell compact={collapsed} />
        <RelayIndicator />
        <SyncStatus compact={collapsed} />
        {collapsed && onSearch && <SidebarItem icon="search" label={t('Search and commands')} collapsed onClick={onSearch} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" data-palette-button />}
        {onToggleCollapse && (
          <IconButton icon={collapsed ? 'panel-left-open' : 'panel-left-close'} label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')} shortcut={keysOf('global.sidebar')} size="sm"
            className="hidden lg:inline-flex" onClick={onToggleCollapse} data-sidebar-collapse aria-pressed={collapsed} />
        )}
      </div>
      {signingOut && onSignOut && <SignOutDialog onConfirm={onSignOut} onCancel={() => setSigningOut(false)} />}
    </div>
  )
}
