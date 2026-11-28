// The worker serves a task's page from its cached copy with the Smart App Banner the
// server's copy carries, naming its own origin (ios-app-banner D4); every other page
// is served as cached. The banner goes only on the page page() checked (signed-web-app
// D7, D17): never on a page the checks refused, and while reporting the server's
// copy passes through untouched.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrustRecord } from './lib/appTrust'
import { workerCaches } from './test/workerCaches'

let refuse = true
const record = () => ({ mode: 'signed', keys: [], refuse, announced: [], current: { version: '1', payloadHash: 'h', cache: 'c', at: 0, files: { 'index.html': { sha256: 'a', size: 1, load: 'install' } } } }) as unknown as TrustRecord
vi.mock('./lib/appTrust', async (real) => ({
  ...(await real<typeof import('./lib/appTrust')>()),
  loadTrust: async () => record(),
  updateTrust: async () => null,
  trustsOwnKey: async () => false,
}))
const PAGE = '<!doctype html><html><head><title>OpenTodo</title></head><body></body></html>'
const SERVED = PAGE.replace('<head>', '<head><meta name="apple-itunes-app" content="app-id=6832200428, app-argument=https://todo.example.com/task/abc">')
const html = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': String(body.length) } })
/** Whether index.html is in the verified cache, and what its checked download answers when it isn't. */
let inCache = true
/** The server's answer to a navigation. */
let served = () => html(SERVED)
let lazy: 'verified' | 'changed' = 'verified'
vi.mock('./lib/appInstall', async (real) => ({
  ...(await real<typeof import('./lib/appInstall')>()),
  cachedFile: async (_env: unknown, _r: unknown, path: string) => (inCache && path === 'index.html' ? html(PAGE) : null),
  checkForUpdate: async () => ({ kind: 'unchanged' }),
  pruneCaches: async () => undefined,
  fetchLazy: async () => (lazy === 'verified' ? { response: html(PAGE) } : { response: new Response('', { status: 404 }), check: { passed: false, cause: 'changed-file', path: 'index.html', refused: true } }),
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
  g.fetch = vi.fn(async (input: unknown) => (input === '/' ? new Response('') : served()))
  g.caches = shared.caches
})
afterAll(() => { for (const [k, v] of Object.entries(saved)) g[k] = v })
beforeEach(async () => {
  refuse = true
  inCache = true
  lazy = 'verified'
  served = () => html(SERVED)
  shared.reset()
  vi.resetModules()
  await import('./sw')
})

async function navigate(path: string): Promise<Response> {
  let responded: Promise<Response> | null = null
  handlers.fetch({ request: { url: `https://todo.example.com${path}`, method: 'GET', mode: 'navigate', destination: 'document', headers: new Headers() }, respondWith: (p: Promise<Response>) => { responded = p }, waitUntil: () => undefined })
  return responded!
}

describe('the app banner in the worker', () => {
  it('is on a task page served from the cache, with the page\'s headers', async () => {
    const res = await navigate('/task/abc')
    const other = await navigate('/inbox')
    expect(await res.text()).toContain('<head><meta name="apple-itunes-app" content="app-id=6832200428, app-argument=https://todo.example.com/task/abc"><title>')
    expect(res.headers.get('Content-Length')).toBeNull()
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('Content-Security-Policy')).toBeTruthy()
    expect(res.headers.get('Content-Security-Policy')).toBe(other.headers.get('Content-Security-Policy'))
  })

  it('is on no other page', async () => {
    for (const p of ['/inbox', '/', '/task/a/b', '/task/abc/', '/task/a%2Fb']) expect(await (await navigate(p)).text()).toBe(PAGE)
  })

  it('is on a page refusal fetched and checked just now', async () => {
    inCache = false
    expect(await (await navigate('/task/abc')).text()).toContain('app-argument=https://todo.example.com/task/abc"><title>')
  })

  it('is not added to a page the checks refused', async () => {
    inCache = false
    lazy = 'changed'
    const res = await navigate('/task/abc')
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('')
  })

  /** A worker that read the reporting record as it started, with no cached page. */
  async function reporting(): Promise<void> {
    refuse = false
    inCache = false
    shared.reset()
    vi.resetModules()
    await import('./sw')
  }

  it('leaves the server\'s copy untouched while reporting: the same response, unread', async () => {
    await reporting()
    const server = html(SERVED)
    served = () => server
    const res = await navigate('/task/abc')
    expect(res).toBe(server)
    expect(res.bodyUsed).toBe(false)
    expect(await res.text()).toBe(SERVED)
  })

  it('leaves a server error untouched while reporting', async () => {
    await reporting()
    const server = new Response(PAGE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    served = () => server
    const res = await navigate('/task/abc')
    expect(res).toBe(server)
    expect(res.bodyUsed).toBe(false)
    expect(res.status).toBe(503)
    expect(await res.text()).toBe(PAGE)
  })
})
