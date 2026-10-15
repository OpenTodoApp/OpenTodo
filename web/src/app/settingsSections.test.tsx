// Settings sections (OpenSpec `settings-navigation`): routes, the section table and
// the overview / section pages, rendered to static markup like the other component tests.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDemo } from '../lib/demo'
import type { DemoInfo, User } from '../lib/types'
import { parseRoute, routePath, SETTINGS_SECTION_IDS, type SettingsSectionId } from './router'
import { followLink, SettingsView } from './SettingsView'
import { groupedSections, joinList, resolveSection, SETTINGS_GROUPS, SETTINGS_SECTIONS } from './settingsSections'

// The owner-only panels render nothing until the server answers; stand-ins show where they mount.
vi.mock('./SsoPanel', async (orig) => ({ ...(await orig<typeof import('./SsoPanel')>()), SsoPanel: () => <div data-testid="sso-panel" /> }))
vi.mock('./BackupsPanel', async (orig) => ({ ...(await orig<typeof import('./BackupsPanel')>()), BackupsPanel: () => <div data-testid="backups-panel" /> }))

const member: User = { id: 'u1', email: 'sam@example.com', name: 'Sam', role: 'member', createdAt: 1 }
const admin: User = { ...member, id: 'u2', role: 'admin' }
const owner: User = { ...member, id: 'u3', role: 'owner' }
const info: DemoInfo = { token: '', sandboxHours: { idle: 2, max: 24 }, resetsAt: 1 }

const render = (user: User, section?: SettingsSectionId) =>
  renderToStaticMarkup(<SettingsView user={user} onLogout={() => {}} section={section} />)

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'https://todo.example', search: '', pathname: '/settings', hash: '' })
})
afterEach(() => {
  setDemo(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const ALL_IDS = [
  'account', 'security', 'encryption', 'activity', 'preferences', 'notifications', 'capture', 'projects',
  'data', 'integrations', 'ai', 'admin', 'backups', 'access',
] as const

describe('routes', () => {
  it('parses and builds /settings/<section> for every section', () => {
    expect(SETTINGS_SECTION_IDS).toEqual(ALL_IDS)
    for (const id of SETTINGS_SECTION_IDS) {
      expect(parseRoute(`/settings/${id}`)).toEqual({ view: 'settings', section: id })
      expect(routePath({ view: 'settings', section: id })).toBe(`/settings/${id}`)
      expect(routePath(parseRoute(`/settings/${id}`))).toBe(`/settings/${id}`)
    }
  })

  it('opens the old General address as Preferences', () => {
    expect(parseRoute('/settings/general')).toEqual({ view: 'settings', section: 'preferences' })
    expect(routePath(parseRoute('/settings/general'))).toBe('/settings/preferences')
  })

  it('keeps the overview and the import screen, and sends unknown sections to the overview', () => {
    expect(parseRoute('/settings')).toEqual({ view: 'settings' })
    expect(routePath({ view: 'settings' })).toBe('/settings')
    expect(parseRoute('/settings/import')).toEqual({ view: 'import' })
    expect(routePath({ view: 'import' })).toBe('/settings/import')
    expect(parseRoute('/settings/nonsense')).toEqual({ view: 'settings' })
    expect(parseRoute('/settings/Account')).toEqual({ view: 'settings' })
  })
})

describe('section table', () => {
  it('has one entry per route id, in overview order, each in a group with an icon', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual([...SETTINGS_SECTION_IDS])
    for (const s of SETTINGS_SECTIONS) {
      expect(SETTINGS_GROUPS.map((g) => g.id)).toContain(s.group)
      expect(s.icon).toBeTruthy()
    }
  })

  it('groups and orders sections per role, omitting empty groups', () => {
    const shape = (u: User) => groupedSections(u).map((g) => [g.group.label, g.sections.map((s) => s.id)])
    expect(shape(owner)).toEqual([
      ['You', ['account', 'security', 'encryption', 'activity']],
      ['App', ['preferences', 'notifications', 'capture', 'projects']],
      ['Data and connections', ['data', 'integrations', 'ai']],
      ['Server', ['admin', 'backups', 'access']],
    ])
    expect(shape(admin).at(-1)).toEqual(['Server', ['admin']])
    expect(shape(member).map((g) => g[0])).toEqual(['You', 'App', 'Data and connections'])
  })

  it('resolves only sections the role may see', () => {
    expect(resolveSection(member, 'admin')).toBeNull()
    expect(resolveSection(admin, 'admin')?.label).toBe('Administration')
    expect(resolveSection(admin, 'backups')).toBeNull()
    expect(resolveSection(admin, 'access')).toBeNull()
    expect(resolveSection(owner, 'access')?.label).toBe('Access policies')
    expect(resolveSection(member, undefined)).toBeNull()
  })

  it('describes what each viewer will find', () => {
    const activity = SETTINGS_SECTIONS.find((s) => s.id === 'activity')!
    expect(activity.description(member)).not.toContain('audit log')
    expect(activity.description(owner)).toContain('audit log')
  })

  it('joins lists for the demo note', () => {
    expect(joinList(['a'])).toBe('a')
    expect(joinList(['a', 'b'])).toBe('a and b')
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c')
  })
})

describe('overview', () => {
  it('starts with the profile card: initials, name, email and role', () => {
    const html = render(member)
    expect(html).toContain('data-profile-card')
    expect(html).toMatch(/aria-hidden="true">S<\/span>/)
    expect(html).toContain('>Sam</p>')
    expect(html).toContain('>sam@example.com</p>')
    expect(html).toContain('Member')
    expect(render(owner)).toContain('Owner')
  })

  it('shows the groups as labelled sections, with no Server group for a member', () => {
    const html = render(member)
    for (const g of ['you', 'app', 'data']) expect(html).toContain(`aria-labelledby="group-${g}"`)
    expect(html).toContain('>Data and connections</h2>')
    expect(html).not.toContain('group-server')
    expect(render(owner)).toContain('aria-labelledby="group-server"')
    expect(html).toContain('min-h-14')
  })

  it('lists the sections with descriptions, the account and the footer', () => {
    const html = render(member)
    expect(html).toContain('data-settings-overview')
    expect(html).toMatch(/<h1[^>]*>Settings<\/h1>/)
    for (const id of ['account', 'security', 'encryption', 'activity', 'preferences', 'notifications', 'capture', 'projects', 'data', 'integrations', 'ai']) {
      expect(html).toContain(`href="/settings/${id}"`)
    }
    for (const id of ['admin', 'backups', 'access']) expect(html).not.toContain(`href="/settings/${id}"`)
    expect(html).toContain('Calendar apps (CalDAV), webhooks and API tokens')
    expect(html).toContain('No telemetry, no tracking, no subscription.')
    expect(html).toContain('href="https://github.com/pixari/opentodo"')
    // No panel of any section is on the overview.
    expect(html).not.toContain('id="password-heading"')
    expect(html).not.toContain('Vim keybindings')
  })

  it('lists Administration for admins and every Server section for the owner', () => {
    expect(render(admin)).toContain('href="/settings/admin"')
    expect(render(admin)).not.toContain('href="/settings/backups"')
    for (const id of ['admin', 'backups', 'access']) expect(render(owner)).toContain(`href="/settings/${id}"`)
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
    followLink(newTab, { view: 'settings', section: 'ai' })
    expect(newTab.preventDefault).not.toHaveBeenCalled()
    expect(pushState).toHaveBeenCalledTimes(1)
  })

  it('renders a deep-linked section with its panels and one h1', () => {
    const html = render(member, 'preferences')
    expect(html).toContain('data-settings-section="preferences"')
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toMatch(/<h1[^>]*tabindex="-1"[^>]*>Preferences<\/h1>/)
    expect(html).toContain('Vim keybindings')
    expect(html).toContain('Start view on this device')
    // Panels of other sections are not on this page.
    expect(html).not.toContain('Sign out')
    expect(html).not.toContain('Download export (JSON)')
  })

  it('marks the current section in the side list and offers a back link on phones', () => {
    const html = render(member, 'data')
    expect(html).toMatch(/<nav aria-label="Settings sections" class="hidden [^"]*lg:block/)
    expect(html).toMatch(/<a href="\/settings\/data" aria-current="page"/)
    expect(html).toContain('id="nav-group-data"')
    expect(html).toContain('aria-labelledby="nav-group-you"')
    expect(html).not.toContain('nav-group-server')
    expect(html).not.toMatch(/<a href="\/settings\/preferences" aria-current/)
    expect(html).toMatch(/<a href="\/settings" class="[^"]*lg:hidden[^"]*" data-page-back/)
    expect(html).toContain('Download export (JSON)')
    expect(html).toContain('href="/settings/import"')
  })

  it('keeps every former Help screen id somewhere for the owner', () => {
    const all = ALL_IDS.map((id) => render(owner, id)).join('\n')
    const screens = [
      'settings/assistants', 'settings/attachments', 'settings/caldav', 'settings/calendar', 'settings/capture', 'settings/data',
      'settings/email', 'settings/encryption', 'settings/keyboard', 'settings/members', 'settings/notifications',
      'settings/password', 'settings/project-invites', 'settings/projects', 'settings/quick-add', 'settings/session',
      'settings/sessions', 'settings/start-view', 'settings/tokens', 'settings/two-factor', 'settings/users', 'settings/voice', 'settings/webhooks',
    ]
    const missing = screens.filter((s) => !all.includes(`data-help-screen="${s}"`))
    expect(missing).toEqual([])
    // Not in static markup: the assistant panel is a lazy chunk, and passkeys and linked
    // accounts render only with WebAuthn and single sign-on data; their sections mount them.
    expect(render(owner, 'security')).toContain('data-help-screen="settings/password"')
    // Single sign-on and backups are stand-ins here; their sections mount them.
    expect(render(owner, 'access')).toContain('data-testid="sso-panel"')
    expect(render(owner, 'backups')).toContain('data-testid="backups-panel"')
  })

})

describe('roles', () => {
  it('sends a member who opens Administration to the overview', () => {
    const html = render(member, 'admin')
    expect(html).toContain('data-settings-overview')
    expect(html).not.toContain('id="users-heading"')
  })

  it('shows users and members to admins; access policies and backups only to the owner', () => {
    const html = render(admin, 'admin')
    expect(html).toContain('data-settings-section="admin"')
    expect(html).toContain('id="users-heading"')
    expect(render(admin, 'access')).toContain('data-settings-overview')
    expect(render(admin, 'backups')).toContain('data-settings-overview')
    expect(render(owner, 'access')).toContain('data-testid="mfa-policy-panel"')
  })

  it('links owners from Data to Backups', () => {
    expect(render(owner, 'data')).toContain('data-testid="backups-link"')
    expect(render(admin, 'data')).not.toContain('data-testid="backups-link"')
  })

  it('shows the audit log only to the owner', () => {
    expect(render(owner, 'activity')).toContain('Audit log')
    expect(render(member, 'activity')).not.toContain('Audit log')
  })
})

describe('demo instance', () => {
  beforeEach(() => setDemo(info))

  it('shows only the note in a section the demo refuses entirely', () => {
    const html = render(member, 'integrations')
    expect(html).toContain('data-testid="demo-restricted"')
    expect(html).toContain('calendar apps (CalDAV), webhooks and API tokens are disabled on this demo instance')
    expect(html).not.toContain('id="caldav-heading"')
    expect(html).not.toContain('id="tokens-heading"')
    for (const id of ['security', 'encryption', 'notifications', 'ai'] as const) expect(render(member, id)).toContain('data-testid="demo-restricted"')
    const security = render(member, 'security')
    expect(security).toContain('password and two-factor authentication, passkeys and linked accounts')
    expect(security).not.toContain('id="password-heading"')
  })

  it('keeps what works next to the note', () => {
    expect(render(member, 'account')).toContain('Sign out')
    const capture = render(member, 'capture')
    expect(capture).toContain('Copy bookmarklet')
    expect(capture).toContain('email to task is disabled on this demo instance')
  })

  it('leaves local settings alone and disables import', () => {
    const prefs = render(member, 'preferences')
    expect(prefs).not.toContain('demo-restricted')
    expect(prefs).toContain('Vim keybindings')
    const data = render(member, 'data')
    expect(data).toMatch(/<button[^>]*disabled=""[^>]*>Import data…<\/button>/)
    expect(data).toContain('Import: Disabled on this demo instance.')
    expect(data).not.toContain('demo-restricted')
  })
})
