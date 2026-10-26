// @vitest-environment happy-dom
// credential-freshness: adding a passkey or an authenticator app needs a recent
// sign-in. The server answers 403 reauth_required to an older session; the app
// then asks for the password in the re-authentication dialog and repeats the
// request, so the enrolment continues without starting over. A provider link
// refused for the same reason comes back to Settings and asks the same way.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { click, flush, render, type Rendered, type as typeText, waitFor } from '../ui/test-utils'
import { ReauthHost } from './ReauthDialog'
import { EnrolmentWizard } from './TwoFactorPanel'
import { SecurityPanel } from './SecurityPanel'
import { LinkedAccountsPanel } from './SsoPanel'

vi.mock('../lib/online', () => ({ useOnline: () => true }))
vi.mock('../lib/passkeys', async (orig) => ({
  ...(await orig<typeof import('../lib/passkeys')>()),
  passkeysSupported: () => true,
  createPasskey: vi.fn(async () => ({ id: 'cred', rawId: 'cred', type: 'public-key', response: {} })),
}))

type Answer = { status: number; body: unknown }
let calls: string[]
let answers: Map<string, Answer[]>
let fresh: boolean

const reauthRequired: Answer = { status: 403, body: { error: { code: 'reauth_required', message: 'confirm your password or a code to continue' } } }

/** Queue answers for one request; a route answers reauth_required while the session is stale. */
function on(route: string, ...queue: Answer[]) {
  answers.set(route, queue)
}

beforeEach(() => {
  calls = []
  answers = new Map()
  fresh = false
  on('GET /api/v1/auth/status', { status: 200, body: { passkeysAvailable: true, passkeyDomain: '', oidc: { enabled: false, displayName: '', ssoOnly: false } } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const route = `${init.method ?? 'GET'} ${new URL(url, 'http://test.invalid').pathname}`
    calls.push(route)
    if (route === 'POST /api/v1/auth/reauth') {
      const ok = JSON.parse(String(init.body)).password === 'correct horse battery'
      fresh = ok
      return json(ok ? { status: 200, body: { reauthAt: 1, validForMs: 600000 } } : { status: 401, body: { error: { code: 'invalid_credentials', message: 'no' } } })
    }
    const queue = answers.get(route)
    if (!queue?.length) throw new Error(`unexpected request ${route}`)
    const next = queue.length > 1 ? queue.shift()! : queue[0]
    return json(next.status === 200 && !fresh && SENSITIVE.has(route) ? reauthRequired : next)
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const SENSITIVE = new Set(['POST /api/v1/mfa/totp/enroll', 'POST /api/v1/mfa/totp/confirm', 'POST /api/v1/passkeys/register/options', 'POST /api/v1/passkeys/register'])

const json = (a: Answer) => new Response(JSON.stringify(a.body), { status: a.status, headers: { 'Content-Type': 'application/json' } })

async function confirmPassword() {
  await waitFor(() => !!document.querySelector('[data-testid="reauth-dialog"]'), 're-authentication dialog')
  const input = document.querySelector<HTMLInputElement>('[data-testid="reauth-dialog"] input[type="password"]')!
  await typeText(input, 'correct horse battery')
  await click([...document.querySelectorAll('[data-testid="reauth-dialog"] button')].find((b) => b.textContent === 'Continue')!)
}

async function mount(ui: React.ReactNode): Promise<Rendered> {
  return render(<><ReauthHost />{ui}</>)
}

describe('enrolment on a session that did not sign in recently', () => {
  it('asks for the password, then shows the authenticator setup', async () => {
    on('POST /api/v1/mfa/totp/enroll', { status: 200, body: { secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/OpenTodo:owner@example.com?secret=JBSWY3DPEHPK3PXP', expiresAt: Date.now() + 600000 } })
    const r = await mount(<EnrolmentWizard online onEnrolled={() => {}} />)
    await confirmPassword()
    await waitFor(() => r.container.textContent?.includes('JBSW') ?? false, 'manual key')
    expect(calls).toEqual(['POST /api/v1/mfa/totp/enroll', 'GET /api/v1/auth/status', 'POST /api/v1/auth/reauth', 'POST /api/v1/mfa/totp/enroll'])
    expect(document.querySelector('[data-testid="reauth-dialog"]')).toBeNull()
    await r.unmount()
  })

  it('says what to do when the prompt is cancelled', async () => {
    on('POST /api/v1/mfa/totp/enroll', { status: 200, body: {} })
    const r = await mount(<EnrolmentWizard online onEnrolled={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-testid="reauth-dialog"]'), 're-authentication dialog')
    await click([...document.querySelectorAll('[data-testid="reauth-dialog"] button')].find((b) => b.textContent === 'Cancel')!)
    await waitFor(() => r.container.textContent?.includes('Confirm your password to continue.') ?? false, 'cancel message')
    expect(calls.filter((c) => c === 'POST /api/v1/mfa/totp/enroll')).toHaveLength(1)
    await r.unmount()
  })

  it('adds a passkey after the password is confirmed', async () => {
    on('GET /api/v1/passkeys', { status: 200, body: { passkeys: [] } })
    on('POST /api/v1/passkeys/register/options', { status: 200, body: { publicKey: { challenge: 'c', rp: { id: 'localhost', name: 'OpenTodo' }, user: { id: 'u', name: 'o', displayName: 'O' }, pubKeyCredParams: [] } } })
    on('POST /api/v1/passkeys/register', { status: 201, body: { passkey: { id: 'k', name: 'Laptop', createdAt: 1, lastUsedAt: null, suspiciousAt: null, backedUp: false } } })
    const r = await mount(<SecurityPanel />)
    await waitFor(() => [...r.container.querySelectorAll('button')].some((b) => b.textContent === 'Add passkey'), 'add button')
    await click([...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Add passkey')!)
    await flush()
    await typeText(r.container.querySelector<HTMLInputElement>('form input')!, 'Laptop')
    await click([...r.container.querySelectorAll('form button')].find((b) => b.textContent === 'Continue')!)
    await confirmPassword()
    await waitFor(() => calls.includes('POST /api/v1/passkeys/register'), 'register request')
    expect(calls.filter((c) => c.startsWith('POST'))).toEqual([
      'POST /api/v1/passkeys/register/options', 'POST /api/v1/auth/reauth', 'POST /api/v1/passkeys/register/options', 'POST /api/v1/passkeys/register',
    ])
    await waitFor(() => !r.container.querySelector('[role="alert"]') && !r.container.textContent?.includes('confirm your password or a code'), 'no error')
    await r.unmount()
  })

  it('offers the single sign-on provider when the server has one', async () => {
    on('GET /api/v1/auth/status', { status: 200, body: { oidc: { enabled: true, displayName: 'Home SSO', ssoOnly: false } } })
    on('POST /api/v1/mfa/totp/enroll', { status: 200, body: {} })
    const r = await mount(<EnrolmentWizard online onEnrolled={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-testid="reauth-dialog"] a'), 'provider link')
    const link = document.querySelector<HTMLAnchorElement>('[data-testid="reauth-dialog"] a')!
    expect(link.textContent).toBe('Confirm with Home SSO instead')
    expect(link.getAttribute('href')).toBe('/api/v1/auth/oidc/start')
    // Close the prompt so the next test starts without one in flight.
    await click([...document.querySelectorAll('[data-testid="reauth-dialog"] button')].find((b) => b.textContent === 'Cancel')!)
    await r.unmount()
  })
})

describe('provider link refused for an older sign-in', () => {
  it('asks for the password and starts the link again', async () => {
    on('GET /api/v1/me/identities', { status: 200, body: { identities: [], provider: { enabled: true, displayName: 'Home SSO', ssoOnly: false } } })
    history.replaceState(null, '', '/settings/account/security?error=reauth_required')
    const assign = vi.spyOn(location, 'assign').mockImplementation(() => {})
    const r = await mount(<LinkedAccountsPanel />)
    await confirmPassword()
    await waitFor(() => assign.mock.calls.length > 0, 'navigation to the provider')
    expect(assign).toHaveBeenCalledWith('/api/v1/auth/oidc/start')
    await waitFor(() => r.container.textContent?.includes('Linking Home SSO needs a recent sign-in.') ?? false, 'explanation')
    await r.unmount()
  })
})
