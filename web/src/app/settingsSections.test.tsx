// Settings sections (OpenSpec change ux-overhaul, settings-navigation): the nine
// sections in four groups, the routes with their legacy ids, the list and the
// section pages, rendered to static markup like the other component tests.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDemo } from '../lib/demo'
import type { DemoInfo, User } from '../lib/types'
import { canonicalPath, LEGACY_SETTINGS_IDS, parseRoute, routePath, SETTINGS_SECTION_IDS, type SettingsSectionId } from './router'
import { followLink, SettingsList, SettingsView } from './SettingsView'
import { firstSection, groupedSections, joinList, resolveSection, SETTINGS_GROUPS, SETTINGS_SECTIONS } from './settingsSections'

/** The card's markup without its Learn more link, the one help link a card may carry (settings-copy D3). */
const withoutLearnMore = (html: string) => html.replace(/<button[^>]*data-learn-more[^>]*>Learn more<\/button>/g, '')


// The owner-only panels render nothing until the server answers; stand-ins show where they mount.
vi.mock('./SsoPanel', async (orig) => ({ ...(await orig<typeof import('./SsoPanel')>()), SsoPanel: () => <div data-testid="sso-panel" /> }))
vi.mock('./BackupsPanel', async (orig) => ({ ...(await orig<typeof import('./BackupsPanel')>()), BackupsPanel: () => <div data-testid="backups-panel" /> }))

const member: User = { id: 'u1', email: 'sam@example.com', name: 'Sam', role: 'member', createdAt: 1 }
const admin: User = { ...member, id: 'u2', role: 'admin' }
const owner: User = { ...member, id: 'u3', role: 'owner' }
const info: DemoInfo = { token: '', sandboxHours: { idle: 2, max: 24 }, resetsAt: 1 }

const render = (user: User, section?: SettingsSectionId, page?: string, pathname = section ? `/settings/${section}${page ? `/${page}` : ''}` : '/settings') => {
  vi.stubGlobal('location', { origin: 'https://todo.example', search: '', pathname, hash: '' })
  return renderToStaticMarkup(<SettingsView user={user} onLogout={() => {}} section={section} page={page} />)
}

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'https://todo.example', search: '', pathname: '/settings', hash: '' })
})
afterEach(() => {
  setDemo(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const TEN = ['account', 'workspaces', 'appearance', 'general', 'language', 'notifications', 'capture', 'about', 'integrations', 'data', 'people', 'server'] as const

describe('routes', () => {
  it('parses and builds /settings/<section> for the twelve sections', () => {
    expect(SETTINGS_SECTION_IDS).toEqual(TEN)
    for (const id of SETTINGS_SECTION_IDS) {
      expect(parseRoute(`/settings/${id}`)).toEqual({ view: 'settings', section: id })
      expect(routePath({ view: 'settings', section: id })).toBe(`/settings/${id}`)
      expect(routePath(parseRoute(`/settings/${id}`))).toBe(`/settings/${id}`)
    }
  })

  it('opens every legacy id as the section or sub-page that holds its content, replacing the address', () => {
    expect(Object.keys(LEGACY_SETTINGS_IDS).sort()).toEqual(['access', 'activity', 'admin', 'ai', 'backups', 'encryption', 'preferences', 'projects', 'security'])
    expect(parseRoute('/settings/security')).toEqual({ view: 'settings', section: 'account', page: 'security' })
    expect(parseRoute('/settings/encryption')).toEqual({ view: 'settings', section: 'account', page: 'encryption' })
    expect(parseRoute('/settings/activity')).toEqual({ view: 'settings', section: 'account', page: 'activity' })
    expect(parseRoute('/settings/preferences')).toEqual({ view: 'settings', section: 'general' })
    expect(parseRoute('/settings/projects')).toEqual({ view: 'settings', section: 'data', anchor: 'projects' })
    expect(parseRoute('/settings/ai')).toEqual({ view: 'settings', section: 'integrations', page: 'assistant' })
    expect(parseRoute('/settings/admin')).toEqual({ view: 'settings', section: 'people' })
    expect(parseRoute('/settings/access')).toEqual({ view: 'settings', section: 'people', page: 'access-policies' })
    expect(parseRoute('/settings/backups')).toEqual({ view: 'settings', section: 'server', page: 'backups' })
    // The address is rewritten in place to the page that holds the content.
    expect(canonicalPath('/settings/security')).toBe('/settings/account/security')
    expect(canonicalPath('/settings/preferences')).toBe('/settings/general')
    expect(canonicalPath('/settings/general')).toBeNull()
    expect(routePath({ view: 'settings', section: 'data', anchor: 'projects' })).toBe('/settings/data')
  })

  it('parses and builds /settings/<section>/<page> for sub-pages', () => {
    expect(parseRoute('/settings/integrations/webhooks')).toEqual({ view: 'settings', section: 'integrations', page: 'webhooks' })
    expect(routePath({ view: 'settings', section: 'integrations', page: 'webhooks' })).toBe('/settings/integrations/webhooks')
    // A page id is checked by the screen; only the shape is checked here.
    expect(parseRoute('/settings/integrations/Bad%20Id')).toEqual({ view: 'settings', section: 'integrations' })
    expect(parseRoute('/settings/nonsense/webhooks')).toEqual({ view: 'settings' })
  })

  it('keeps the list, the import screen, and sends unknown sections to the list route', () => {
    expect(parseRoute('/settings')).toEqual({ view: 'settings' })
    expect(routePath({ view: 'settings' })).toBe('/settings')
    expect(parseRoute('/settings/import')).toEqual({ view: 'import' })
    expect(routePath({ view: 'import' })).toBe('/settings/import')
    expect(parseRoute('/settings/nonsense')).toEqual({ view: 'settings' })
    expect(parseRoute('/settings/Account')).toEqual({ view: 'settings' })
  })
})

describe('section table', () => {
  it('has one entry per route id, in list order, each in a group with an icon', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual([...SETTINGS_SECTION_IDS])
    for (const s of SETTINGS_SECTIONS) {
      expect(SETTINGS_GROUPS.map((g) => g.id)).toContain(s.group)
      expect(s.icon).toBeTruthy()
    }
  })

  it('groups the ten sections in the stated order per role, omitting empty groups', () => {
    const shape = (u: User) => groupedSections(u).map((g) => [g.group.label, g.sections.map((s) => s.id)])
    expect(shape(owner)).toEqual([
      ['You', ['account', 'workspaces', 'appearance']],
      ['App', ['general', 'language', 'notifications', 'capture', 'about']],
      ['Data', ['integrations', 'data']],
      ['Server', ['people', 'server']],
    ])
    expect(shape(admin).at(-1)).toEqual(['Server', ['people']])
    expect(shape(member).map((g) => g[0])).toEqual(['You', 'App', 'Data'])
    expect(firstSection(member).id).toBe('account')
  })

  it('resolves only sections the role may see', () => {
    expect(resolveSection(member, 'people')).toBeNull()
    expect(resolveSection(admin, 'people')?.label).toBe('People')
    expect(resolveSection(admin, 'server')).toBeNull()
    expect(resolveSection(owner, 'server')?.label).toBe('Server')
    expect(resolveSection(member, undefined)).toBeNull()
  })

  it('describes what each viewer will find', () => {
    const people = SETTINGS_SECTIONS.find((s) => s.id === 'people')!
    expect(people.description(admin)).not.toContain('single sign-on')
    expect(people.description(owner)).toContain('single sign-on')
    expect(SETTINGS_SECTIONS.find((s) => s.id === 'server')!.description(owner)).toContain('audit log')
    expect(SETTINGS_SECTIONS.find((s) => s.id === 'server')!.description(owner)).toContain('outgoing email')
  })

  it('joins lists for the demo note', () => {
    expect(joinList(['a'])).toBe('a')
    expect(joinList(['a', 'b'])).toBe('a and b')
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c')
  })
})

describe('the list', () => {
  /** The list as the whole screen (below 1024 px), with the profile card and the footer. */
  const list = (user: User) => renderToStaticMarkup(<SettingsList user={user} />)

  it('starts with the profile card: initials, name, email and role', () => {
    const html = list(member)
    expect(html).toContain('data-profile-card')
    expect(html).toMatch(/aria-hidden="true">S<\/span>/)
    expect(html).toContain('>Sam</p>')
    expect(html).toContain('>sam@example.com</p>')
    expect(html).toContain('Member')
    expect(list(owner)).toContain('Owner')
  })

  it('beside a page the pane keeps only search and the groups (precision-settings D2)', () => {
    const html = render(member, 'general')
    expect(html).toContain('data-settings-pane')
    expect(html).not.toContain('data-profile-card')
    expect(html).not.toContain('No telemetry, no tracking, no subscription.')
    expect(html).toMatch(/aria-current="page"[^>]*class="[^"]*bg-selected/)
    expect(html).toMatch(/<kbd[^>]*>\/<\/kbd>/)
    expect(html).toContain('data-settings-crumb')
    expect(html).toMatch(/data-settings-page-head[^>]*><p class="text-h1[^"]*">General<\/p>/)
  })

  it('shows the groups as labelled sections, a search field and the footer; no Server group for a member', () => {
    const html = render(member)
    expect(html).toContain('data-settings-list')
    expect(html).toContain('aria-label="Search settings"')
    for (const g of ['you', 'app', 'data']) expect(html).toContain(`aria-labelledby="group-${g}"`)
    expect(html).toContain('>Data</h2>')
    expect(html).not.toContain('group-server')
    expect(render(owner)).toContain('aria-labelledby="group-server"')
    for (const id of ['account', 'appearance', 'general', 'notifications', 'capture', 'integrations', 'data']) expect(html).toContain(`href="/settings/${id}"`)
    for (const id of ['people', 'server']) expect(html).not.toContain(`href="/settings/${id}"`)
    expect(list(member)).toContain('No telemetry, no tracking, no subscription.')
  })

  it('lists People for admins and both Server sections for the owner', () => {
    expect(render(admin)).toContain('href="/settings/people"')
    expect(render(admin)).not.toContain('href="/settings/server"')
    for (const id of ['people', 'server']) expect(render(owner)).toContain(`href="/settings/${id}"`)
  })

  it('on a wide screen the list is the column beside the first section, which is open', () => {
    // Static markup takes the server snapshot of the media query: the two-column layout.
    const html = render(member)
    expect(html).toContain('data-settings-section="account"')
    expect(html).toMatch(/<a href="\/settings\/account" data-settings-link="account" aria-current="page"/)
    expect(html).toMatch(/<h1[^>]*>Account<\/h1>/)
    // Account is an overview of its sub-pages (settings-subpages).
    for (const p of ['profile', 'security', 'activity', 'encryption']) expect(html).toContain(`href="/settings/account/${p}" data-settings-subpage="${p}"`)
    expect(html).not.toContain('data-settings-overview=')
  })
})

describe('opening a section', () => {
  it('follows a plain click without a reload and leaves modified clicks to the browser', () => {
    const pushState = vi.fn()
    vi.stubGlobal('history', { pushState, replaceState: vi.fn() })
    const ev = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn() }
    followLink(ev, { view: 'settings', section: 'capture' })
    expect(ev.preventDefault).toHaveBeenCalled()
    expect(pushState).toHaveBeenLastCalledWith(null, '', '/settings/capture')

    const newTab = { ...ev, metaKey: true, preventDefault: vi.fn() }
    followLink(newTab, { view: 'settings', section: 'integrations' })
    expect(newTab.preventDefault).not.toHaveBeenCalled()
    expect(pushState).toHaveBeenCalledTimes(1)
  })

  it('renders a deep-linked page with its cards and one h1', () => {
    const html = render(member, 'general', 'keyboard')
    expect(html).toContain('data-settings-section="general"')
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toMatch(/<h1[^>]*tabindex="-1"[^>]*>Keyboard<\/h1>/)
    expect(html).toContain('Vim keybindings')
    expect(render(member, 'general', 'start')).toContain('Start view on this device')
    expect(render(member, 'general', 'focus')).toContain('id="focus-heading"')
    // Language, date and time and the calendar grid moved to Language and region (settings-subpages D5).
    expect(render(member, 'language', 'language')).toContain('id="language-heading"')
    expect(render(member, 'language', 'date-time')).toContain('id="date-time-heading"')
    expect(render(member, 'language', 'calendar')).toContain('id="calendar-heading"')
    // Cards of other pages are not on this page.
    expect(html).not.toContain('id="date-time-heading"')
    expect(html).not.toContain('Sign out')
    expect(html).not.toContain('Download export (JSON)')
    expect(html).not.toContain('data-appearance-themes')
  })

  it('lists the sub-pages of each section with an overview, in order', () => {
    const rows = (u: User, id: SettingsSectionId) => [...render(u, id).matchAll(/data-settings-subpage="([a-z-]+)"/g)].map((m) => m[1])
    expect(rows(member, 'account')).toEqual(['profile', 'security', 'activity', 'invitations', 'encryption'])
    expect(rows(member, 'appearance')).toEqual(['theme', 'sidebar', 'task-details'])
    expect(rows(member, 'general')).toEqual(['start', 'keyboard', 'focus', 'maps'])
    expect(rows(member, 'language')).toEqual(['language', 'date-time', 'calendar'])
    expect(rows(member, 'notifications')).toEqual(['push', 'channels', 'digest'])
    expect(rows(member, 'capture')).toEqual(['quick-add', 'voice', 'browser', 'email'])
    expect(rows(member, 'integrations')).toEqual(['caldav', 'calendar-feeds', 'calendar-sync', 'issues', 'webhooks', 'tokens', 'assistant', 'mcp'])
    expect(rows(owner, 'people')).toEqual(['users', 'access-policies', 'sso'])
    expect(rows(owner, 'server')).toEqual(['backups', 'attachments', 'outgoing-email', 'branding', 'maps', 'automations', 'speech', 'audit'])
    for (const id of ['workspaces', 'about', 'data'] as const) expect(rows(member, id)).toEqual([])
    // The overview shows no card of its pages.
    expect(render(owner, 'integrations')).not.toContain('id="webhooks-heading"')
  })

  it('holds the right cards on each page', () => {
    const security = render(member, 'account', 'security')
    for (const id of ['session-heading', 'password-heading', 'mfa-heading']) expect(security).toContain(`id="${id}"`)
    expect(security).toContain('data-settings-anchor="security"')
    expect(security).not.toContain('id="e2ee-heading"')
    expect(render(member, 'account', 'encryption')).toContain('id="e2ee-heading"')
    expect(render(member, 'account', 'activity')).toContain('id="activity-heading"')
    expect(render(member, 'account', 'invitations')).toContain('data-settings-anchor="invitations"')
    expect(render(member, 'account', 'profile')).toContain('data-settings-anchor="how-you-work"')
    const theme = render(member, 'appearance', 'theme')
    expect(theme).toContain('data-appearance-themes')
    expect(theme).toContain('data-testid="appearance-density"')
    expect(theme).not.toContain('id="sidebar-heading"')
    expect(render(member, 'appearance', 'sidebar')).toContain('id="sidebar-someday"')
    const data = render(member, 'data')
    expect(data).toContain('Download export (JSON)')
    expect(data).toContain('href="/settings/import"')
    expect(data).toContain('id="projects-heading"')
    expect(render(owner, 'integrations', 'caldav')).toContain('id="caldav-heading"')
    expect(render(owner, 'integrations', 'webhooks')).toContain('id="webhooks-heading"')
    expect(render(owner, 'integrations', 'tokens')).toContain('id="tokens-heading"')
    expect(render(owner, 'integrations', 'mcp')).toContain('id="assistants-heading"')
    expect(render(owner, 'integrations', 'assistant')).toContain('data-settings-anchor="ai"')
    const users = render(owner, 'people', 'users')
    for (const id of ['users-heading', 'members-heading']) expect(users).toContain(`id="${id}"`)
    const policies = render(owner, 'people', 'access-policies')
    for (const id of ['mfa-policy-heading', 'project-invite-policy-heading']) expect(policies).toContain(`id="${id}"`)
    expect(render(owner, 'people', 'sso')).toContain('data-testid="sso-panel"')
    expect(render(owner, 'server', 'backups')).toContain('data-testid="backups-panel"')
    expect(render(owner, 'server', 'attachments')).toContain('id="attachments-settings-heading"')
    expect(render(owner, 'server', 'outgoing-email')).toContain('id="outgoing-email-heading"')
    expect(render(owner, 'server', 'audit')).toContain('Audit log')
    expect(render(owner, 'people', 'users')).not.toContain('outgoing-email-heading')
  })

  it('a sub-page has the breadcrumb Settings › Section › Page, the page as its h1 and the section marked in the pane', () => {
    const html = render(owner, 'integrations', 'webhooks')
    expect(html).toContain('data-settings-page="webhooks"')
    expect(html).toMatch(/<h1[^>]*>Webhooks<\/h1>/)
    expect(html).toMatch(/data-settings-crumb[\s\S]*>Settings<\/a>[\s\S]*href="\/settings\/integrations"[^>]*data-settings-crumb-section[^>]*>Integrations<\/a>/)
    expect(html).toMatch(/<a href="\/settings\/integrations" data-settings-link="integrations" aria-current="true"/)
    expect(html).toContain('data-help-screen="settings/webhooks"')
  })

  it('marks the current section in the side list and offers a back action below 1024 px', () => {
    const html = render(member, 'data')
    expect(html).toMatch(/<aside class="hidden [^"]*lg:block/)
    expect(html).toMatch(/<a href="\/settings\/data" data-settings-link="data" aria-current="page"/)
    expect(html).toContain('aria-labelledby="group-you"')
    expect(html).not.toContain('group-server')
    expect(html).not.toMatch(/<a href="\/settings\/general" data-settings-link="general" aria-current/)
    expect(html).toMatch(/<a href="\/settings" class="[^"]*lg:hidden[^"]*" data-page-back/)
    expect(html).toContain('data-help-screen="settings/data"')
  })

  it('has no help link or action in any card header', () => {
    const all = withoutLearnMore(TEN.map((id) => render(owner, id)).join('\n'))
    expect(all).not.toContain('data-help-screen="settings/password"')
    expect(all.match(/data-help-screen="settings\/[a-z]+"/g)?.length).toBe(TEN.length)
    // Learn more sits in a card's line, never in its header.
    expect(TEN.map((id) => render(owner, id)).join('\n')).not.toMatch(/<h2[^>]*>[^<]*<button/)
  })
})

describe('roles', () => {
  it('shows a member who opens People the first section instead', () => {
    const html = render(member, 'people')
    expect(html).toContain('data-settings-section="account"')
    expect(html).not.toContain('id="users-heading"')
  })

  it('shows users and members to admins; access policies and the Server section only to the owner', () => {
    // An admin sees one page of People, so People is that page with no overview.
    const html = render(admin, 'people')
    expect(html).toContain('data-settings-section="people"')
    expect(html).toContain('id="users-heading"')
    expect(html).not.toContain('data-settings-subpage')
    expect(html).not.toContain('data-settings-anchor="access-policies"')
    expect(render(admin, 'people', 'access-policies')).not.toContain('data-settings-anchor="access-policies"')
    expect(render(admin, 'server')).toContain('data-settings-section="account"')
    expect(render(owner, 'people', 'access-policies')).toContain('data-testid="mfa-policy-panel"')
  })

  it('links owners from Data to Server', () => {
    expect(render(owner, 'data')).toContain('data-testid="backups-link"')
    expect(render(owner, 'data')).toContain('href="/settings/server/backups"')
    expect(render(admin, 'data')).not.toContain('data-testid="backups-link"')
  })

  it('shows the audit log only to the owner', () => {
    expect(render(owner, 'server', 'audit')).toContain('Audit log')
    expect(render(admin, 'account')).not.toContain('Audit log')
  })
})

describe('demo instance', () => {
  beforeEach(() => setDemo(info))

  it('names everything the pages refuse on the overview, and each page its own, with the cards disabled', () => {
    const html = render(member, 'integrations')
    expect(html.match(/data-testid="demo-restricted"/g)).toHaveLength(1)
    expect(html).toContain('Demo instance: calendar apps (CalDAV), calendar feeds, calendar sync, webhooks, API tokens, the assistant and AI assistants (MCP) are disabled here.')
    const caldav = render(member, 'integrations', 'caldav')
    expect(caldav).toContain('Demo instance: calendar apps (CalDAV) is disabled here.')
    expect(caldav).toContain('id="caldav-heading"')
    expect(caldav).toMatch(/<fieldset disabled=""[^>]*data-demo-disabled/)
    expect(render(member, 'account')).toContain('password and two-factor authentication, passkeys, linked accounts and end-to-end encryption')
    const security = render(member, 'account', 'security')
    expect(security).toContain('Demo instance: password and two-factor authentication, passkeys and linked accounts are disabled here.')
    expect(security).toContain('id="password-heading"')
    // Signing out works: it is outside the disabled group.
    expect(security).toContain('Sign out')
    expect(security.indexOf('id="session-heading"')).toBeGreaterThan(security.lastIndexOf('</fieldset>'))
    // Profile works and has no note.
    expect(render(member, 'account', 'profile')).not.toContain('demo-restricted')
  })

  it('says it in one line with Learn more to the demo guide, and the first card follows at once (settings-copy D6)', () => {
    const account = render(member, 'account')
    const note = /<div data-testid="demo-restricted">([\s\S]*?)<\/div><nav aria-label="Account"/.exec(account)
    expect(note, 'the overview rows directly follow the note').toBeTruthy()
    const text = note![1].replace(/<[^>]+>/g, '')
    expect(text).toBe('Demo instance: password and two-factor authentication, passkeys, linked accounts and end-to-end encryption are disabled here.Learn more')
    expect(note![1]).toContain('data-help-screen="demo"')
    expect(note![1]).toContain('aria-label="Learn more: Demo instance"')
    // One sentence of at most 90 characters plus the list of features, no sandbox paragraph.
    expect(account).not.toContain('2 hours of inactivity')
  })

  it('keeps what works next to the note', () => {
    const browser = render(member, 'capture', 'browser')
    expect(browser).toContain('Copy bookmarklet')
    expect(browser).not.toContain('demo-restricted')
    expect(render(member, 'capture')).toContain('Demo instance: email to task is disabled here.')
    const email = render(member, 'capture', 'email')
    expect(email).toContain('Demo instance: email to task is disabled here.')
    expect(email).toContain('id="email-inbox-heading"')
  })

  it('leaves local settings alone and disables import', () => {
    const general = render(member, 'general', 'keyboard')
    expect(general).not.toContain('demo-restricted')
    expect(general).toContain('Vim keybindings')
    const data = render(member, 'data')
    expect(data).toMatch(/<button[^>]*disabled=""[^>]*>Import data<\/button>/)
    expect(data).toContain('Import: Disabled on this demo instance.')
    expect(data).not.toContain('demo-restricted')
  })
})
