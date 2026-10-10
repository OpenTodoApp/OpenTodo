import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, isNetworkError } from './api'

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

describe('invitation API client', () => {
  it('lists invitations', async () => {
    respond = () => json(200, { invitations: [{ id: 'i1', status: 'pending', email: null }] })
    const res = await api.listInvitations()
    expect(res.invitations[0].status).toBe('pending')
    expect(calls[0].url).toBe('/api/v1/invitations')
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].init.credentials).toBe('same-origin')
  })

  it('creates an invitation and returns the one-time link', async () => {
    respond = () => json(201, { invitation: { id: 'i1', status: 'pending', email: 'a@example.com' }, link: 'http://h/invite/oti_x' })
    const res = await api.createInvitation({ email: 'a@example.com', expiresInHours: 48 })
    expect(res.link).toBe('http://h/invite/oti_x')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: 'a@example.com', expiresInHours: 48 })
  })

  it('sends an empty object for an open invitation with defaults', async () => {
    respond = () => json(201, { invitation: { id: 'i1' }, link: 'x' })
    await api.createInvitation()
    expect(JSON.parse(calls[0].init.body as string)).toEqual({})
  })

  it('revokes and treats 204 as success', async () => {
    respond = () => new Response(null, { status: 204 })
    await expect(api.revokeInvitation('i1')).resolves.toBeUndefined()
    expect(calls[0].url).toBe('/api/v1/invitations/i1')
    expect(calls[0].init.method).toBe('DELETE')
  })

  it('previews a token without credentials being required and encodes it', async () => {
    respond = () => json(200, { inviterName: 'Owner', email: null, expiresAt: 1 })
    const p = await api.previewInvitation('oti_a/b')
    expect(p.inviterName).toBe('Owner')
    expect(calls[0].url).toBe('/api/v1/invitations/oti_a%2Fb')
  })

  it('maps error envelopes to ApiError with the server code', async () => {
    respond = () => json(404, { error: { code: 'invitation_invalid', message: 'nope' } })
    const err = await api.previewInvitation('oti_bad').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('invitation_invalid')
    expect((err as ApiError).status).toBe(404)
    expect(isNetworkError(err)).toBe(false)
  })

  it('registers with an invitation secret only when one is given', async () => {
    respond = () => json(201, { user: { id: 'u', role: 'member' } })
    await api.register('a@example.com', 'A', 'a long passphrase', 'oti_secret')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: 'a@example.com', name: 'A', password: 'a long passphrase', invitation: 'oti_secret' })
    await api.register('b@example.com', '', 'a long passphrase')
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ email: 'b@example.com', name: '', password: 'a long passphrase' })
  })

  it('reports fetch failures as network errors', async () => {
    respond = () => { throw new TypeError('Failed to fetch') }
    const err = await api.listInvitations().catch((e: unknown) => e)
    expect(isNetworkError(err)).toBe(true)
  })
})
