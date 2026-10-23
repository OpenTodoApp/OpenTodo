// @vitest-environment happy-dom
// Vocabulary (OpenSpec change ux-overhaul, design D11): the feed is "Updates" at
// /updates with /activity redirecting, Calendar is one destination, the sidebar
// group reads "Views" (views-and-display D1), and the palette still answers to the old words.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rememberCalendarMode } from '../lib/calendarMode'
import { db } from '../lib/db'
import { createView } from '../lib/views'
import { resetDeviceId } from '../lib/ops'
import { SHORTCUTS } from '../lib/shortcuts'
import type { User } from '../lib/types'
import { matchPrepared, prepare, prepareQuery } from '../ui'
import { flush, render } from '../ui/test-utils'
import { commandEntries, commands, type PaletteContext } from './palette/registry'
import { resetPanel } from './panel'
import { canonicalPath, parseRoute, routePath } from './router'
import { SETTINGS_SECTIONS } from './settingsSections'
import { Shell } from './Shell'
import { Sidebar } from './Sidebar'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  history.replaceState(null, '', '/')
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

describe('addresses', () => {
  it('/activity opens Updates at /updates; /calendar opens the Day or Week last used', () => {
    expect(parseRoute('/activity')).toEqual({ view: 'feed' })
    expect(parseRoute('/updates')).toEqual({ view: 'feed' })
    expect(routePath({ view: 'feed' })).toBe('/updates')
    expect(canonicalPath('/activity')).toBe('/updates')
    expect(canonicalPath('/updates')).toBeNull()
    expect(canonicalPath('/today')).toBeNull()

    expect(parseRoute('/calendar')).toEqual({ view: 'day' })
    expect(canonicalPath('/calendar')).toBe('/day')
    rememberCalendarMode('week')
    expect(parseRoute('/calendar')).toEqual({ view: 'week' })
    expect(canonicalPath('/calendar')).toBe('/week')

    // Earlier settings ids keep working too.
    expect(canonicalPath('/settings/preferences')).toBe('/settings/general')
  })

  it('the shell replaces an old address in place when it starts', async () => {
    history.replaceState(null, '', '/activity')
    // The router reads the address once, when the app loads.
    window.dispatchEvent(new PopStateEvent('popstate'))
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => location.pathname === '/updates')
    expect(r.container.querySelector('h1')?.textContent).toBe('Updates')
    await r.unmount()
  })
})

describe('old words', () => {
  const ctx: PaletteContext = {
    route: { view: 'inbox' }, user, today: '2026-10-14', list: null, filterQuery: null, query: '', vimEnabled: false,
    showShortcuts: () => {}, focusQuickAdd: () => false,
  }
  it('the palette finds Filters, Updates and Calendar by their old names', () => {
    const all = commands(ctx)
    const finds = (q: string, id: string) => {
      const c = all.find((x) => x.id === id)!
      expect(c, id).toBeDefined()
      return matchPrepared(prepareQuery(q), prepare(c.label, c.keywords), c.label.length).tier > 0
    }
    expect(finds('views', 'go:views')).toBe(true)
    expect(finds('filters', 'go:views')).toBe(true)
    expect(finds('activity', 'go:feed')).toBe(true)
    expect(finds('feed', 'go:feed')).toBe(true)
    expect(finds('calendar', 'go:day')).toBe(true)
    expect(finds('calendar', 'go:week')).toBe(true)
    // The entries the palette matches on carry the aliases.
    expect(commandEntries(ctx).find((e) => e.key === 'cmd:go:feed')?.keywords).toContain('activity')
    expect(commandEntries(ctx).find((e) => e.key === 'cmd:go:views')?.keywords).toContain('filters')
  })

  it('the interface says Views, Updates and Sessions and audit log', async () => {
    // The Views group appears with the first saved view (sidebar-compact-desktop).
    await createView({ name: 'Errands', query: 'today' })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await flush(50)
    expect(r.container.querySelector('nav[aria-label="Views"]')).toBeTruthy()
    expect(r.container.querySelector('nav[aria-label="Filters"]')).toBeNull()
    expect(r.container.textContent).not.toMatch(/\bFilters\b/)
    await r.unmount()
    expect(SETTINGS_SECTIONS.find((s) => s.id === 'account')?.description(user)).toContain('sessions')
    expect(SETTINGS_SECTIONS.find((s) => s.id === 'server')?.description(user)).toContain('audit log')
    expect(SHORTCUTS.find((s) => s.id === 'go.feed')?.description).toMatch(/Updates/)
    expect(SHORTCUTS.find((s) => s.id === 'go.views')?.description).toMatch(/Views/)
    expect(SHORTCUTS.some((s) => /Activity feed/.test(s.description))).toBe(false)
  })
})
