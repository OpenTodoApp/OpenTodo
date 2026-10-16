// The settings search index (OpenSpec change ux-overhaul, settings-navigation
// "Settings search"): every section and the rows people look for, with the id of
// the element that scrolls into view and takes focus when a result is opened. The
// settings list's search field and the command palette read the same table.
import type { User } from '../lib/types'
import { matchPrepared, prepare, prepareQuery } from '../ui'
import type { SettingsSectionId } from './router'
import { resolveSection, type SettingsSection, visibleSections } from './settingsSections'

export interface SettingsEntry {
  section: SettingsSectionId
  /** The row or card as people name it ("Passkeys", "First day of the week"). */
  label: string
  description: string
  /** id of the row, card heading or group wrapper inside the section page. */
  anchor: string
  /** Words the entry also matches on, never shown. */
  keywords?: string
  /** Who sees the row; the section's own visibility applies first. */
  visible?: (user: User) => boolean
}

const owner = (u: User) => u.role === 'owner'

export const SETTINGS_INDEX: readonly SettingsEntry[] = [
  // Account
  { section: 'account', label: 'Profile', description: 'Your name, email and role', anchor: 'profile' },
  { section: 'account', label: 'Sign out of this device', description: 'Removes your tasks from this device after uploading pending changes', anchor: 'session-heading', keywords: 'logout log out' },
  { section: 'account', label: 'Password', description: 'Change your password', anchor: 'password-heading' },
  { section: 'account', label: 'Two-factor authentication', description: 'A code from your phone on top of your password, and recovery codes', anchor: 'mfa-heading', keywords: '2fa totp mfa' },
  { section: 'account', label: 'Passkeys', description: 'Sign in with your fingerprint, face or device PIN', anchor: 'security-heading', keywords: 'webauthn passkey' },
  { section: 'account', label: 'Linked accounts', description: 'Single sign-on identities linked to your account', anchor: 'linked-heading', keywords: 'sso oidc' },
  { section: 'account', label: 'End-to-end encryption', description: 'Encrypt your task text on your devices, and keep its recovery key', anchor: 'e2ee-heading', keywords: 'e2ee passphrase recovery key' },
  { section: 'account', label: 'Recent activity', description: 'Sign-ins and token changes on your account over the last 90 days', anchor: 'activity-heading', keywords: 'sessions sign-ins' },
  // Appearance
  { section: 'appearance', label: 'Mode', description: 'System, light or dark', anchor: 'appearance-mode', keywords: 'dark light theme' },
  { section: 'appearance', label: 'Theme', description: 'The colour of buttons, links and selection', anchor: 'appearance-theme', keywords: 'accent colour color' },
  { section: 'appearance', label: 'Density', description: 'Comfortable or compact rows', anchor: 'appearance-density', keywords: 'compact rows' },
  { section: 'appearance', label: 'Sidebar destinations', description: 'Which of Anytime, Someday, Assigned to me, Completed, Updates, Trash and Filter sit next to Inbox, Today, Upcoming and Calendar', anchor: 'sidebar-heading', keywords: 'promote more group' },
  // General
  { section: 'general', label: 'Start view', description: 'The view this device opens on', anchor: 'start-view-heading', keywords: 'launch open on' },
  { section: 'general', label: 'Date format', description: 'Day-month, month-day or ISO', anchor: 'date-time-heading' },
  { section: 'general', label: 'Time format', description: '12-hour or 24-hour', anchor: 'date-time-heading', keywords: 'clock' },
  { section: 'general', label: 'First day of the week', description: 'Where the Week view and calendars start', anchor: 'date-time-heading', keywords: 'week start monday sunday' },
  { section: 'general', label: 'Calendar grid', description: 'When the Day and Week grid starts and ends, and your day length', anchor: 'calendar-heading', keywords: 'capacity hours' },
  { section: 'general', label: 'Show shortcut hints', description: 'Print the keys in the app, next to quick add and in prompts', anchor: 'shortcut-hints', keywords: 'keyboard shortcuts kbd badges' },
  { section: 'general', label: 'Vim keybindings', description: 'Keyboard navigation with hjkl', anchor: 'keyboard-heading', keywords: 'keyboard shortcuts' },
  // Notifications
  { section: 'notifications', label: 'Push notifications', description: 'Reminders delivered to this device, and a test', anchor: 'notifications-heading', keywords: 'reminders' },
  { section: 'notifications', label: 'Weekly digest', description: 'An email on your review day with last week\'s numbers', anchor: 'email-digest-heading', keywords: 'email summary review statistics' },
  // Capture
  { section: 'capture', label: 'Quick add', description: 'Natural-language parsing, its languages and the date order', anchor: 'quick-add-heading', keywords: 'natural language parsing' },
  { section: 'capture', label: 'Voice capture', description: 'Dictate tasks into quick add', anchor: 'voice-settings-heading', keywords: 'dictation microphone' },
  { section: 'capture', label: 'Bookmarklet and extension', description: 'Save the page you are reading as a task', anchor: 'capture-heading', keywords: 'browser' },
  { section: 'capture', label: 'Email to task', description: 'Your secret address; emails sent there become tasks', anchor: 'email-inbox-heading', keywords: 'mail inbox' },
  // Integrations
  { section: 'integrations', label: 'Calendar apps (CalDAV)', description: 'See your tasks in calendar and reminder apps with an app password', anchor: 'caldav-heading', keywords: 'caldav app password' },
  { section: 'integrations', label: 'Calendar feeds', description: 'Show your other calendars beside your tasks, and subscribe to your tasks from a calendar app', anchor: 'calendar-feeds-heading', keywords: 'ics subscribe google outlook apple calendar' },
  { section: 'integrations', label: 'Webhooks', description: 'Send a message to another service when tasks change', anchor: 'webhooks-heading' },
  { section: 'integrations', label: 'API tokens', description: 'Keys for scripts and the command-line client', anchor: 'tokens-heading', keywords: 'api key cli' },
  { section: 'integrations', label: 'Assistant', description: 'The in-app assistant: consent, provider, model and usage', anchor: 'ai', keywords: 'ai llm anthropic openai gemini' },
  { section: 'integrations', label: 'AI assistants (MCP)', description: 'Read-only access for an AI assistant, or a token that can make changes', anchor: 'assistants-heading', keywords: 'mcp claude' },
  // Data
  { section: 'data', label: 'Export', description: 'Download everything as JSON, or with files as a ZIP', anchor: 'data-heading', keywords: 'backup download json zip' },
  { section: 'data', label: 'Import', description: 'Bring in tasks from a file or another app', anchor: 'data-heading', keywords: 'todoist things ticktick linear csv' },
  { section: 'data', label: 'Sync status', description: 'This device’s sync state', anchor: 'data-heading', keywords: 'offline pending' },
  { section: 'data', label: 'Automatic archiving', description: 'Archive projects after 30 days without open tasks, and restore archived projects', anchor: 'projects-heading', keywords: 'archive archived projects' },
  // People
  { section: 'people', label: 'Users', description: 'Everyone with an account, their role and last sign-in', anchor: 'users-heading', keywords: 'admin deactivate reset password' },
  { section: 'people', label: 'Members', description: 'Invite people with a single-use link', anchor: 'members-heading', keywords: 'invite invitation' },
  { section: 'people', label: 'Two-factor policy', description: 'Optional, required for the owner, or required for everyone', anchor: 'mfa-policy-heading', visible: owner, keywords: '2fa mfa policy' },
  { section: 'people', label: 'Single sign-on', description: 'Sign in through your identity provider', anchor: 'sso-heading', visible: owner, keywords: 'sso oidc' },
  { section: 'people', label: 'Project invite links', description: 'Whether members can bring new people with project links', anchor: 'project-invite-policy-heading', visible: owner, keywords: 'invite policy' },
  // Server
  { section: 'server', label: 'Backups', description: 'Scheduled backups, destinations, recent runs and restore', anchor: 'backups-heading', keywords: 's3 webdav restore' },
  { section: 'server', label: 'Attachments', description: 'Turn attachments on or off and set their size limits', anchor: 'attachments-settings-heading', keywords: 'files upload limit quota' },
  { section: 'server', label: 'Outgoing email', description: 'The SMTP server this server mails password resets, sign-up confirmations and invitations through, and a test message', anchor: 'outgoing-email-heading', keywords: 'smtp mail sender send test email forgot password' },
  { section: 'server', label: 'Audit log', description: 'What changed on the server and who did it', anchor: 'audit-heading', keywords: 'audit' },
]

/** The entries this user may open, in list order. */
export function visibleEntries(user: User): SettingsEntry[] {
  const sections = new Set(visibleSections(user).map((s) => s.id))
  return SETTINGS_INDEX.filter((e) => sections.has(e.section) && (!e.visible || e.visible(user)))
}

export interface SettingsHit { section: SettingsSection; entries: SettingsEntry[] }

/** Sections and rows matching a query, grouped by section in list order. */
export function searchSettings(query: string, user: User): SettingsHit[] {
  const q = prepareQuery(query)
  if (!q.q) return []
  const out: SettingsHit[] = []
  for (const section of visibleSections(user)) {
    const own = matchPrepared(q, prepare(section.label, section.description(user)), section.label.length).tier > 0
    const rows = visibleEntries(user).filter((e) => e.section === section.id && matchPrepared(q, prepare(e.label, `${e.description} ${e.keywords ?? ''}`), e.label.length).tier > 0)
    if (own || rows.length) out.push({ section, entries: rows })
  }
  return out
}

/** The entry for a section and anchor, if any. */
export function entryFor(user: User, section: SettingsSectionId, anchor: string): SettingsEntry | undefined {
  return resolveSection(user, section) ? visibleEntries(user).find((e) => e.section === section && e.anchor === anchor) : undefined
}

// The element to scroll to and focus once the section page renders (settings
// search, the palette): handed over out of band because the address carries only
// the section.
let pending: string | null = null

export function requestSettingsFocus(anchor: string): void {
  pending = anchor
}

export function takeSettingsFocus(): string | null {
  const a = pending
  pending = null
  return a
}
