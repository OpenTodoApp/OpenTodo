// The Settings sections (OpenSpec change ux-overhaul, settings-navigation; design
// D6): one table of sections in four groups, shared by the section list, the
// pages, the search index, the palette and the tests. A long section is an
// overview of sub-pages (OpenSpec change settings-subpages, design D1), each at
// /settings/<section>/<page>.
import { getHosted } from '../lib/hosted'
import { isAdministrator } from '../lib/roles'
import type { User } from '../lib/types'
import type { IconName } from '../ui'
import type { SettingsSectionId } from './router'
import { t, msg, translatedList, currentLanguage, currentLocale } from '../lib/i18n'

export type SettingsGroupId = 'you' | 'app' | 'data' | 'server'

/** The list's groups, in order. */
export const SETTINGS_GROUPS: readonly { id: SettingsGroupId; label: string }[] = translatedList([
  { id: 'you' as const, label: msg('You') },
  { id: 'app' as const, label: msg('App') },
  { id: 'data' as const, label: msg('Data') },
  { id: 'server' as const, label: msg('Server') },
], 'label')

/** One sub-page of a section (settings-subpages D1): a row on the overview, a page at /settings/<section>/<id>. */
export interface SettingsPage {
  id: string
  label: string
  icon: IconName
  /** Who sees it, after the section's own visibility; everyone when absent. `hosted` is the multi-tenant-host flag. */
  visible?: (user: User, hosted: boolean) => boolean
  /** Features the demo instance refuses on this page (named in its note). */
  demo?: readonly string[]
  /** The page's Help screen; the section's when absent. */
  help?: string
  /** Ids of earlier anchors inside the section that now open this page (legacy addresses and links). */
  anchors?: readonly string[]
}

export interface SettingsSection {
  id: SettingsSectionId
  label: string
  group: SettingsGroupId
  icon: IconName
  /** One line in the list saying what the section holds, for this viewer. */
  description: (user: User) => string
  /** Who sees the section; everyone when absent. */
  visible?: (user: User) => boolean
  /** Features the demo instance refuses here: named in the page's note, their controls disabled. Derived from the pages when it has them. */
  demo?: (user: User) => string[]
  /** The sub-pages, in overview order; a section without them is one page. */
  pages?: readonly SettingsPage[]
}

const owner = (u: User) => u.role === 'owner'
const ownsServer = (u: User, hosted: boolean) => owner(u) && !hosted
const page = (p: SettingsPage): SettingsPage => p
const pages = (list: SettingsPage[]): readonly SettingsPage[] => translatedList<SettingsPage, 'label'>(list, 'label')

export const SETTINGS_SECTIONS: readonly SettingsSection[] = translatedList<SettingsSection, 'label'>([
  {
    id: 'account', label: msg('Account'), group: 'you', icon: 'user-check',
    description: () => t('Profile, security, sessions and encryption'),
    pages: pages([
      page({ id: 'profile', label: msg('Profile'), icon: 'user-round', help: 'settings/account', anchors: ['profile', 'how-you-work'] }),
      page({ id: 'security', label: msg('Security'), icon: 'shield-check', help: 'settings/security', anchors: ['security', 'session'],
        demo: [msg('password and two-factor authentication'), msg('passkeys'), msg('linked accounts')] }),
      page({ id: 'activity', label: msg('Recent activity'), icon: 'history', help: 'settings/activity', anchors: ['sessions'] }),
      page({ id: 'encryption', label: msg('End-to-end encryption'), icon: 'lock', help: 'settings/encryption', anchors: ['encryption'], demo: [msg('end-to-end encryption')] }),
    ]),
  },
  // workspaces: the account's workspaces, their members, groups and invite links.
  {
    id: 'workspaces', label: msg('Workspaces'), group: 'you', icon: 'layers',
    description: () => t('Workspaces, their members, groups and invite links'),
    demo: () => [msg('workspaces')],
  },
  {
    id: 'appearance', label: msg('Appearance'), group: 'you', icon: 'palette', description: () => t('Light or dark, colour theme, density and the sidebar'),
    pages: pages([
      page({ id: 'theme', label: msg('Theme and density'), icon: 'palette' }),
      page({ id: 'sidebar', label: msg('Sidebar'), icon: 'panel-left-open' }),
    ]),
  },
  {
    id: 'general', label: msg('General'), group: 'app', icon: 'settings', description: () => t('Start view, briefing, keyboard, focus timer and maps'),
    pages: pages([
      page({ id: 'start', label: msg('Start view and briefing'), icon: 'house', help: 'settings/start-view' }),
      page({ id: 'keyboard', label: msg('Keyboard'), icon: 'keyboard', help: 'settings/keyboard' }),
      page({ id: 'focus', label: msg('Focus timer'), icon: 'timer', help: 'settings/focus' }),
      page({ id: 'maps', label: msg('Maps'), icon: 'map', help: 'settings/general' }),
    ]),
  },
  {
    id: 'language', label: msg('Language and region'), group: 'app', icon: 'languages', description: () => t('Language, date and time formats, the first day of the week and the calendar grid'),
    pages: pages([
      page({ id: 'language', label: msg('Language'), icon: 'languages', help: 'settings/language' }),
      page({ id: 'date-time', label: msg('Date and time'), icon: 'clock', help: 'settings/date-time' }),
      page({ id: 'calendar', label: msg('Calendar grid'), icon: 'calendar-days', help: 'settings/calendar' }),
    ]),
  },
  {
    id: 'notifications', label: msg('Notifications'), group: 'app', icon: 'bell',
    description: () => t('Push notifications for reminders on this device, delivery channels and the weekly digest'),
    pages: pages([
      page({ id: 'push', label: msg('Push notifications'), icon: 'bell', help: 'settings/notifications', demo: [msg('push notifications')] }),
      page({ id: 'channels', label: msg('Delivery channels'), icon: 'send', help: 'settings/notification-channels' }),
      page({ id: 'digest', label: msg('Weekly digest'), icon: 'mail', help: 'settings/digest', demo: [msg('the weekly digest')] }),
    ]),
  },
  {
    id: 'capture', label: msg('Capture'), group: 'app', icon: 'send',
    description: () => t('Quick add, voice, the bookmarklet and extension, and email to task'),
    pages: pages([
      page({ id: 'quick-add', label: msg('Quick add'), icon: 'zap', help: 'settings/quick-add' }),
      page({ id: 'voice', label: msg('Voice capture'), icon: 'mic', help: 'settings/voice' }),
      page({ id: 'browser', label: msg('Bookmarklet and extension'), icon: 'globe', help: 'settings/capture' }),
      page({ id: 'email', label: msg('Email to task'), icon: 'mail', help: 'settings/email', demo: [msg('email to task')] }),
    ]),
  },
  // welcome-note: the version, docs, website, feedback and support links.
  { id: 'about', label: msg('About'), group: 'app', icon: 'heart', description: () => t('Version, documentation, website, feedback and support') },
  {
    id: 'integrations', label: msg('Integrations'), group: 'data', icon: 'link',
    description: () => t('Calendar apps (CalDAV), calendar feeds, issues, webhooks, API tokens, the assistant and AI assistants (MCP)'),
    pages: pages([
      page({ id: 'caldav', label: msg('Calendar apps (CalDAV)'), icon: 'calendar-sync', help: 'settings/caldav', demo: [msg('calendar apps (CalDAV)')] }),
      page({ id: 'calendar-feeds', label: msg('Calendar feeds'), icon: 'rss', help: 'settings/calendar-feeds', demo: [msg('calendar feeds')] }),
      page({ id: 'issues', label: msg('Issues'), icon: 'git-pull-request', help: 'settings/issues' }),
      page({ id: 'webhooks', label: msg('Webhooks'), icon: 'webhook', help: 'settings/webhooks', demo: [msg('webhooks')] }),
      page({ id: 'tokens', label: msg('API tokens'), icon: 'key', help: 'settings/tokens', demo: [msg('API tokens')] }),
      page({ id: 'assistant', label: msg('Assistant'), icon: 'sparkles', help: 'settings/assistant', anchors: ['ai'], demo: [msg('the assistant')] }),
      page({ id: 'mcp', label: msg('AI assistants (MCP)'), icon: 'bot', help: 'settings/assistants', demo: [msg('AI assistants (MCP)')] }),
    ]),
  },
  { id: 'data', label: msg('Data'), group: 'data', icon: 'download', description: () => t('Export, import, sync status and archived projects') },
  {
    id: 'people', label: msg('People'), group: 'server', icon: 'users',
    description: (u) => (owner(u) ? (getHosted() ? t('Users, invitations, members and access policies') : t('Users, invitations, members, access policies and single sign-on')) : t('Users, invitations and members')),
    visible: (u) => isAdministrator(u),
    pages: pages([
      page({ id: 'users', label: msg('Users and invitations'), icon: 'users', help: 'settings/users', demo: [msg('users and invitations')] }),
      page({ id: 'access-policies', label: msg('Access policies'), icon: 'shield-check', help: 'settings/access', anchors: ['access-policies'], visible: owner,
        demo: [msg('the two-factor policy'), msg('project invite links')] }),
      page({ id: 'sso', label: msg('Single sign-on'), icon: 'key-round', help: 'settings/sso', visible: ownsServer, demo: [msg('single sign-on')] }),
    ]),
  },
  {
    id: 'server', label: msg('Server'), group: 'server', icon: 'upload',
    description: () => (getHosted() ? t('Download your data, branding, maps, automations and the audit log') : t('Backups, attachments, outgoing email, branding, maps, automations, speech to text and the audit log')),
    visible: owner,
    pages: pages([
      page({ id: 'backups', label: msg('Backups'), icon: 'archive', help: 'settings/backups', visible: ownsServer, demo: [msg('backups')] }),
      page({ id: 'download', label: msg('Download your data'), icon: 'download', help: 'settings/server', visible: (_, hosted) => hosted }),
      page({ id: 'attachments', label: msg('Attachments'), icon: 'paperclip', help: 'settings/attachments', visible: ownsServer }),
      page({ id: 'outgoing-email', label: msg('Outgoing email'), icon: 'mail', help: 'settings/outgoing-email', visible: ownsServer, demo: [msg('outgoing email')] }),
      page({ id: 'branding', label: msg('Branding'), icon: 'palette', help: 'settings/branding' }),
      page({ id: 'maps', label: msg('Maps'), icon: 'map', help: 'settings/server' }),
      page({ id: 'automations', label: msg('Automations'), icon: 'zap', help: 'settings/server' }),
      page({ id: 'speech', label: msg('Speech to text'), icon: 'audio-lines', help: 'settings/server', visible: ownsServer }),
      page({ id: 'audit', label: msg('Audit log'), icon: 'scroll-text', help: 'settings/server', anchors: ['audit-log'] }),
    ]),
  },
], 'label')

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

/**
 * The sub-pages this viewer sees in a section. A section with one visible page
 * (an admin's People) has no overview: it is that page, so the list is empty.
 */
export function visiblePages(user: User, section: SettingsSection, hosted = getHosted()): SettingsPage[] {
  const list = (section.pages ?? []).filter((p) => !p.visible || p.visible(user, hosted))
  return list.length > 1 ? list : []
}

/** The pages a section with one visible page renders as itself (see visiblePages). */
export function soleVisiblePage(user: User, section: SettingsSection, hosted = getHosted()): SettingsPage | null {
  const list = (section.pages ?? []).filter((p) => !p.visible || p.visible(user, hosted))
  return list.length === 1 ? list[0] : null
}

/** The sub-page for a route's page id, or null (none, unknown, or not visible). */
export function resolvePage(user: User, section: SettingsSection, id: string | undefined, hosted = getHosted()): SettingsPage | null {
  if (!id) return null
  return visiblePages(user, section, hosted).find((p) => p.id === id) ?? null
}

/** Features the demo refuses in a section or one of its pages, for the note at the top. */
export function demoFeatures(user: User, section: SettingsSection, current?: SettingsPage | null, hosted = getHosted()): string[] {
  if (current) return [...(current.demo ?? [])]
  if (section.pages) {
    const all = (section.pages ?? []).filter((p) => !p.visible || p.visible(user, hosted))
    return all.flatMap((p) => [...(p.demo ?? [])])
  }
  return section.demo?.(user) ?? []
}

/** "a, b and c" for the demo note; other languages use their own list pattern. */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (currentLanguage() !== 'en' && typeof Intl.ListFormat === 'function') return new Intl.ListFormat(currentLocale(), { type: 'conjunction' }).format(items)
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
