// @vitest-environment happy-dom
// Settings search (OpenSpec change ux-overhaul, settings-navigation "Settings
// search"; settings-subpages): rows under their section, Enter opens the
// sub-page that holds the row with the row focused and tinted, and the command
// palette reads the same index.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../lib/types'
import { click, flush, key, render, type } from '../ui/test-utils'
import { buildEntries } from './palette'
import { routePath } from './router'
import { SETTINGS_INDEX, searchSettings, takeSettingsFocus, visibleEntries } from './settingsIndex'
import { SettingsList, SettingsView } from './SettingsView'

const member: User = { id: 'u1', email: 'sam@example.com', name: 'Sam', role: 'member', createdAt: 1 }
const owner: User = { ...member, id: 'u3', role: 'owner' }

beforeEach(() => {
  history.replaceState(null, '', '/settings')
  window.dispatchEvent(new PopStateEvent('popstate'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  takeSettingsFocus()
})
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('index', () => {
  it('finds how tasks open under Appearance → Task details (task-side-panel)', () => {
    for (const q of ['side panel', 'open tasks']) {
      expect(searchSettings(q, member)[0].entries[0]).toMatchObject({ section: 'appearance', page: 'task-details', label: 'Open tasks', anchor: 'task-details-heading' })
    }
  })

  it('finds rows by label, description and keywords, grouped under their section', () => {
    const hits = searchSettings('week', member)
    // "week" also finds the weekly digest (stats-and-review) under Notifications.
    expect(hits.map((h) => h.section.id)).toEqual(['language', 'notifications'])
    expect(hits[0].entries[0].label).toBe('First day of the week')
    expect(searchSettings('passkey', member)[0].entries[0]).toMatchObject({ section: 'account', page: 'security', label: 'Passkeys', anchor: 'security-heading' })
    expect(searchSettings('2fa', member).flatMap((h) => h.entries.map((e) => e.label))).toContain('Two-factor authentication')
    expect(searchSettings('', member)).toEqual([])
  })

  it('"discord" and "community" list the About › Community row (discord-community)', () => {
    for (const q of ['discord', 'community']) {
      const entries = searchSettings(q, member).flatMap((h) => h.entries)
      expect(entries).toContainEqual(expect.objectContaining({ section: 'about', label: 'Community', anchor: 'about-community' }))
    }
  })

  it('shows a row only to the roles that see its section and the row itself', () => {
    const labels = (u: User) => visibleEntries(u).map((e) => e.label)
    expect(labels(member)).not.toContain('Users')
    expect(labels(member)).not.toContain('Backups')
    expect(labels(owner)).toEqual(expect.arrayContaining(['Users', 'Single sign-on', 'Backups', 'Audit log']))
    expect(searchSettings('audit', member)).toEqual([])
    expect(SETTINGS_INDEX.every((e) => e.anchor && e.label && e.description)).toBe(true)
  })
})

describe('search field', () => {
  it('"week" lists First day of the week under Language and region; Enter opens it with that row focused and tinted', async () => {
    const r = await render(<SettingsList user={member} />)
    const field = r.container.querySelector<HTMLInputElement>('input[aria-label="Search settings"]')!
    await type(field, 'week')
    await flush(20)
    const results = r.container.querySelector('[data-settings-results]')!
    expect(results.textContent).toContain('Language and region')
    expect(results.querySelector('[data-settings-result="language:date-time-heading"]')?.textContent).toContain('First day of the week')
    await key(field, 'Enter')
    // Enter submits the search form.
    await flush(10)
    field.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush(20)
    expect(location.pathname).toBe('/settings/language/date-time')
    await r.unmount()

    // The section page focuses the row the search asked for and tints its card.
    const page = await render(<SettingsView user={member} onLogout={() => {}} section="language" page="date-time" />)
    await flush(30)
    expect(document.activeElement?.id).toBe('date-time-heading')
    expect(document.activeElement?.closest('[data-settings-card]')?.getAttribute('data-settings-highlight')).toBe('on')
    await page.unmount()
  })

  it('a result on a sub-page opens that sub-page', async () => {
    const r = await render(<SettingsList user={member} />)
    await type(r.container.querySelector<HTMLInputElement>('input[aria-label="Search settings"]')!, 'webhook')
    await flush(20)
    const link = r.container.querySelector<HTMLAnchorElement>('[data-settings-result="integrations:webhooks-heading"]')!
    expect(link.getAttribute('href')).toBe('/settings/integrations/webhooks')
    await click(link)
    expect(location.pathname).toBe('/settings/integrations/webhooks')
    expect(takeSettingsFocus()).toBe('webhooks-heading')
    await r.unmount()
  })

  it('a result link opens its section by click too', async () => {
    const r = await render(<SettingsList user={member} />)
    await type(r.container.querySelector<HTMLInputElement>('input[aria-label="Search settings"]')!, 'vim')
    await flush(20)
    await click(r.container.querySelector('[data-settings-result="general:keyboard-heading"]')!)
    expect(location.pathname).toBe('/settings/general/keyboard')
    expect(takeSettingsFocus()).toBe('keyboard-heading')
    await r.unmount()
  })
})

describe('palette', () => {
  it('"passkey" lists Account › Passkeys and opens Account → Security at the passkeys row', () => {
    const entries = buildEntries({ tasks: [], projects: [], labels: [], views: [], user: member })
    const hit = entries.find((e) => e.label === 'Account › Passkeys')!
    expect(hit).toBeDefined()
    expect(hit.kind).toBe('settings')
    expect(hit.keywords).toContain('passkey')
    hit.run()
    expect(location.pathname).toBe(routePath({ view: 'settings', section: 'account', page: 'security' }))
    expect(takeSettingsFocus()).toBe('security-heading')
    // Sections themselves stay listed, and owner-only rows need the owner.
    expect(entries.some((e) => e.label === 'Settings: Account')).toBe(true)
    expect(entries.some((e) => e.label === 'Server › Backups')).toBe(false)
    expect(buildEntries({ tasks: [], projects: [], labels: [], views: [], user: owner }).some((e) => e.label === 'Server › Backups')).toBe(true)
  })
})
