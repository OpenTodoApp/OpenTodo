// Settings sections (OpenSpec `settings-navigation`): routes, the section table and
// the overview / section pages, rendered to static markup like the other component tests.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDemo } from '../lib/demo'
import type { DemoInfo, User } from '../lib/types'
import { parseRoute, routePath, SETTINGS_SECTION_IDS, type SettingsSectionId } from './router'
import { followLink, SettingsView } from './SettingsView'
import { joinList, resolveSection, SETTINGS_SECTIONS, visibleSections } from './settingsSections'

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

describe('routes', () => {
  it('parses and builds /settings/<section> for every section', () => {
    expect(SETTINGS_SECTION_IDS).toEqual(['account', 'general', 'notifications', 'data', 'capture', 'integrations', 'ai', 'admin'])
    for (const id of SETTINGS_SECTION_IDS) {
      expect(parseRoute(`/settings/${id}`)).toEqual({ view: 'settings', section: id })
      expect(routePath({ view: 'settings', section: id })).toBe(`/settings/${id}`)
      expect(routePath(parseRoute(`/settings/${id}`))).toBe(`/settings/${id}`)
    }
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
  it('has one entry per route id, in overview order', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual([...SETTINGS_SECTION_IDS])
  })

  it('shows Administration only to the owner and admins', () => {
    expect(visibleSections(member).map((s) => s.id)).not.toContain('admin')
    expect(visibleSections(admin).map((s) => s.id)).toContain('admin')
    expect(visibleSections(owner).map((s) => s.id)).toContain('admin')
    expect(resolveSection(member, 'admin')).toBeNull()
    expect(resolveSection(admin, 'admin')?.label).toBe('Administration')
    expect(resolveSection(member, undefined)).toBeNull()
  })

  it('describes what each viewer will find', () => {
    const data = SETTINGS_SECTIONS.find((s) => s.id === 'data')!
    expect(data.description(member)).not.toContain('backups')
    expect(data.description(owner)).toContain('backups')
    const adm = SETTINGS_SECTIONS.find((s) => s.id === 'admin')!
    expect(adm.description(admin)).not.toContain('single sign-on')
    expect(adm.description(owner)).toContain('single sign-on')
  })

  it('joins lists for the demo note', () => {
    expect(joinList(['a'])).toBe('a')
    expect(joinList(['a', 'b'])).toBe('a and b')
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c')
  })
})

describe('overview', () => {
  it('lists the sections with descriptions, the account and the footer', () => {
    const html = render(member)
    expect(html).toContain('data-settings-overview')
    expect(html).toMatch(/<h1[^>]*>Settings<\/h1>/)
    expect(html).toContain('Sam · sam@example.com · member')
    for (const id of ['account', 'general', 'notifications', 'data', 'capture', 'integrations', 'ai']) {
      expect(html).toContain(`href="/settings/${id}"`)
    }
    expect(html).not.toContain('href="/settings/admin"')
    expect(html).toContain('Calendar apps (CalDAV), webhooks and API tokens')
    expect(html).toContain('min-h-11')
    expect(html).toContain('No telemetry, no tracking, no subscription.')
    expect(html).toContain('href="https://github.com/pixari/opentodo"')
    // No panel of any section is on the overview.
    expect(html).not.toContain('id="password-heading"')
    expect(html).not.toContain('Vim keybindings')
  })

  it('lists Administration for admins', () => {
    expect(render(admin)).toContain('href="/settings/admin"')
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
    const html = render(member, 'general')
    expect(html).toContain('data-settings-section="general"')
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toMatch(/<h1[^>]*tabindex="-1"[^>]*>General<\/h1>/)
    expect(html).toContain('Vim keybindings')
    expect(html).toContain('Start view on this device')
    // Panels of other sections are not on this page.
    expect(html).not.toContain('Sign out')
    expect(html).not.toContain('Download export (JSON)')
  })

  it('marks the current section in the side list and offers a back link on phones', () => {
    const html = render(member, 'data')
    expect(html).toMatch(/<nav aria-label="Settings sections" class="hidden [^"]*lg:block/)
    expect(html).toMatch(/<a href="\/settings\/data" aria-current="page"[^>]*>Data<\/a>/)
    expect(html).not.toMatch(/<a href="\/settings\/general" aria-current/)
    expect(html).toMatch(/<a class="[^"]*lg:hidden[^"]*" href="\/settings" data-settings-back/)
    expect(html).toContain('Download export (JSON)')
    expect(html).toContain('href="/settings/import"')
  })

  it('keeps every Help screen of the section', () => {
    const html = render(owner, 'account')
    for (const screen of ['settings/password', 'settings/two-factor', 'settings/sessions', 'settings/session']) {
      expect(html).toContain(`data-help-screen="${screen}"`)
    }
    expect(render(member, 'capture')).toContain('data-help-screen="settings/capture"')
  })
})

describe('roles', () => {
  it('sends a member who opens Administration to the overview', () => {
    const html = render(member, 'admin')
    expect(html).toContain('data-settings-overview')
    expect(html).not.toContain('id="users-heading"')
  })

  it('shows users and members to admins without single sign-on', () => {
    const html = render(admin, 'admin')
    expect(html).toContain('data-settings-section="admin"')
    expect(html).toContain('id="users-heading"')
    expect(html).not.toContain('data-testid="sso-panel"')
  })

  it('shows single sign-on to the owner', () => {
    expect(render(owner, 'admin')).toContain('data-testid="sso-panel"')
  })

  it('shows backups to the owner only', () => {
    expect(render(owner, 'data')).toContain('data-testid="backups-panel"')
    expect(render(admin, 'data')).not.toContain('data-testid="backups-panel"')
    expect(render(member, 'data')).not.toContain('data-testid="backups-panel"')
  })

  it('shows the audit log only to the owner', () => {
    expect(render(owner, 'account')).toContain('Audit log')
    expect(render(member, 'account')).not.toContain('Audit log')
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
    for (const id of ['notifications', 'ai'] as const) expect(render(member, id)).toContain('data-testid="demo-restricted"')
  })

  it('keeps what works next to the note', () => {
    const account = render(member, 'account')
    expect(account).toContain('data-testid="demo-restricted"')
    expect(account).toContain('passkeys')
    expect(account).not.toContain('id="password-heading"')
    expect(account).toContain('Sign out')
    const capture = render(member, 'capture')
    expect(capture).toContain('Copy bookmarklet')
    expect(capture).toContain('email to task is disabled on this demo instance')
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
