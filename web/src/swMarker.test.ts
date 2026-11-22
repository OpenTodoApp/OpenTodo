// A worker that cannot read its record from the start, nor the refusal mode it
// remembered, or with none remembered: the mode is unknown, and unknown refuses (precache follow-up).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrustRecord } from './lib/appTrust'

let stored: TrustRecord | null | 'unreadable' = 'unreadable'
vi.mock('./lib/appTrust', async (real) => ({
  ...(await real<typeof import('./lib/appTrust')>()),
  loadTrust: async () => { if (stored === 'unreadable') throw new Error('unreadable'); return stored },
  saveTrust: async () => undefined,
  trustsOwnKey: async () => false,
}))
const lazy = vi.fn(async () => ({ response: new Response('<p>checked</p>', { headers: { 'Content-Type': 'text/html' } }) }))
vi.mock('./lib/appInstall', async (real) => ({
  ...(await real<typeof import('./lib/appInstall')>()),
  cachedFile: async () => null,
  checkForUpdate: async () => ({ kind: 'unchanged' }),
  pruneCaches: async () => undefined,
  fetchLazy: (...a: unknown[]) => lazy(...(a as [])),
}))

const handlers: Record<string, (e: unknown) => void> = {}
const network = vi.fn(async () => new Response('from the network'))
const g = globalThis as Record<string, unknown>
const saved: Record<string, unknown> = {}
let cachesFail = true

beforeAll(async () => {
  for (const k of ['self', 'importScripts', '__APP_KEYS__', 'fetch', 'caches']) saved[k] = g[k]
  g.self = {
    location: { origin: 'https://todo.example.com' },
    addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn },
    clients: { matchAll: async () => [], claim: async () => undefined },
    indexedDB: {}, navigator: { languages: ['en'] }, skipWaiting: () => undefined, __WB_MANIFEST: [],
  }
  g.importScripts = () => undefined
  g.__APP_KEYS__ = []
  g.fetch = network
  g.caches = { open: async () => { if (cachesFail) throw new Error('caches'); return { match: async () => undefined, put: async () => undefined } } }
})
afterAll(() => { for (const [k, v] of Object.entries(saved)) g[k] = v })
// Each test starts a new worker that can read neither its record nor its caches.
beforeEach(async () => {
  stored = 'unreadable'
  cachesFail = true
  network.mockClear(); lazy.mockClear()
  vi.resetModules()
  await import('./sw')
})
/** Requests that could have served content: the page policy's HEAD refresh carries none. */
const served = () => network.mock.calls.filter((c) => (c as unknown[])[1] === undefined || ((c as unknown[])[1] as RequestInit).method !== 'HEAD')

async function respond(path: string, mode: RequestMode = 'cors'): Promise<Response> {
  let responded: Promise<Response> | null = null
  // What the handler reads of a request (a navigation's mode cannot be set on a Request).
  const request = { url: `https://todo.example.com${path}`, method: 'GET', mode, destination: mode === 'navigate' ? 'document' : 'script', headers: new Headers() }
  handlers.fetch({ request, respondWith: (p: Promise<Response>) => { responded = p }, waitUntil: () => undefined })
  return responded!
}

describe('a worker that can read neither its record nor its mode', () => {
  it('answers app files and the page with 404, never the network', async () => {
    expect((await respond('/assets/index-1.js')).status).toBe(404)
    expect((await respond('/inbox', 'navigate')).status).toBe(404)
    expect(served()).toEqual([])
  })

  it('with no remembered mode either: 404, and report-only works once the record can be read', async () => {
    cachesFail = false
    expect((await respond('/assets/index-1.js')).status).toBe(404)
    expect(served()).toEqual([])
    stored = { mode: 'signed', keys: [], refuse: false, announced: [] } as unknown as TrustRecord
    lazy.mockResolvedValueOnce(null as never) // a file the record does not list
    expect(await (await respond('/assets/index-1.js')).text()).toBe('from the network')
  })
})
