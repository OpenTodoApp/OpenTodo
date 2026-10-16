// Settings sections (OpenSpec change ux-overhaul, settings-navigation): the nine
// sections in four groups, the routes with their legacy ids, the list and the
// section pages, rendered to static markup like the other component tests.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDemo } from '../lib/demo'
import type { DemoInfo, User } from '../lib/types'
import { canonicalPath, LEGACY_SETTINGS_IDS, parseRoute, routePath, SETTINGS_SECTION_IDS, type SettingsSectionId } from './router'
import { followLink, SettingsView } from './SettingsView'
import { firstSection, groupedSections, joinList, resolveSection, SETTINGS_GROUPS, SETTINGS_SECTIONS } from './settingsSections'

// The owner-only panels render nothing until the server answers; stand-ins show where they mount.
vi.mock('./SsoPanel', async (orig) => ({ ...(await orig<typeof import('./SsoPanel')>()), SsoPanel: () => <div data-testid="sso-panel" /> }))
vi.mock('./BackupsPanel', async (orig) => ({ ...(await orig<typeof import('./BackupsPanel')>()), BackupsPanel: () => <div data-testid="backups-panel" /> }))

const member: User = { id: 'u1', email: 'sam@example.com', name: 'Sam', role: 'member', createdAt: 1 }
const admin: User = { ...member, id: 'u2', role: 'admin' }
const owner: User = { ...member, id: 'u3', role: 'owner' }
const info: DemoInfo = { token: '', sandboxHours: { idle: 2, max: 24 }, resetsAt: 1 }

const render = (user: User, section?: SettingsSectionId, pathname = section ? `/settings/${section}` : '/settings') => {
  vi.stubGlobal('location', { origin: 'https://todo.example', search: '', pathname, hash: '' })
  return renderToStaticMarkup(<SettingsView user={user} onLogout={() => {}} section={section} />)
}

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'https://todo.example', search: '', pathname: '/settings', hash: '' })
})
afterEach(() => {
  setDemo(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const NINE = ['account', 'appearance', 'general', 'notifications', 'capture', 'integrations', 'data', 'people', 'server'] as const

describe('routes', () => {
  it('parses and builds /settings/<section> for the nine sections', () => {
    expect(SETTINGS_SECTION_IDS).toEqual(NINE)
    for (const id of SETTINGS_SECTION_IDS) {
      expect(parseRoute(`/settings/${id}`)).toEqual({ view: 'settings', section: id })
      expect(routePath({ view: 'settings', section: id })).toBe(`/settings/${id}`)
      expect(routePath(parseRoute(`/settings/${id}`))).toBe(`/settings/${id}`)
    }
  })

  it('opens every legacy id as its new section, at the anchor of the moved content, replacing the address', () => {
    expect(Object.keys(LEGACY_SETTINGS_IDS).sort()).toEqual(['access', 'activity', 'admin', 'ai', 'backups', 'encryption', 'preferences', 'projects', 'security'])
    expect(parseRoute('/settings/security')).toEqual({ view: 'settings', section: 'account', anchor: 'security' })
    expect(parseRoute('/settings/encryption')).toEqual({ view: 'settings', section: 'account', anchor: 'encryption' })
    expect(parseRoute('/settings/activity')).toEqual({ view: 'settings', section: 'account', anchor: 'sessions' })
    expect(parseRoute('/settings/preferences')).toEqual({ view: 'settings', section: 'general' })
    expect(parseRoute('/settings/projects')).toEqual({ view: 'settings', section: 'data', anchor: 'projects' })
    expect(parseRoute('/settings/ai')).toEqual({ view: 'settings', section: 'integrations', anchor: 'ai' })
    expect(parseRoute('/settings/admin')).toEqual({ view: 'settings', section: 'people' })
    expect(parseRoute('/settings/access')).toEqual({ view: 'settings', section: 'people', anchor: 'access-policies' })
    expect(parseRoute('/settings/backups')).toEqual({ view: 'settings', section: 'server' })
    // The address is rewritten in place to the section alone.
    expect(canonicalPath('/settings/security')).toBe('/settings/account')
    expect(canonicalPath('/settings/preferences')).toBe('/settings/general')
    expect(canonicalPath('/settings/general')).toBeNull()
    expect(routePath({ view: 'settings', section: 'account', anchor: 'security' })).toBe('/settings/account')
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

  it('groups the nine sections in the stated order per role, omitting empty groups', () => {
    const shape = (u: User) => groupedSections(u).map((g) => [g.group.label, g.sections.map((s) => s.id)])
    expect(shape(owner)).toEqual([
      ['You', ['account', 'appearance']],
      ['App', ['general', 'notifications', 'capture']],
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
  })

  it('joins lists for the demo note', () => {
    expect(joinList(['a'])).toBe('a')
    expect(joinList(['a', 'b'])).toBe('a and b')
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c')
  })
})

describe('the list', () => {
  it('starts with the profile card: initials, name, email and role', () => {
    const html = render(member)
    expect(html).toContain('data-profile-card')
    expect(html).toMatch(/aria-hidden="true">S<\/span>/)
    expect(html).toContain('>Sam</p>')
    expect(html).toContain('>sam@example.com</p>')
    expect(html).toContain('Member')
    expect(render(owner)).toContain('Owner')
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
    expect(html).toContain('No telemetry, no tracking, no subscription.')
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
    expect(html).toContain('id="session-heading"')
    expect(html).not.toContain('data-settings-overview')
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

  it('renders a deep-linked section with its cards and one h1', () => {
    const html = render(member, 'general')
    expect(html).toContain('data-settings-section="general"')
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toMatch(/<h1[^>]*tabindex="-1"[^>]*>General<\/h1>/)
    expect(html).toContain('Vim keybindings')
    expect(html).toContain('Start view on this device')
    expect(html).toContain('id="date-time-heading"')
    // Cards of other sections are not on this page.
    expect(html).not.toContain('Sign out')
    expect(html).not.toContain('Download export (JSON)')
    expect(html).not.toContain('data-appearance-themes')
  })

  it('holds the right cards in each section', () => {
    const account = render(member, 'account')
    for (const id of ['session-heading', 'password-heading', 'mfa-heading', 'e2ee-heading', 'activity-heading']) expect(account).toContain(`id="${id}"`)
    for (const id of ['security', 'encryption', 'sessions']) expect(account).toContain(`data-settings-anchor="${id}"`)
    expect(account).not.toContain('Audit log')
    const appearance = render(member, 'appearance')
    expect(appearance).toContain('data-appearance-themes')
    expect(appearance).toContain('data-testid="appearance-density"')
    expect(appearance).toContain('id="sidebar-heading"')
    expect(appearance).toContain('id="sidebar-someday"')
    const data = render(member, 'data')
    expect(data).toContain('Download export (JSON)')
    expect(data).toContain('href="/settings/import"')
    expect(data).toContain('id="projects-heading"')
    const integrations = render(owner, 'integrations')
    for (const id of ['caldav-heading', 'webhooks-heading', 'tokens-heading', 'assistants-heading']) expect(integrations).toContain(`id="${id}"`)
    expect(integrations).toContain('data-settings-anchor="ai"')
    const people = render(owner, 'people')
    for (const id of ['users-heading', 'members-heading', 'mfa-policy-heading', 'project-invite-policy-heading']) expect(people).toContain(`id="${id}"`)
    expect(people).toContain('data-testid="sso-panel"')
    const server = render(owner, 'server')
    expect(server).toContain('data-testid="backups-panel"')
    expect(server).toContain('id="attachments-settings-heading"')
    expect(server).toContain('Audit log')
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
    const all = NINE.map((id) => render(owner, id)).join('\n')
    expect(all).not.toContain('data-help-screen="settings/password"')
    expect(all.match(/data-help-screen="settings\/[a-z]+"/g)?.length).toBe(NINE.length)
  })
})

describe('roles', () => {
  it('shows a member who opens People the first section instead', () => {
    const html = render(member, 'people')
    expect(html).toContain('data-settings-section="account"')
    expect(html).not.toContain('id="users-heading"')
  })

  it('shows users and members to admins; access policies and the Server section only to the owner', () => {
    const html = render(admin, 'people')
    expect(html).toContain('data-settings-section="people"')
    expect(html).toContain('id="users-heading"')
    expect(html).not.toContain('data-settings-anchor="access-policies"')
    expect(render(admin, 'server')).toContain('data-settings-section="account"')
    expect(render(owner, 'people')).toContain('data-testid="mfa-policy-panel"')
  })

  it('links owners from Data to Server', () => {
    expect(render(owner, 'data')).toContain('data-testid="backups-link"')
    expect(render(owner, 'data')).toContain('href="/settings/server"')
    expect(render(admin, 'data')).not.toContain('data-testid="backups-link"')
  })

  it('shows the audit log only to the owner', () => {
    expect(render(owner, 'server')).toContain('Audit log')
    expect(render(admin, 'account')).not.toContain('Audit log')
  })
})

describe('demo instance', () => {
  beforeEach(() => setDemo(info))

  it('keeps every card and disables the refused ones under one note', () => {
    const html = render(member, 'integrations')
    expect(html.match(/data-testid="demo-restricted"/g)).toHaveLength(1)
    expect(html).toContain('calendar apps (CalDAV), calendar feeds, webhooks, API tokens, the assistant and AI assistants (MCP) are disabled on this demo instance')
    expect(html).toContain('id="caldav-heading"')
    expect(html).toContain('id="tokens-heading"')
    expect(html).toMatch(/<fieldset disabled=""[^>]*data-demo-disabled/)
    const account = render(member, 'account')
    expect(account).toContain('password and two-factor authentication, passkeys, linked accounts and end-to-end encryption')
    expect(account).toContain('id="password-heading"')
    expect(account).toContain('Sign out')
    // Profile and sessions work: they are outside the disabled group.
    expect(account.indexOf('data-demo-disabled')).toBeGreaterThan(account.indexOf('id="session-heading"'))
  })

  it('keeps what works next to the note', () => {
    const capture = render(member, 'capture')
    expect(capture).toContain('Copy bookmarklet')
    expect(capture).toContain('email to task is disabled on this demo instance')
    expect(capture).toContain('id="email-inbox-heading"')
  })

  it('leaves local settings alone and disables import', () => {
    const general = render(member, 'general')
    expect(general).not.toContain('demo-restricted')
    expect(general).toContain('Vim keybindings')
    const data = render(member, 'data')
    expect(data).toMatch(/<button[^>]*disabled=""[^>]*>Import data…<\/button>/)
    expect(data).toContain('Import: Disabled on this demo instance.')
    expect(data).not.toContain('demo-restricted')
  })
})
