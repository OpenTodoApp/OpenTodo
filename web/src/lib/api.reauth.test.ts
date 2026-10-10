// Global second-factor handling in the API client (OpenSpec `mfa-totp`):
// `reauth_required` opens the registered prompt and repeats the request once,
// `mfa_enrolment_required` notifies listeners. fetch is mocked with a queue of
// responses so the exact request sequence can be asserted.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, onEnrolmentRequired, setReauthHandler } from './api'

type Call = { url: string; method: string; body: unknown }
let calls: Call[]
let queue: Response[]

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const err = (status: number, code: string) => json(status, { error: { code, message: code } })

beforeEach(() => {
  calls = []
  queue = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body as string) : undefined })
    const next = queue.shift()
    if (!next) throw new Error(`unexpected request ${init.method} ${url}`)
    return next
  }))
})
let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((fn) => fn())
  cleanup = []
  vi.unstubAllGlobals()
})

describe('reauth_required', () => {
  it('prompts, re-authenticates and retries the original request once', async () => {
    const prompt = vi.fn(async () => {
      await api.reauth({ password: 'correct horse battery' })
      return true
    })
    cleanup.push(setReauthHandler(prompt))
    queue.push(
      err(403, 'reauth_required'),
      json(200, { reauthAt: 1, validForMs: 600000 }),
      json(201, { token: { id: 't1', name: 'cli' }, secret: 'ot_x' }),
    )
    const res = await api.createToken('cli')
    expect(res.secret).toBe('ot_x')
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST /api/v1/tokens',
      'POST /api/v1/auth/reauth',
      'POST /api/v1/tokens',
    ])
    expect(calls[1].body).toEqual({ password: 'correct horse battery' })
    expect(calls[2].body).toEqual({ name: 'cli' })
  })

  it('gives up after one retry', async () => {
    const prompt = vi.fn(async () => true)
    cleanup.push(setReauthHandler(prompt))
    queue.push(err(403, 'reauth_required'), err(403, 'reauth_required'))
    await expect(api.createToken('cli')).rejects.toMatchObject({ code: 'reauth_required' })
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
  })

  it('does not retry when the user cancels the prompt', async () => {
    cleanup.push(setReauthHandler(async () => false))
    queue.push(err(403, 'reauth_required'))
    await expect(api.disableTotp()).rejects.toBeInstanceOf(ApiError)
    expect(calls).toHaveLength(1)
  })

  it('surfaces the error when no prompt is registered', async () => {
    queue.push(err(403, 'reauth_required'))
    await expect(api.regenerateRecoveryCodes()).rejects.toMatchObject({ status: 403, code: 'reauth_required' })
  })

  it('shares one prompt between concurrent requests', async () => {
    let release: (v: boolean) => void = () => {}
    const prompt = vi.fn(() => new Promise<boolean>((r) => { release = r }))
    cleanup.push(setReauthHandler(prompt))
    queue.push(err(403, 'reauth_required'), err(403, 'reauth_required'), json(201, { secret: 'a' }), json(200, { required: 'all' }))
    const a = api.createToken('a')
    const b = api.setMfaPolicy('all')
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
    release(true)
    await expect(a).resolves.toMatchObject({ secret: 'a' })
    await expect(b).resolves.toMatchObject({ required: 'all' })
    expect(prompt).toHaveBeenCalledTimes(1)
  })

  it('never prompts for the re-authentication request itself', async () => {
    const prompt = vi.fn(async () => true)
    cleanup.push(setReauthHandler(prompt))
    queue.push(err(401, 'invalid_credentials'))
    await expect(api.reauth({ password: 'wrong' })).rejects.toMatchObject({ code: 'invalid_credentials' })
    expect(prompt).not.toHaveBeenCalled()
  })
})

describe('mfa_enrolment_required', () => {
  it('notifies listeners and rejects', async () => {
    const seen = vi.fn()
    cleanup.push(onEnrolmentRequired(seen))
    queue.push(err(403, 'mfa_enrolment_required'))
    await expect(api.listTokens()).rejects.toMatchObject({ code: 'mfa_enrolment_required' })
    expect(seen).toHaveBeenCalledTimes(1)
  })
})

describe('second-factor routes', () => {
  it('sends the two-step sign-in with code or recovery code', async () => {
    queue.push(json(200, { mfaRequired: true, challenge: 'ch', expiresAt: 5 }))
    const first = await api.login('a@example.com', 'pw')
    expect(first.mfaRequired).toBe(true)
    queue.push(json(200, { user: { id: 'u' } }), json(200, { user: { id: 'u' } }))
    await api.mfaLogin('ch', '123456', { remember: true })
    await api.mfaLogin('ch', 'ABCDE-FGHIJ', { recovery: true })
    expect(calls[1]).toMatchObject({ url: '/api/v1/auth/mfa', body: { challenge: 'ch', code: '123456', remember: true } })
    expect(calls[2].body).toEqual({ challenge: 'ch', recoveryCode: 'ABCDE-FGHIJ', remember: false })
  })

  it('maps every management route', async () => {
    for (let i = 0; i < 11; i++) queue.push(i === 3 || i === 6 || i === 7 || i === 10 ? new Response(null, { status: 204 }) : json(200, {}))
    await api.mfaStatus()
    await api.enrollTotp()
    await api.confirmTotp('123456')
    await api.disableTotp()
    await api.regenerateRecoveryCodes()
    await api.listTrustedDevices()
    await api.forgetTrustedDevices()
    await api.forgetTrustedDevice('d 1')
    await api.getMfaPolicy()
    await api.setMfaPolicy('owner')
    await api.resetMemberMfa('u1')
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/v1/mfa',
      'POST /api/v1/mfa/totp/enroll',
      'POST /api/v1/mfa/totp/confirm',
      'DELETE /api/v1/mfa/totp',
      'POST /api/v1/mfa/recovery-codes/regenerate',
      'GET /api/v1/mfa/trusted-devices',
      'DELETE /api/v1/mfa/trusted-devices',
      'DELETE /api/v1/mfa/trusted-devices/d%201',
      'GET /api/v1/settings/mfa',
      'PUT /api/v1/settings/mfa',
      'POST /api/v1/members/u1/mfa/reset',
    ])
    expect(calls[2].body).toEqual({ code: '123456' })
    expect(calls[9].body).toEqual({ required: 'owner' })
  })
})
