// The Settings sections (OpenSpec `settings-navigation`): one table shared by the
// overview, the side navigation, the section pages and the tests.
import { isAdministrator } from '../lib/roles'
import type { User } from '../lib/types'
import type { SettingsSectionId } from './router'

export interface SettingsSection {
  id: SettingsSectionId
  label: string
  /** One line on the overview saying what the section holds, for this viewer. */
  description: (user: User) => string
  /** Who sees the section; everyone when absent. */
  visible?: (user: User) => boolean
  /** Features the demo instance refuses here, named in its note instead of their panels. */
  demo?: (user: User) => string[]
  /** True when the demo refuses everything in the section, so it shows only the note. */
  demoOnly?: boolean
}

const owner = (u: User) => u.role === 'owner'

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: 'account', label: 'Account',
    description: () => 'Password, two-factor, passkeys, encryption and sign out',
    demo: () => ['password and two-factor authentication', 'passkeys', 'linked accounts', 'end-to-end encryption'],
  },
  {
    id: 'general', label: 'General',
    description: () => 'Calendar, start view, keyboard, quick add, voice capture and projects',
  },
  {
    id: 'notifications', label: 'Notifications',
    description: () => 'Push notifications for reminders on this device',
    demo: () => ['push notifications'], demoOnly: true,
  },
  {
    id: 'data', label: 'Data',
    description: (u) => (owner(u) ? 'Export, import, sync status and backups' : 'Export, import and sync status'),
    demo: (u) => (owner(u) ? ['backups'] : []),
  },
  {
    id: 'capture', label: 'Capture',
    description: () => 'Bookmarklet, browser extension and email to task',
    demo: () => ['email to task'],
  },
  {
    id: 'integrations', label: 'Integrations',
    description: () => 'Calendar apps (CalDAV), webhooks and API tokens',
    demo: () => ['calendar apps (CalDAV)', 'webhooks', 'API tokens'], demoOnly: true,
  },
  {
    id: 'ai', label: 'AI',
    description: () => 'The in-app assistant and AI assistants (MCP)',
    demo: () => ['the assistant', 'AI assistants (MCP)'], demoOnly: true,
  },
  {
    id: 'admin', label: 'Administration',
    description: (u) => (owner(u) ? 'Users, invitations and single sign-on' : 'Users and invitations'),
    // The same test as the Users and Members panels (owner and admins).
    visible: (u) => isAdministrator(u),
    demo: (u) => (owner(u) ? ['users and invitations', 'single sign-on'] : ['users and invitations']),
    demoOnly: true,
  },
]

/** The sections this user may see, in overview order. */
export function visibleSections(user: User): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => !s.visible || s.visible(user))
}

/** The section to show for a route's section id, or null for the overview (unknown or not visible to this role). */
export function resolveSection(user: User, id: SettingsSectionId | undefined): SettingsSection | null {
  if (!id) return null
  return visibleSections(user).find((s) => s.id === id) ?? null
}

/** "a, b and c" for the demo note. */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
