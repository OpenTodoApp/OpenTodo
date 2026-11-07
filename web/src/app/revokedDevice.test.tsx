// @vitest-environment happy-dom
// A revoked device removes its local copy (OpenSpec change revoked-device-wipe):
// the app opens on a device whose session was revoked elsewhere, checks the
// server's proof against its stored key, clears the local database with the
// outbox and shows the sign-in screen with one sentence. A forged proof clears
// nothing.
import 'fake-indexeddb/auto'
import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '../ui/test-utils'

const KEY = 'k3y-of-this-session_0123456789abcdefghijklmnopq'
const NOTICE = 'This device was signed out and its data was removed.'
const me = { id: 'u1', email: 'me@example.com', name: 'Me', role: 'owner', createdAt: 1 }
const proofFor = (key: string) => createHmac('sha256', key).update('opentodo device revoked v1').digest('base64url')

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  history.pushState(null, '', '/')
})

/** Opens the app on a device that holds a task, an unsynced change and its wipe key. */
async function openRevoked(proof: string) {
  vi.resetModules()
  const { db, setMeta } = await import('../lib/db')
  await db.tasks.put({ id: 't1', title: 'Passport number', project_id: null } as never)
  await db.outbox.add({ entity: 'task', entity_id: 't1', field: 'title', value: 'Passport number', ts: 1, device: 'd' } as never)
  await setMeta('wipeKey', KEY)
  localStorage.setItem('opentodo.user', JSON.stringify(me))
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(url)}`)
    if (String(url).includes('/api/v1/auth/status')) {
      return new Response(JSON.stringify({ authenticated: false, user: null, setupRequired: false, signupAllowed: false, version: 'test', revoked: { proof } }), { status: 200 })
    }
    if (String(url).includes('/api/v1/auth/logout')) return new Response(null, { status: 204 })
    return new Response('{}', { status: 404 })
  }))
  const { App } = await import('./App')
  const r = await render(<App />)
  return { db, r, calls }
}

describe('revoked device', { timeout: 30000 }, () => {
  it('removes its local copy and outbox once the proof matches its key', async () => {
    const { db, r, calls } = await openRevoked(proofFor(KEY))
    await waitFor(() => r.container.textContent?.includes(NOTICE) ?? false, 'the notice')
    await waitFor(async () => (await db.tasks.count()) === 0 && (await db.outbox.count()) === 0, 'local copy cleared')
    expect(await db.meta.get('wipeKey')).toBeUndefined()
    expect(localStorage.getItem('opentodo.user')).toBeNull()
    // The cookie and the HTTP cache go with the sign-out request.
    expect(calls).toContain('POST /api/v1/auth/logout')
    await r.unmount()
  })

  it('keeps everything when the proof was not made with its key', async () => {
    const { db, r, calls } = await openRevoked(proofFor('someone else'))
    await waitFor(() => r.container.querySelector('input[type="password"]') !== null, 'the sign-in screen')
    expect(r.container.textContent).not.toContain(NOTICE)
    expect(await db.tasks.count()).toBe(1)
    expect(await db.outbox.count()).toBe(1)
    expect(calls).not.toContain('POST /api/v1/auth/logout')
    await r.unmount()
  })
})
