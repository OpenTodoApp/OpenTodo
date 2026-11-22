// A listed file that is not cached yet, checked by the real fetchLazy while the record
// cannot be read (precache follow-up): the mode that applies decides, not the stand-in's
// own. A report-only stand-in with refusal remembered, or no mode remembered, never
// serves bytes that do not match the list.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrustRecord } from './lib/appTrust'
import { workerCaches } from './test/workerCaches'

const reportOnly = {
  mode: 'signed', keys: [], refuse: false, announced: [],
  current: { version: '1', payloadHash: 'h', cache: 'set-1', at: 0, files: { 'assets/map-1.js': { sha256: '0'.repeat(64), size: 8, load: 'lazy' } } },
} as unknown as TrustRecord

let stored: TrustRecord | 'unreadable' = reportOnly
const save = vi.fn(async () => undefined)
vi.mock('./lib/appTrust', async (real) => ({
  ...(await real<typeof import('./lib/appTrust')>()),
  loadTrust: async () => { if (stored === 'unreadable') throw new Error('unreadable'); return stored },
  saveTrust: () => save(),
  trustsOwnKey: async () => false,
}))
vi.mock('./lib/appInstall', async (real) => ({
  ...(await real<typeof import('./lib/appInstall')>()),
  checkForUpdate: async () => ({ kind: 'unchanged' }),
}))

const handlers: Record<string, (e: unknown) => void> = {}
// The server answers bytes that do not match the list.
const network = vi.fn(async () => new Response('tampered', { headers: { 'Content-Type': 'text/javascript' } }))
const g = globalThis as Record<string, unknown>
const saved: Record<string, unknown> = {}
const shared = workerCaches()

beforeAll(() => {
  for (const k of ['self', 'importScripts', '__APP_KEYS__', 'fetch', 'caches']) saved[k] = g[k]
  g.caches = shared.caches
  g.self = {
    caches: g.caches,
    location: { origin: 'https://todo.example.com' },
    addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn },
    clients: { matchAll: async () => [], claim: async () => undefined },
    indexedDB: {}, navigator: { languages: ['en'] }, skipWaiting: () => undefined, __WB_MANIFEST: [],
  }
  g.importScripts = () => undefined
  g.__APP_KEYS__ = []
  g.fetch = network
})
afterAll(() => { for (const [k, v] of Object.entries(saved)) g[k] = v })

/** A new worker that read the report-only record once, then lost its store. */
beforeEach(async () => {
  stored = reportOnly
  shared.reset()
  save.mockClear()
  vi.resetModules()
  await import('./sw')
  await respond('/assets/other-1.js')
  stored = 'unreadable'
  let done: Promise<unknown> = Promise.resolve()
  handlers.message({ data: { type: 'opentodo-app', check: true }, source: null, waitUntil: (p: Promise<unknown>) => { done = p } })
  await done
  shared.setMode(null) // what the first read remembered: each test sets its own
  network.mockClear()
})

async function respond(path: string): Promise<Response> {
  let responded: Promise<Response> | null = null
  handlers.fetch({ request: { url: `https://todo.example.com${path}`, method: 'GET', mode: 'cors', destination: 'script', headers: new Headers() }, respondWith: (p: Promise<Response>) => { responded = p }, waitUntil: () => undefined })
  return responded!
}

describe('a listed file that does not match, while the record cannot be read', () => {
  it('with refusal remembered since: 404, though the stand-in is report-only', async () => {
    shared.setMode('1')
    expect((await respond('/assets/map-1.js')).status).toBe(404)
    expect(network).toHaveBeenCalledOnce() // the checked download, whose bytes are not served
    expect(save).not.toHaveBeenCalled()
  })

  it('with no mode remembered: 404', async () => {
    expect((await respond('/assets/map-1.js')).status).toBe(404)
  })

  it('with report-only remembered: served and recorded, as report-only does (D17), without saving the stand-in', async () => {
    shared.setMode('0')
    expect(await (await respond('/assets/map-1.js')).text()).toBe('tampered')
    expect(network).toHaveBeenCalledOnce()
    expect(save).not.toHaveBeenCalled()
  })
})
