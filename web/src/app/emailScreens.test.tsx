// @vitest-environment happy-dom
// The anonymous outgoing-email screens (OpenSpec change outgoing-email, tasks 4.2
// and 5.3): the "Forgot password?" link only with outgoing email, the neutral
// confirmation, offline and disabled states; verification that never completes on
// load, the invalid link, and the "check your email" state with resend.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthStatus } from '../lib/types'
import { click, flush, render, type } from '../ui/test-utils'
import { AuthScreen } from './AuthScreen'
import { ForgotScreen, VerifyScreen } from './EmailScreens'

const anon: AuthStatus = { setupRequired: false, signupAllowed: true, authenticated: false, user: null, version: 'test' }
let calls: { key: string; body: unknown }[] = []

function serve(routes: Record<string, [number, unknown]>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url, 'http://x').pathname}`
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const hit = routes[key]
    if (!hit) return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), { status: 404 })
    return new Response(JSON.stringify(hit[1]), { status: hit[0], headers: { 'Content-Type': 'application/json' } })
  }))
}

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const button = (root: ParentNode, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!

beforeEach(() => { calls = [] })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('Forgot password', () => {
  it('links from sign-in only when the server sends email', async () => {
    let r = await render(<AuthScreen status={anon} onAuthenticated={() => {}} />)
    expect(r.container.querySelector('[data-forgot-link]')).toBeNull()
    await r.unmount()
    r = await render(<AuthScreen status={{ ...anon, outgoingEmail: { enabled: true } }} onAuthenticated={() => {}} />)
    expect(r.container.querySelector('[data-forgot-link]')?.getAttribute('href')).toBe('/forgot')
    await r.unmount()
  })

  it('answers neutrally after a request', async () => {
    serve({ 'POST /api/v1/auth/password-reset': [202, { ok: true }] })
    const r = await render(<ForgotScreen enabled user={null} />)
    await type(r.container.querySelector<HTMLInputElement>('input[type="email"]')!, 'nobody@example.com')
    await click(button(r.container, 'Send reset link'))
    await waitFor(() => r.container.textContent!.includes('If an account exists'))
    expect(calls).toEqual([{ key: 'POST /api/v1/auth/password-reset', body: { email: 'nobody@example.com' } }])
    expect(button(r.container, 'Back to sign-in')).toBeTruthy()
    await r.unmount()
  })

  it('says a connection is needed offline, and explains when the server sends no email', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    let r = await render(<ForgotScreen enabled user={null} />)
    await type(r.container.querySelector<HTMLInputElement>('input[type="email"]')!, 'me@example.com')
    await click(button(r.container, 'Send reset link'))
    await waitFor(() => r.container.textContent!.includes('needs a connection'))
    await r.unmount()
    r = await render(<ForgotScreen enabled={false} user={null} />)
    expect(r.container.textContent).toContain('Password resets go through an administrator')
    expect(r.container.querySelector('input')).toBeNull()
    await r.unmount()
  })
})

describe('Verified sign-up', () => {
  it('shows the pending address and creates nothing until the button is pressed', async () => {
    serve({
      'GET /api/v1/auth/verify/tok1': [200, { email: 'new@example.com', expiresAt: Date.now() + 3600_000 }],
      'POST /api/v1/auth/verify/tok1': [201, { user: { id: 'u', email: 'new@example.com', name: 'New', role: 'member' } }],
    })
    const done = vi.fn()
    const r = await render(<VerifyScreen token="tok1" user={null} onDone={done} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('new@example.com'))
    await flush(50)
    expect(calls.map((c) => c.key)).toEqual(['GET /api/v1/auth/verify/tok1'])
    await click(r.container.querySelector('[data-verify-create]')!)
    await waitFor(() => done.mock.calls.length === 1)
    expect(calls.map((c) => c.key)).toContain('POST /api/v1/auth/verify/tok1')
    await r.unmount()
  })

  it('explains an invalid link and offers to register again', async () => {
    serve({ 'GET /api/v1/auth/verify/old': [404, { error: { code: 'verification_invalid', message: 'invalid' } }] })
    const r = await render(<VerifyScreen token="old" user={null} onDone={() => {}} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('no longer valid'))
    expect(button(r.container, 'Register again')).toBeTruthy()
    await r.unmount()
  })

  it('asks to check the mailbox after a 202 and resends the same registration', async () => {
    vi.stubGlobal('location', { search: '', pathname: '/', hash: '' })
    serve({ 'POST /api/v1/auth/register': [202, { verificationRequired: true }] })
    const authed = vi.fn()
    const r = await render(<AuthScreen status={{ ...anon, outgoingEmail: { enabled: true } }} onAuthenticated={authed} />)
    await click(button(r.container, 'Need an account? Sign up'))
    const inputs = r.container.querySelectorAll<HTMLInputElement>('form input')
    await type(inputs[0], 'Ana')
    await type(r.container.querySelector<HTMLInputElement>('input[type="email"]')!, 'ana@example.com')
    await type(r.container.querySelector<HTMLInputElement>('input[type="password"]')!, 'long-enough-password')
    await click(button(r.container, 'Create account'))
    await waitFor(() => r.container.querySelector('[data-check-email]') !== null)
    expect(r.container.textContent).toContain('ana@example.com')
    expect(authed).not.toHaveBeenCalled()
    await click(button(r.container, 'Send the link again'))
    await waitFor(() => calls.filter((c) => c.key === 'POST /api/v1/auth/register').length === 2)
    expect(calls[1].body).toEqual(calls[0].body)
    await waitFor(() => r.container.textContent!.includes('A new link is on its way'))
    await r.unmount()
  })
})
