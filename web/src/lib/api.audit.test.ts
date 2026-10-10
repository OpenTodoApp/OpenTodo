import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, auditExportUrl, isNetworkError } from './api'

type Call = { url: string; init: RequestInit }
let calls: Call[]
let respond: (url: string, init: RequestInit) => Response
let idbOpen: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  calls = []
  respond = () => new Response('{}', { status: 200 })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return respond(url, init)
  }))
  idbOpen = vi.spyOn(indexedDB, 'open')
})
afterEach(() => {
  // Audit data is server-only: no call in this suite may touch IndexedDB.
  expect(idbOpen).not.toHaveBeenCalled()
  idbOpen.mockRestore()
  vi.unstubAllGlobals()
})

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const event = { id: 7, ts: 1, name: 'login.failed', outcome: 'failure', actorId: null, actorEmail: null, targetId: 'u', targetEmail: 'a@example.com', ip: null, userAgent: 'x', details: { reason: 'wrong_password' } }

describe('audit API client', () => {
  it('lists without filters', async () => {
    respond = () => json(200, { events: [event], cursor: null })
    const res = await api.listAudit()
    expect(res.events[0].name).toBe('login.failed')
    expect(res.cursor).toBeNull()
    expect(calls[0].url).toBe('/api/v1/audit')
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].init.credentials).toBe('same-origin')
  })

  it('encodes filters, cursor and limit', async () => {
    respond = () => json(200, { events: [], cursor: null })
    await api.listAudit({ name: 'login.failed', actor: ' a+b@example.com ', outcome: 'failure', from: 1000.7, to: 2000 }, 42, 100)
    const url = new URL(calls[0].url, 'http://x')
    expect(url.pathname).toBe('/api/v1/audit')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      name: 'login.failed', actor: 'a+b@example.com', outcome: 'failure', from: '1000', to: '2000', cursor: '42', limit: '100',
    })
  })

  it('builds an export URL with the same filters and no paging', () => {
    expect(auditExportUrl()).toBe('/api/v1/audit/export')
    const url = new URL(auditExportUrl({ name: 'login.failed', from: 5, target: '' }), 'http://x')
    expect(url.pathname).toBe('/api/v1/audit/export')
    expect(Object.fromEntries(url.searchParams)).toEqual({ name: 'login.failed', from: '5' })
  })

  it('reads and writes audit settings', async () => {
    respond = () => json(200, { retentionDays: 30, logIp: false })
    expect(await api.getAuditSettings()).toEqual({ retentionDays: 30, logIp: false })
    expect(calls[0].url).toBe('/api/v1/settings/audit')
    await api.updateAuditSettings({ retentionDays: 30 })
    expect(calls[1].init.method).toBe('PUT')
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ retentionDays: 30 })
  })

  it('reads personal activity', async () => {
    respond = () => json(200, { events: [event] })
    const res = await api.myActivity()
    expect(res.events).toHaveLength(1)
    expect(calls[0].url).toBe('/api/v1/me/activity')
  })

  it('surfaces forbidden and offline distinctly', async () => {
    respond = () => json(403, { error: { code: 'forbidden', message: 'only the owner' } })
    const denied = await api.listAudit().catch((e: unknown) => e)
    expect(isNetworkError(denied)).toBe(false)
    respond = () => { throw new TypeError('Failed to fetch') }
    const offline = await api.myActivity().catch((e: unknown) => e)
    expect(isNetworkError(offline)).toBe(true)
  })
})
