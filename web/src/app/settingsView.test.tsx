// @vitest-environment happy-dom
// One Settings layout (OpenSpec change ux-overhaul, settings-navigation "Settings
// overview" and "Section page layout"): the list is the left column from 1024 px
// with the first section open at /settings, the whole screen below it with a back
// action on section pages; focus moves to the heading on navigation.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../lib/types'
import { click, flush, render } from '../ui/test-utils'
import { navigate } from './router'
import { SettingsView } from './SettingsView'

vi.mock('./SsoPanel', async (orig) => ({ ...(await orig<typeof import('./SsoPanel')>()), SsoPanel: () => <div /> }))

const member: User = { id: 'u1', email: 'sam@example.com', name: 'Sam', role: 'member', createdAt: 1 }
/** The viewport width the media queries see. */
let width = 1280
const original = window.matchMedia

beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? 0) <= width, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  history.replaceState(null, '', '/settings')
  window.dispatchEvent(new PopStateEvent('popstate'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { window.matchMedia = original; document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

describe('from 1024 px', () => {
  it('/settings opens Account beside the list and the address becomes /settings/account', async () => {
    width = 1280
    const replace = vi.spyOn(history, 'replaceState')
    const r = await render(<SettingsView user={member} onLogout={() => {}} />)
    await flush(30)
    expect(r.container.querySelector('[data-settings-section]')?.getAttribute('data-settings-section')).toBe('account')
    expect(r.container.querySelector('aside [data-settings-list]')).toBeTruthy()
    expect(r.container.querySelector('aside a[aria-current="page"]')?.getAttribute('href')).toBe('/settings/account')
    expect(replace).toHaveBeenCalledWith(null, '', '/settings/account')
    expect(location.pathname).toBe('/settings/account')
    expect(document.activeElement?.tagName).toBe('H1')
    await r.unmount()
  })

  it('the list column has group headings for assistive technology, in the stated order', async () => {
    width = 1280
    const r = await render(<SettingsView user={member} onLogout={() => {}} section="general" />)
    await flush(30)
    const aside = r.container.querySelector('aside')!
    expect([...aside.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['You', 'App', 'Data'])
    expect([...aside.querySelectorAll('section[aria-labelledby] a[data-settings-link]')].map((a) => a.getAttribute('data-settings-link')))
      .toEqual(['account', 'appearance', 'general', 'notifications', 'capture', 'about', 'integrations', 'data'])
    await r.unmount()
  })
})

describe('below 1024 px', () => {
  it('/settings is the list alone; an entry opens its section as a page with a back action, and focus lands on the heading', async () => {
    // A tablet: one column, the header renders its own row with the back action.
    width = 800
    const r = await render(<SettingsView user={member} onLogout={() => {}} />)
    await flush(30)
    expect(r.container.querySelector('[data-settings-overview]')).toBeTruthy()
    expect(r.container.querySelector('[data-settings-section]')).toBeNull()
    expect(location.pathname).toBe('/settings')
    const entries = [...r.container.querySelectorAll<HTMLAnchorElement>('a[data-settings-link]')]
    expect(entries.map((a) => a.getAttribute('data-settings-link'))).toEqual(['account', 'appearance', 'general', 'notifications', 'capture', 'about', 'integrations', 'data'])
    expect(entries.every((a) => /min-h-14/.test(a.className))).toBe(true)

    await click(entries.find((a) => a.getAttribute('data-settings-link') === 'capture')!)
    expect(location.pathname).toBe('/settings/capture')
    await r.rerender(<SettingsView user={member} onLogout={() => {}} section="capture" />)
    await flush(30)
    expect(r.container.querySelector('[data-settings-section]')?.getAttribute('data-settings-section')).toBe('capture')
    expect(r.container.querySelector('aside')).toBeNull()
    expect(r.container.querySelector('[data-page-back]')?.getAttribute('href')).toBe('/settings')
    expect(document.activeElement?.textContent).toBe('Capture')
    await r.unmount()
  })

  it('an unknown id opens the first section as a page', async () => {
    width = 390
    history.replaceState(null, '', '/settings/nonsense')
    window.dispatchEvent(new PopStateEvent('popstate'))
    const r = await render(<SettingsView user={member} onLogout={() => {}} />)
    await waitFor(() => location.pathname === '/settings/account')
    expect(r.container.querySelector('[data-settings-section]')?.getAttribute('data-settings-section')).toBe('account')
    // Below 768 px the title is the shell's phone bar; without it, focus lands on the page itself.
    expect(document.activeElement?.getAttribute('data-settings-section')).toBe('account')
    await r.unmount()
    navigate({ view: 'settings' })
  })
})
