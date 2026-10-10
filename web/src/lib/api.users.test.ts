import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'

type Call = { url: string; init: RequestInit }
let calls: Call[]
let respond: (url: string, init: RequestInit) => Response

beforeEach(() => {
  calls = []
  respond = () => new Response('{}', { status: 200 })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return respond(url, init)
  }))
})
afterEach(() => vi.unstubAllGlobals())

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const body = (i = 0) => (calls[i].init.body ? JSON.parse(calls[i].init.body as string) : undefined)

describe('user administration API client', () => {
  it('lists users', async () => {
    respond = () => json(200, { users: [{ id: 'u1', role: 'owner', status: 'active', lastLoginAt: null }] })
    const res = await api.listUsers()
    expect(res.users[0].status).toBe('active')
    expect(calls[0].url).toBe('/api/v1/users')
    expect(calls[0].init.method).toBe('GET')
  })

  it('sends one narrow request per action', async () => {
    respond = () => json(200, { user: { id: 'u 1' } })
    await api.setUserRole('u 1', 'admin')
    await api.deactivateUser('u 1')
    await api.reactivateUser('u 1')
    await api.transferOwnership('u 1', 'my password')
    expect(calls.map((c) => [c.init.method, c.url])).toEqual([
      ['PUT', '/api/v1/users/u%201/role'],
      ['POST', '/api/v1/users/u%201/deactivate'],
      ['POST', '/api/v1/users/u%201/reactivate'],
      ['POST', '/api/v1/users/u%201/transfer-ownership'],
    ])
    expect(body(0)).toEqual({ role: 'admin' })
    expect(body(3)).toEqual({ password: 'my password' })
  })

  it('deletes with the confirmation email in the body', async () => {
    respond = () => new Response(null, { status: 204 })
    await expect(api.deleteUser('u1', 'm@example.com')).resolves.toBeUndefined()
    expect(calls[0].init.method).toBe('DELETE')
    expect(body()).toEqual({ confirmEmail: 'm@example.com' })
  })

  it('issues a reset link with an optional expiry', async () => {
    respond = () => json(201, { expiresAt: 1, link: 'http://h/reset/otr_x' })
    expect((await api.issuePasswordReset('u1')).link).toBe('http://h/reset/otr_x')
    await api.issuePasswordReset('u1', 2)
    expect(body(0)).toEqual({})
    expect(body(1)).toEqual({ expiresInHours: 2 })
    expect(calls[0].url).toBe('/api/v1/users/u1/password-reset')
  })

  it('changes the own password', async () => {
    respond = () => new Response(null, { status: 204 })
    await api.changePassword('old password!', 'new password!')
    expect(calls[0].url).toBe('/api/v1/me/password')
    expect(body()).toEqual({ currentPassword: 'old password!', newPassword: 'new password!' })
  })

  it('previews and uses a reset link, encoding the token', async () => {
    respond = (_url, init) => (init.method === 'GET' ? json(200, { email: 'm@example.com', expiresAt: 1 }) : new Response(null, { status: 204 }))
    expect((await api.previewPasswordReset('otr_a/b')).email).toBe('m@example.com')
    await api.resetPassword('otr_a/b', 'a new password')
    expect(calls[0].url).toBe('/api/v1/password-resets/otr_a%2Fb')
    expect(calls[1].init.method).toBe('POST')
    expect(body(1)).toEqual({ password: 'a new password' })
  })

  it('maps the new error codes', async () => {
    for (const code of ['self_action', 'account_deactivated', 'account_active', 'confirmation_mismatch', 'reset_invalid']) {
      respond = () => json(409, { error: { code, message: code } })
      const err = await api.deactivateUser('u1').catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).code).toBe(code)
    }
  })
})
