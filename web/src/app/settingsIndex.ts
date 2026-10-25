// The settings search index (OpenSpec change ux-overhaul, settings-navigation
// "Settings search"): every section and the rows people look for, with the id of
// the element that scrolls into view and takes focus when a result is opened. The
// settings list's search field and the command palette read the same table.
import { getHosted } from '../lib/hosted'
import type { User } from '../lib/types'
import { matchPrepared, prepare, prepareQuery } from '../ui'
import { navigate, type Route, type SettingsSectionId } from './router'
import { resolveSection, SETTINGS_SECTIONS, type SettingsSection, visiblePages, visibleSections } from './settingsSections'
import { msg, translatedList } from '../lib/i18n'

export interface SettingsEntry {
  section: SettingsSectionId
  /** The row or card as people name it ("Passkeys", "First day of the week"). */
  label: string
  description: string
  /** The sub-page that holds it (settings-subpages), for a section that has them. */
  page?: string
  /** id of the row, card heading or group wrapper inside the section page. */
  anchor: string
  /** Words the entry also matches on, never shown. */
  keywords?: string
  /** Who sees the row; the section's own visibility applies first. */
  visible?: (user: User) => boolean
  /** On a hosted service (multi-tenant-host): 'managed' rows belong to the operator and are hidden, 'only' rows exist only there. */
  hosted?: 'managed' | 'only'
}

const owner = (u: User) => u.role === 'owner'

export const SETTINGS_INDEX: readonly SettingsEntry[] = translatedList<SettingsEntry, 'label' | 'description'>([
  { section: 'account', label: msg('Profile'), description: msg('Your picture, name and email'), page: 'profile', anchor: 'profile-heading', keywords: 'avatar photo picture rename name email address' },
  { section: 'account', label: msg('Profile'), description: msg('Your name, email and role'), page: 'profile', anchor: 'profile' },
  { section: 'account', label: msg('How you work'), description: msg('Lists only, Companion or Open Loops first: how much the app shows its method'), page: 'profile', anchor: 'how-you-work-heading', keywords: 'open loops gtd method mode loop home' },
  { section: 'account', label: msg('Sign out of this device'), description: msg('Removes your tasks from this device after uploading pending changes'), page: 'security', anchor: 'session-heading', keywords: 'logout log out' },
  { section: 'account', label: msg('Password'), description: msg('Change your password'), page: 'security', anchor: 'password-heading' },
  { section: 'account', label: msg('Two-factor authentication'), description: msg('A code from your phone on top of your password, and recovery codes'), page: 'security', anchor: 'mfa-heading', keywords: '2fa totp mfa' },
  { section: 'account', label: msg('Passkeys'), description: msg('Sign in with your fingerprint, face or device PIN'), page: 'security', anchor: 'security-heading', keywords: 'webauthn passkey' },
  { section: 'account', label: msg('Linked accounts'), description: msg('Single sign-on identities linked to your account'), page: 'security', anchor: 'linked-heading', keywords: 'sso oidc' },
  { section: 'account', label: msg('End-to-end encryption'), description: msg('Encrypt your task text on your devices, and keep its recovery key'), page: 'encryption', anchor: 'e2ee-heading', keywords: 'e2ee passphrase recovery key' },
  { section: 'account', label: msg('Recent activity'), description: msg('Sign-ins and token changes on your account over the last 90 days'), page: 'activity', anchor: 'activity-heading', keywords: 'sessions sign-ins' },
  // Appearance
  { section: 'appearance', label: msg('Mode'), description: msg('System, light or dark'), page: 'theme', anchor: 'appearance-mode', keywords: 'dark light theme' },
  { section: 'appearance', label: msg('Theme'), description: msg('The colour of buttons, links and selection'), page: 'theme', anchor: 'appearance-theme', keywords: 'accent colour color' },
  { section: 'appearance', label: msg('Density'), description: msg('Comfortable or compact rows'), page: 'theme', anchor: 'appearance-density', keywords: 'compact rows' },
  { section: 'appearance', label: msg('Sidebar destinations'), description: msg('Which of Anytime, Someday, Assigned to me, Completed, Updates, Trash and New view sit next to Inbox, Today, Upcoming and Calendar'), page: 'sidebar', anchor: 'sidebar-heading', keywords: 'promote more group' },
  // General
  { section: 'general', label: msg('Start view'), description: msg('The view this device opens on'), page: 'start', anchor: 'start-view-heading', keywords: 'launch open on' },
  { section: 'general', label: msg('Show the briefing'), description: msg('The sentence under the title of Today and Upcoming. On all your devices.'), page: 'start', anchor: 'briefing-heading', keywords: 'briefing summary sentence today upcoming hide' },
  { section: 'general', label: msg('Show shortcut hints'), description: msg('Print the keys in the app, next to quick add and in prompts'), page: 'keyboard', anchor: 'shortcut-hints', keywords: 'keyboard shortcuts kbd badges' },
  { section: 'general', label: msg('Vim keybindings'), description: msg('Keyboard navigation with hjkl'), page: 'keyboard', anchor: 'keyboard-heading', keywords: 'keyboard shortcuts' },
  { section: 'general', label: msg('Focus timer'), description: msg('Pomodoro, Flowtime or Countdown, the lengths, breaks and the sound'), page: 'focus', anchor: 'focus-heading', keywords: 'focus pomodoro flowtime countdown timer session break reminder sound tone' },
  { section: 'general', label: msg('Maps'), description: msg('Maps and address search on your devices'), page: 'maps', anchor: 'maps-user-heading', keywords: 'map location address places' },
  // Language and region (settings-subpages: split from General)
  { section: 'language', label: msg('Language'), description: msg('The language of the app on all your devices'), page: 'language', anchor: 'language-heading', keywords: 'language locale translation sprache langue idioma lingua idioma' },
  { section: 'language', label: msg('Date format'), description: msg('Day-month, month-day or ISO'), page: 'date-time', anchor: 'date-time-heading' },
  { section: 'language', label: msg('Time format'), description: msg('12-hour or 24-hour'), page: 'date-time', anchor: 'date-time-heading', keywords: 'clock' },
  { section: 'language', label: msg('First day of the week'), description: msg('Where the Week view and calendars start'), page: 'date-time', anchor: 'date-time-heading', keywords: 'week start monday sunday' },
  { section: 'language', label: msg('My day starts at'), description: msg('Work done before this time counts for the previous day.'), page: 'date-time', anchor: 'date-time-heading', keywords: 'day start night owl midnight end of day' },
  { section: 'language', label: msg('Calendar grid'), description: msg('When the Day and Week grid starts and ends, and your day length'), page: 'calendar', anchor: 'calendar-heading', keywords: 'capacity hours' },
  // Notifications
  { section: 'notifications', label: msg('Push notifications'), description: msg('Reminders delivered to this device, and a test'), page: 'push', anchor: 'notifications-heading', keywords: 'reminders' },
  { section: 'notifications', label: msg('Delivery channels'), description: msg('Send notifications to ntfy, Pushover, Gotify or any address you choose.'), page: 'channels', anchor: 'notification-channels-heading', keywords: 'ntfy pushover gotify webhook phone' },
  { section: 'notifications', label: msg('Weekly digest'), description: msg('An email on your review day with last week\'s numbers'), page: 'digest', anchor: 'email-digest-heading', keywords: 'email summary review statistics' },
  // About (welcome-note)
  { section: 'about', label: msg('Documentation'), description: msg('The same guides on the website, with setup and self-hosting.'), anchor: 'about-docs', keywords: 'docs help manual guide website version' },
  { section: 'about', label: msg('Share feedback or report a problem'), description: msg('Open an issue on GitHub. Every report is read.'), anchor: 'about-feedback', keywords: 'bug issue github feedback support contact' },
  { section: 'about', label: msg('Community'), description: msg('Questions, ideas and other people who use OpenTodo, on Discord.'), anchor: 'about-community', keywords: 'discord community chat forum people' },
  { section: 'about', label: msg('Buy me a coffee'), description: msg('Support OpenTodo'), anchor: 'about-support-heading', keywords: 'donate sponsor support coffee' },
  { section: 'about', label: msg('Welcome note'), description: msg('The thank-you shown the first time you opened this server.'), anchor: 'about-welcome', visible: owner, keywords: 'thanks welcome' },
  // Capture
  { section: 'capture', label: msg('Quick add'), description: msg('Natural-language parsing, its languages and the date order'), page: 'quick-add', anchor: 'quick-add-heading', keywords: 'natural language parsing' },
  { section: 'capture', label: msg('Voice capture'), description: msg('Dictate tasks into quick add'), page: 'voice', anchor: 'voice-settings-heading', keywords: 'dictation microphone' },
  { section: 'capture', label: msg('Bookmarklet and extension'), description: msg('Save the page you are reading as a task'), page: 'browser', anchor: 'capture-heading', keywords: 'browser' },
  { section: 'capture', label: msg('Email to task'), description: msg('Your secret address; emails sent there become tasks'), page: 'email', anchor: 'email-inbox-heading', keywords: 'mail inbox' },
  // Integrations
  { section: 'integrations', label: msg('Calendar apps (CalDAV)'), description: msg('See your tasks in calendar and reminder apps with an app password'), page: 'caldav', anchor: 'caldav-heading', keywords: 'caldav app password' },
  { section: 'integrations', label: msg('Calendar feeds'), description: msg('Show your other calendars beside your tasks, and subscribe to your tasks from a calendar app'), page: 'calendar-feeds', anchor: 'calendar-feeds-heading', keywords: 'ics subscribe google outlook apple calendar' },
  { section: 'integrations', label: msg('Issues'), description: msg('Open GitHub and GitLab issues assigned to you become tasks that follow them.'), page: 'issues', anchor: 'issues-heading', keywords: 'github gitlab issue import' },
  { section: 'integrations', label: msg('Webhooks'), description: msg('Send a message to another service when tasks change'), page: 'webhooks', anchor: 'webhooks-heading' },
  { section: 'integrations', label: msg('API tokens'), description: msg('Keys for scripts and the command-line client'), page: 'tokens', anchor: 'tokens-heading', keywords: 'api key cli' },
  { section: 'integrations', label: msg('Assistant'), description: msg('The in-app assistant: consent, provider, model and usage'), page: 'assistant', anchor: 'ai', keywords: 'ai llm anthropic openai gemini' },
  { section: 'integrations', label: msg('AI assistants (MCP)'), description: msg('Read-only access for an AI assistant, or a token that can make changes'), page: 'mcp', anchor: 'assistants-heading', keywords: 'mcp claude' },
  // Data
  { section: 'data', label: msg('Export'), description: msg('Download everything as JSON, or with files as a ZIP'), anchor: 'data-heading', keywords: 'backup download json zip' },
  { section: 'data', label: msg('Import'), description: msg('Bring in tasks from a file or another app'), anchor: 'data-heading', keywords: 'todoist things ticktick linear csv' },
  { section: 'data', label: msg('Sync status'), description: msg('This device’s sync state'), anchor: 'data-heading', keywords: 'offline pending' },
  { section: 'data', label: msg('Automatic archiving'), description: msg('Archive projects after 30 days without open tasks, and restore archived projects'), anchor: 'projects-heading', keywords: 'archive archived projects' },
  // People
  { section: 'people', label: msg('Users'), description: msg('Everyone with an account, their role and last sign-in'), page: 'users', anchor: 'users-heading', keywords: 'admin deactivate reset password' },
  { section: 'people', label: msg('Members'), description: msg('Invite people with a single-use link'), page: 'users', anchor: 'members-heading', keywords: 'invite invitation' },
  { section: 'people', label: msg('Two-factor policy'), description: msg('Optional, required for the owner, or required for everyone'), page: 'access-policies', anchor: 'mfa-policy-heading', visible: owner, keywords: '2fa mfa policy' },
  { section: 'people', label: msg('Single sign-on'), description: msg('Sign in through your identity provider'), page: 'sso', anchor: 'sso-heading', visible: owner, keywords: 'sso oidc', hosted: 'managed' },
  { section: 'people', label: msg('Project invite links'), description: msg('Whether members can bring new people with project links'), page: 'access-policies', anchor: 'project-invite-policy-heading', visible: owner, keywords: 'invite policy' },
  // Server
  { section: 'server', label: msg('Backups'), description: msg('Scheduled backups, destinations, recent runs and restore'), page: 'backups', anchor: 'backups-heading', keywords: 's3 webdav restore', hosted: 'managed' },
  { section: 'server', label: msg('Attachments'), description: msg('Turn attachments on or off and set their size limits'), page: 'attachments', anchor: 'attachments-settings-heading', keywords: 'files upload limit quota', hosted: 'managed' },
  { section: 'server', label: msg('Outgoing email'), description: msg('The SMTP server this server mails password resets, sign-up confirmations and invitations through, and a test message'), page: 'outgoing-email', anchor: 'outgoing-email-heading', keywords: 'smtp mail sender send test email forgot password', hosted: 'managed' },
  { section: 'server', label: msg('Download your data'), description: msg('The whole server as one backup archive, to move to your own OpenTodo server'), page: 'download', anchor: 'server-archive-heading', keywords: 'archive export backup leave move self-host', hosted: 'only' },
  { section: 'server', label: msg('Branding'), description: msg('Your own name and logo for this server, in the tab, the app icon and the sidebar'), page: 'branding', anchor: 'branding-heading', keywords: 'logo favicon icon name white label personal brand' },
  { section: 'server', label: msg('Maps'), description: msg('Maps and address search from the provider below, always through this server.'), page: 'maps', anchor: 'maps-server-heading', keywords: 'map tiles geocoder openstreetmap photon address' },
  { section: 'server', label: msg('Automations'), description: msg('Whether automation rules run on this server'), page: 'automations', anchor: 'automations-server-heading', keywords: 'rules automation trigger' },
  { section: 'server', label: msg('Speech to text'), description: msg('Connect a speech service for dictation'), page: 'speech', anchor: 'speech-server-heading', keywords: 'voice dictation whisper speaches stt transcription microphone', hosted: 'managed' },
  { section: 'server', label: msg('Audit settings'), description: msg('How long audit events are kept and whether addresses are recorded'), page: 'audit', anchor: 'audit-settings-heading', keywords: 'retention ip address' },
  { section: 'server', label: msg('Audit log'), description: msg('What changed on the server and who did it'), page: 'audit', anchor: 'audit-heading', keywords: 'audit' },
], 'label', 'description')

/** The entries this user may open, in list order. */
export function visibleEntries(user: User): SettingsEntry[] {
  const sections = new Set(visibleSections(user).map((s) => s.id))
  const hosted = getHosted()
  return SETTINGS_INDEX.filter((e) => sections.has(e.section) && (!e.visible || e.visible(user)) &&
    (e.hosted === 'managed' ? !hosted : e.hosted === 'only' ? hosted : true))
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

/** Where an entry lives for this viewer: its sub-page, or the section when it has no overview (settings-subpages D1). */
export function entryRoute(user: User, e: Pick<SettingsEntry, 'section' | 'page'>): Route & { view: 'settings' } {
  const section = resolveSection(user, e.section)
  const page = section && e.page && visiblePages(user, section).some((p) => p.id === e.page) ? e.page : undefined
  return { view: 'settings', section: e.section, ...(page ? { page } : {}) }
}

/**
 * Where an anchor of an earlier layout now lives (settings-subpages D4): a link
 * such as /settings/integrations#webhooks or /settings/general#date-time-heading
 * opens the sub-page, or the section, that holds it. Matches a sub-page id, a
 * page's earlier wrapper ids, then the index's anchors (same section first).
 */
export function anchorTarget(user: User, section: SettingsSectionId, anchor: string): { section: SettingsSectionId; page?: string; anchor?: string } | null {
  const own = SETTINGS_SECTIONS.find((s) => s.id === section)
  const byPage = own?.pages?.find((p) => p.id === anchor || p.anchors?.includes(anchor))
  if (byPage) return { section, page: byPage.id, ...(byPage.id === anchor || byPage.anchors?.[0] === anchor ? {} : { anchor }) }
  const entries = SETTINGS_INDEX.filter((e) => e.anchor === anchor)
  const e = entries.find((x) => x.section === section) ?? entries[0]
  if (!e) return null
  const r = entryRoute(user, e)
  return { section: r.section!, ...(r.page ? { page: r.page } : {}), anchor }
}

// The element to scroll to, focus and briefly highlight once the page renders
// (settings search, the palette, in-app links): handed over out of band because
// the address carries only the section and sub-page.
let pending: string | null = null

export function requestSettingsFocus(anchor: string): void {
  pending = anchor
}

export function takeSettingsFocus(): string | null {
  const a = pending
  pending = null
  return a
}

/** Opens the page that holds a setting, scrolled to it (settings search, the palette, in-app links). */
export function openSetting(user: User, e: Pick<SettingsEntry, 'section' | 'page'> & { anchor?: string }): void {
  if (e.anchor) requestSettingsFocus(e.anchor)
  navigate(entryRoute(user, e))
}
