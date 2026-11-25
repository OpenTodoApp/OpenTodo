// The worker serves a task's page from its cached copy with the Smart App Banner the
// server's copy carries (ios-app-banner D4); every other page is served as cached.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrustRecord } from './lib/appTrust'
import { workerCaches } from './test/workerCaches'

const record = { mode: 'signed', keys: [], refuse: true, announced: [], current: { version: '1', payloadHash: 'h', cache: 'c', at: 0, files: {} } } as unknown as TrustRecord
vi.mock('./lib/appTrust', async (real) => ({
  ...(await real<typeof import('./lib/appTrust')>()),
  loadTrust: async () => record,
  updateTrust: async () => null,
  trustsOwnKey: async () => false,
}))
const PAGE = '<!doctype html><html><head><title>OpenTodo</title></head><body></body></html>'
vi.mock('./lib/appInstall', async (real) => ({
  ...(await real<typeof import('./lib/appInstall')>()),
  cachedFile: async (_env: unknown, _r: unknown, path: string) => (path === 'index.html' ? new Response(PAGE, { headers: { 'Content-Type': 'text/html' } }) : null),
  checkForUpdate: async () => ({ kind: 'unchanged' }),
  pruneCaches: async () => undefined,
  fetchLazy: async () => null,
}))

const handlers: Record<string, (e: unknown) => void> = {}
const g = globalThis as Record<string, unknown>
const saved: Record<string, unknown> = {}
const shared = workerCaches()

beforeAll(() => {
  for (const k of ['self', 'importScripts', '__APP_KEYS__', 'fetch', 'caches']) saved[k] = g[k]
  g.self = {
    location: { origin: 'https://todo.example.com' },
    addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn },
    clients: { matchAll: async () => [], claim: async () => undefined },
    indexedDB: {}, navigator: { languages: ['en'] }, skipWaiting: () => undefined, __WB_MANIFEST: [],
  }
  g.importScripts = () => undefined
  g.__APP_KEYS__ = []
  g.fetch = vi.fn(async () => new Response('from the network'))
  g.caches = shared.caches
})
afterAll(() => { for (const [k, v] of Object.entries(saved)) g[k] = v })
beforeEach(async () => {
  shared.reset()
  vi.resetModules()
  await import('./sw')
})

async function navigate(path: string): Promise<string> {
  let responded: Promise<Response> | null = null
  handlers.fetch({ request: { url: `https://todo.example.com${path}`, method: 'GET', mode: 'navigate', destination: 'document', headers: new Headers() }, respondWith: (p: Promise<Response>) => { responded = p }, waitUntil: () => undefined })
  return (await responded!).text()
}

describe('the app banner in the worker', () => {
  it('is on a task page served from the cache', async () => {
    expect(await navigate('/task/abc')).toContain('<head><meta name="apple-itunes-app" content="app-id=6832200428, app-argument=https://todo.example.com/task/abc"><title>')
  })

  it('is on no other page', async () => {
    for (const p of ['/inbox', '/', '/task/a/b']) expect(await navigate(p)).toBe(PAGE)
  })
})
