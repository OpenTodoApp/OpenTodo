// @vitest-environment happy-dom
// Sync and the route (OpenSpec change client-sync-robustness): moving between
// lists does not start sync again; it starts once when signed in.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flush, render } from '../ui/test-utils'

const me = { id: 'u1', email: 'me@example.com', name: 'Me', role: 'owner', createdAt: 1 }

async function waitFor(ok: () => boolean, ms = 10000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

afterEach(() => {
  vi.doUnmock('../lib/sync')
  vi.unstubAllGlobals()
  history.pushState(null, '', '/')
  document.body.innerHTML = ''
})

describe('sync across navigation', { timeout: 30000 }, () => {
  it('starts once and is not restarted when the route changes', async () => {
    vi.resetModules()
    const startSync = vi.fn()
    const stopSync = vi.fn()
    vi.doMock('../lib/sync', async (orig) => ({ ...(await orig<typeof import('../lib/sync')>()), startSync, stopSync }))
    history.pushState(null, '', '/inbox')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/v1/auth/status')) {
        return new Response(JSON.stringify({ authenticated: true, user: me, setupRequired: false, signupAllowed: false, version: 'test' }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    }))
    const { App } = await import('./App')
    const { navigate } = await import('./router')
    const r = await render(<App />)
    await waitFor(() => startSync.mock.calls.length > 0)
    const starts = startSync.mock.calls.length
    const stops = stopSync.mock.calls.length
    for (const view of ['today', 'upcoming', 'labels', 'inbox'] as const) {
      await act(async () => navigate({ view }))
      await flush(20)
    }
    expect(startSync).toHaveBeenCalledTimes(starts)
    expect(stopSync).toHaveBeenCalledTimes(stops)
    await r.unmount()
  })
})
