// @vitest-environment happy-dom
// Display routes in the app (OpenSpec change display-mode, task 3.2): the display
// replaces the shell while sync keeps running, and an anonymous visitor sees the
// sign-in screen first and the display after signing in, on the same address.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flush, render } from '../../ui/test-utils'

const me = { id: 'u1', email: 'me@example.com', name: 'Me', role: 'owner', createdAt: 1 }
let signedIn = true

async function waitFor(ok: () => boolean, ms = 10000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

async function boot(path: string) {
  vi.resetModules()
  const startSync = vi.fn()
  vi.doMock('../../lib/sync', async (orig) => ({ ...(await orig<typeof import('../../lib/sync')>()), startSync }))
  history.pushState(null, '', path)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/v1/auth/status')) {
      return new Response(JSON.stringify(signedIn
        ? { authenticated: true, user: me, setupRequired: false, signupAllowed: false, version: 'test' }
        : { authenticated: false, setupRequired: false, signupAllowed: false, version: 'test' }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }))
  const { App } = await import('../App')
  const r = await render(<App />)
  return { r, startSync }
}

afterEach(() => {
  vi.doUnmock('../../lib/sync')
  vi.unstubAllGlobals()
  history.pushState(null, '', '/')
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-contrast')
  document.documentElement.removeAttribute('data-motion')
})

// Each case boots the whole app (fresh modules, lazy chunks), which takes several
// seconds when the full suite runs in parallel.
describe('display routes in the app', { timeout: 30000 }, () => {
  it('renders the display instead of the shell, with its options, and starts sync', async () => {
    signedIn = true
    const { r, startSync } = await boot('/display/today?eink=1')
    await waitFor(() => !!r.container.querySelector('[data-screen="display"]'))
    expect(startSync).toHaveBeenCalled()
    expect(r.container.querySelector('nav')).toBeNull()
    expect(r.container.querySelector('input[aria-label="Add a task"]')).toBeNull()
    expect(document.documentElement.getAttribute('data-contrast')).toBe('high')
    await r.unmount()
  })

  it('shows sign-in to an anonymous visitor and the display after sign-in', async () => {
    signedIn = false
    const { r } = await boot('/display/upcoming')
    await waitFor(() => !!r.container.querySelector('input[type="password"]'))
    expect(r.container.querySelector('[data-screen="display"]')).toBeNull()
    signedIn = true
    const { ACCOUNT_CHANGED_EVENT } = await import('../UsersPanel')
    await act(async () => { window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT)) })
    await waitFor(() => !!r.container.querySelector('[data-screen="display"][data-display-target="upcoming"]'))
    expect(location.pathname).toBe('/display/upcoming')
    await r.unmount()
  })
})
