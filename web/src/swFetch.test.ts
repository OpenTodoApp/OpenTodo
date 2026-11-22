// The worker's fetch handler (precache-device-language D3a): when handling a request
// for a listed file throws, the handler's own catch answers 404 with refusal on and
// never asks the network; while reporting it keeps the network, as designed (D17).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrustRecord } from './lib/appTrust'

const record = (refuse: boolean): TrustRecord => ({
  mode: 'signed', keys: [], refuse, announced: [],
  current: { version: '1.0.0', payloadHash: 'h', cache: 'opentodo-app-1', at: 0, files: { 'assets/lang-de-1.js': { sha256: 'x', size: 1, load: 'lazy', lang: 'de' } } },
} as unknown as TrustRecord)

let stored: TrustRecord | null = null
vi.mock('./lib/appTrust', () => ({
  loadTrust: async () => stored,
  saveTrust: async () => undefined,
  trustsOwnKey: async () => false,
}))
vi.mock('./lib/appInstall', async (real) => ({
  ...(await real<typeof import('./lib/appInstall')>()),
  cachedFile: async () => null,
  checkForUpdate: async () => ({ kind: 'unchanged' }),
  pruneCaches: async () => undefined,
  // Something inside appFile throws after the list was read (storage, a hash, a message).
  fetchLazy: async () => { throw new Error('storage failed') },
}))

const handlers: Record<string, (e: unknown) => void> = {}
const network = vi.fn(async () => new Response('from the network'))
const g = globalThis as Record<string, unknown>
const saved: Record<string, unknown> = {}

beforeAll(async () => {
  for (const k of ['self', 'importScripts', '__APP_KEYS__', 'fetch']) saved[k] = g[k]
  g.self = {
    location: { origin: 'https://todo.example.com' },
    addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn },
    clients: { matchAll: async () => [], claim: async () => undefined },
    caches: {}, indexedDB: {}, navigator: { languages: ['de'] }, skipWaiting: () => undefined,
    __WB_MANIFEST: [],
  }
  g.importScripts = () => undefined
  g.__APP_KEYS__ = []
  g.fetch = network
  await import('./sw')
})
afterAll(() => { for (const [k, v] of Object.entries(saved)) g[k] = v })
beforeEach(() => network.mockClear())

/** Dispatches a GET through the worker's fetch handler and returns what it answered. */
async function answer(path: string): Promise<Response> {
  let responded: Promise<Response> | null = null
  handlers.fetch({ request: new Request(`https://todo.example.com${path}`), respondWith: (p: Promise<Response>) => { responded = p }, waitUntil: () => undefined })
  expect(responded).not.toBeNull()
  return responded!
}

describe('the worker fetch handler after a failure', () => {
  it('answers 404 for a listed file with refusal on, without asking the network', async () => {
    stored = record(true)
    const r = await answer('/assets/lang-de-1.js')
    expect(r.status).toBe(404)
    expect(network).not.toHaveBeenCalled()
  })

  it('keeps the network while reporting (refusal off)', async () => {
    stored = record(false)
    // The worker re-reads its record after a check, as it does when a page asks.
    let done: Promise<unknown> = Promise.resolve()
    handlers.message({ data: { type: 'opentodo-app', check: true }, source: null, waitUntil: (p: Promise<unknown>) => { done = p } })
    await done
    const r = await answer('/assets/lang-de-1.js')
    expect(await r.text()).toBe('from the network')
    expect(network).toHaveBeenCalledOnce()
  })
})
