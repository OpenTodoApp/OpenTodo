// The Settings sections (OpenSpec change ux-overhaul, settings-navigation; design
// D6): one table of nine sections in four groups, shared by the section list, the
// pages, the search index, the palette and the tests.
import { isAdministrator } from '../lib/roles'
import type { User } from '../lib/types'
import type { IconName } from '../ui'
import type { SettingsSectionId } from './router'

export type SettingsGroupId = 'you' | 'app' | 'data' | 'server'

/** The list's groups, in order. */
export const SETTINGS_GROUPS: readonly { id: SettingsGroupId; label: string }[] = [
  { id: 'you', label: 'You' },
  { id: 'app', label: 'App' },
  { id: 'data', label: 'Data' },
  { id: 'server', label: 'Server' },
]

export interface SettingsSection {
  id: SettingsSectionId
  label: string
  group: SettingsGroupId
  icon: IconName
  /** One line in the list saying what the section holds, for this viewer. */
  description: (user: User) => string
  /** Who sees the section; everyone when absent. */
  visible?: (user: User) => boolean
  /** Features the demo instance refuses here: named in the page's note, their controls disabled. */
  demo?: (user: User) => string[]
}

const owner = (u: User) => u.role === 'owner'

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: 'account', label: 'Account', group: 'you', icon: 'user-check',
    description: () => 'Profile, sessions, password, two-factor, passkeys, linked accounts and encryption',
    demo: () => ['password and two-factor authentication', 'passkeys', 'linked accounts', 'end-to-end encryption'],
  },
  { id: 'appearance', label: 'Appearance', group: 'you', icon: 'palette', description: () => 'Light or dark, colour theme, density and the sidebar' },
  { id: 'general', label: 'General', group: 'app', icon: 'settings', description: () => 'Start view, date and time, calendar and keyboard' },
  {
    id: 'notifications', label: 'Notifications', group: 'app', icon: 'bell',
    description: () => 'Push notifications for reminders on this device',
    demo: () => ['push notifications'],
  },
  {
    id: 'capture', label: 'Capture', group: 'app', icon: 'send',
    description: () => 'Quick add, voice, the bookmarklet and extension, and email to task',
    demo: () => ['email to task'],
  },
  {
    id: 'integrations', label: 'Integrations', group: 'data', icon: 'link',
    description: () => 'Calendar apps (CalDAV), webhooks, API tokens, the assistant and AI assistants (MCP)',
    demo: () => ['calendar apps (CalDAV)', 'webhooks', 'API tokens', 'the assistant', 'AI assistants (MCP)'],
  },
  { id: 'data', label: 'Data', group: 'data', icon: 'download', description: () => 'Export, import, sync status and archived projects' },
  {
    id: 'people', label: 'People', group: 'server', icon: 'users',
    description: (u) => (owner(u) ? 'Users, invitations, members, access policies and single sign-on' : 'Users, invitations and members'),
    visible: (u) => isAdministrator(u),
    demo: (u) => (owner(u) ? ['users and invitations', 'the two-factor policy', 'single sign-on', 'project invite links'] : ['users and invitations']),
  },
  {
    id: 'server', label: 'Server', group: 'server', icon: 'upload',
    description: () => 'Backups, attachments and the audit log',
    visible: owner,
    demo: () => ['backups'],
  },
]

/** The sections this user may see, in list order. */
export function visibleSections(user: User): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => !s.visible || s.visible(user))
}

/** Visible sections grouped for the list; empty groups are omitted. */
export function groupedSections(user: User): { group: (typeof SETTINGS_GROUPS)[number]; sections: SettingsSection[] }[] {
  const visible = visibleSections(user)
  return SETTINGS_GROUPS.map((group) => ({ group, sections: visible.filter((s) => s.group === group.id) })).filter((g) => g.sections.length > 0)
}

/** The section to show for a route's section id, or null (no id, unknown, or not visible to this role). */
export function resolveSection(user: User, id: SettingsSectionId | undefined): SettingsSection | null {
  if (!id) return null
  return visibleSections(user).find((s) => s.id === id) ?? null
}

/** The section `/settings` opens from 1024 px, and the one an unknown or hidden id falls back to. */
export function firstSection(user: User): SettingsSection {
  return visibleSections(user)[0]
}

/** "a, b and c" for the demo note. */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
