// @vitest-environment happy-dom
// Signing in as a different account than the one whose copy is on this device
// (an expired or revoked session left it in place) must clear that copy before
// the first sync exchange. Every sign-in path ends in App.refresh, which runs
// prepareAccount before it sets the ready phase — and both the Shell and the
// first startSync are gated on that phase, so the clear always precedes sync
// (client-data-safety).
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '../ui/test-utils'

const newUser = { id: 'u-new', email: 'new@example.com', name: 'New', role: 'owner', createdAt: 1 }

afterEach(() => {
  vi.doUnmock('../lib/sync')
  vi.unstubAllGlobals()
  history.pushState(null, '', '/')
})

describe('signing in as a different account', () => {
  it("clears the previous account's data before the first sync exchange", async () => {
    vi.resetModules()
    const startSync = vi.fn()
    vi.doMock('../lib/sync', async (orig) => ({ ...(await orig<typeof import('../lib/sync')>()), startSync, stopSync: vi.fn() }))
    history.pushState(null, '', '/inbox')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/v1/auth/status')) {
        return new Response(JSON.stringify({ authenticated: true, user: newUser, setupRequired: false, signupAllowed: false, version: 'test' }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    }))

    // The device still holds the previous account's copy. useDatabase reassigns the
    // module's `db`, so read it through the namespace (dbmod.db), live, not a snapshot.
    const dbmod = await import('../lib/db')
    dbmod.useDatabase(`switch-app-${Date.now()}`)
    const { setCurrentUserId } = await import('../lib/sharing')
    const { createTask } = await import('../lib/ops')
    await setCurrentUserId('u-old')
    await createTask({ title: 'Previous account task' })
    expect(await dbmod.db.tasks.count()).toBe(1)

    const { App } = await import('./App')
    const r = await render(<App />)
    // startSync fires from the ready phase, which refresh sets only after the clear.
    await waitFor(() => startSync.mock.calls.length > 0)
    expect(await dbmod.db.tasks.count()).toBe(0)
    expect((await dbmod.db.meta.get('userId'))?.value).toBe('u-new')
    await r.unmount()
  })
})
