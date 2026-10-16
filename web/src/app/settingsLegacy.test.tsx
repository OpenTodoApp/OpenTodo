// @vitest-environment happy-dom
// Legacy settings addresses (OpenSpec change ux-overhaul, settings-navigation):
// an earlier id opens the section that holds its content, at the anchor of that
// content, and the address is replaced without a history entry.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../lib/types'
import { flush, render } from '../ui/test-utils'
import { SettingsView } from './SettingsView'
import { parseRoute } from './router'

vi.mock('./SsoPanel', async (orig) => ({ ...(await orig<typeof import('./SsoPanel')>()), SsoPanel: () => <div /> }))

const member: User = { id: 'u1', email: 'sam@example.com', name: 'Sam', role: 'member', createdAt: 1 }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

async function open(path: string) {
  history.replaceState(null, '', path)
  // The router reads the address once, as on app load.
  window.dispatchEvent(new PopStateEvent('popstate'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  const replace = vi.spyOn(history, 'replaceState')
  const push = vi.spyOn(history, 'pushState')
  const route = parseRoute(location.pathname)
  const r = await render(<SettingsView user={member} onLogout={() => {}} section={route.view === 'settings' ? route.section : undefined} anchor={route.view === 'settings' ? route.anchor : undefined} />)
  await flush(30)
  return { r, replace, push }
}

describe('legacy settings address', () => {
  it('replaces /settings/preferences with /settings/general without adding a history entry', async () => {
    const { r, replace, push } = await open('/settings/preferences')
    expect(r.container.querySelector('h1')?.textContent).toBe('General')
    expect(replace).toHaveBeenCalledWith(null, '', '/settings/general')
    expect(push).not.toHaveBeenCalled()
    expect(location.pathname).toBe('/settings/general')
    await r.unmount()
  })

  it('opens /settings/security as Account focused on its security rows, at /settings/account', async () => {
    const { r, replace, push } = await open('/settings/security')
    expect(r.container.querySelector('h1')?.textContent).toBe('Account')
    expect(document.activeElement?.getAttribute('data-settings-anchor')).toBe('security')
    expect(replace).toHaveBeenCalledWith(null, '', '/settings/account')
    expect(push).not.toHaveBeenCalled()
    expect(location.pathname).toBe('/settings/account')
    await r.unmount()
  })

  it('sends an unknown or hidden id to the first section, replacing the address', async () => {
    const { r, replace } = await open('/settings/nonsense')
    expect(r.container.querySelector('h1')?.textContent).toBe('Account')
    expect(replace).toHaveBeenCalledWith(null, '', '/settings/account')
    await r.unmount()
    const hidden = await open('/settings/people')
    expect(hidden.r.container.querySelector('h1')?.textContent).toBe('Account')
    expect(location.pathname).toBe('/settings/account')
    await hidden.r.unmount()
  })
})
