// The Settings sections (OpenSpec `settings-navigation`): one table shared by the
// overview, the side navigation, the section pages and the tests.
import { isAdministrator } from '../lib/roles'
import type { User } from '../lib/types'
import type { IconName } from '../ui'
import type { SettingsSectionId } from './router'

export type SettingsGroupId = 'you' | 'app' | 'data' | 'server'

/** The overview's and side navigation's groups, in order (settings-redesign D1). */
export const SETTINGS_GROUPS: readonly { id: SettingsGroupId; label: string }[] = [
  { id: 'you', label: 'You' },
  { id: 'app', label: 'App' },
  { id: 'data', label: 'Data and connections' },
  { id: 'server', label: 'Server' },
]

export interface SettingsSection {
  id: SettingsSectionId
  label: string
  group: SettingsGroupId
  icon: IconName
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
  { id: 'account', label: 'Account', group: 'you', icon: 'user-check', description: () => 'Your profile and signing out of this device' },
  {
    id: 'security', label: 'Security', group: 'you', icon: 'shield-check',
    description: () => 'Password, two-factor authentication, passkeys and linked accounts',
    demo: () => ['password and two-factor authentication', 'passkeys', 'linked accounts'], demoOnly: true,
  },
  {
    id: 'encryption', label: 'Encryption', group: 'you', icon: 'lock',
    description: () => 'End-to-end encryption of your tasks and its recovery key',
    demo: () => ['end-to-end encryption'], demoOnly: true,
  },
  {
    id: 'activity', label: 'Activity', group: 'you', icon: 'history',
    description: (u) => (owner(u) ? 'Recent sign-ins and token changes, and the audit log' : 'Recent sign-ins and token changes on your account'),
  },
  { id: 'preferences', label: 'Preferences', group: 'app', icon: 'settings', description: () => 'Start view, date and time, calendar and keyboard' },
  {
    id: 'notifications', label: 'Notifications', group: 'app', icon: 'bell',
    description: () => 'Push notifications for reminders on this device',
    demo: () => ['push notifications'], demoOnly: true,
  },
  {
    id: 'capture', label: 'Capture', group: 'app', icon: 'send',
    description: () => 'Quick add, voice, the bookmarklet and extension, and email to task',
    demo: () => ['email to task'],
  },
  { id: 'projects', label: 'Projects', group: 'app', icon: 'folder', description: () => 'Automatic archiving and archived projects' },
  {
    id: 'data', label: 'Data', group: 'data', icon: 'download',
    description: () => 'Export, import and sync status',
  },
  {
    id: 'integrations', label: 'Integrations', group: 'data', icon: 'link',
    description: () => 'Calendar apps (CalDAV), webhooks and API tokens',
    demo: () => ['calendar apps (CalDAV)', 'webhooks', 'API tokens'], demoOnly: true,
  },
  {
    id: 'ai', label: 'AI', group: 'data', icon: 'message-circle',
    description: () => 'The in-app assistant and AI assistants (MCP)',
    demo: () => ['the assistant', 'AI assistants (MCP)'], demoOnly: true,
  },
  {
    id: 'admin', label: 'Administration', group: 'server', icon: 'users',
    description: () => 'Users, invitations and members',
    // The same test as the Users and Members panels (owner and admins).
    visible: (u) => isAdministrator(u),
    demo: () => ['users and invitations'], demoOnly: true,
  },
  {
    id: 'backups', label: 'Backups', group: 'server', icon: 'upload',
    description: () => 'Scheduled backups, destinations and recent runs',
    visible: owner,
    demo: () => ['backups'], demoOnly: true,
  },
  {
    id: 'access', label: 'Access policies', group: 'server', icon: 'key-round',
    description: () => 'Two-factor policy, single sign-on and project invite links',
    visible: owner,
    demo: () => ['the two-factor policy', 'single sign-on', 'project invite links'], demoOnly: true,
  },
]

/** The sections this user may see, in overview order. */
export function visibleSections(user: User): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => !s.visible || s.visible(user))
}

/** Visible sections grouped for the overview and side navigation; empty groups are omitted. */
export function groupedSections(user: User): { group: (typeof SETTINGS_GROUPS)[number]; sections: SettingsSection[] }[] {
  const visible = visibleSections(user)
  return SETTINGS_GROUPS.map((group) => ({ group, sections: visible.filter((s) => s.group === group.id) })).filter((g) => g.sections.length > 0)
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
