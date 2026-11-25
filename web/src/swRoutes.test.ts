// The worker's phase 2 serving rules (OpenSpec change signed-web-app, design D7,
// task 7.2), which apply once refusal is on for the device: a path the list
// doesn't name gets a 404, never the network; task pages come from the verified
// t.html and public lists from the verified index.html, with the server's headers;
// a document from one of the server's addresses runs no script. While reporting,
// each of them reaches the server as before.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrustRecord } from './lib/appTrust'
import { SERVER_DOCUMENT_POLICY } from './lib/pagePolicy'
import { workerCaches } from './test/workerCaches'

const files = { 'index.html': { sha256: 'a', size: 1, load: 'install' }, 't.html': { sha256: 'b', size: 1, load: 'lazy' } }
const record = (refuse: boolean): TrustRecord => ({
  mode: 'signed', keys: [], refuse, announced: [],
  current: { version: '1.0.0', payloadHash: 'h', cache: 'opentodo-app-1', at: 0, files },
} as unknown as TrustRecord)

let stored: TrustRecord | null = null
vi.mock('./lib/appTrust', async (real) => ({
  ...(await real<typeof import('./lib/appTrust')>()),
  loadTrust: async () => stored,
  updateTrust: async () => null,
  trustsOwnKey: async () => false,
}))
/** What the verified set holds (cachedFile), and what the checked download of a lazy file answers. */
let cached: Record<string, string> = {}
let lazy: Record<string, { body: string; changed?: boolean }> = {}
vi.mock('./lib/appInstall', async (real) => ({
  ...(await real<typeof import('./lib/appInstall')>()),
  cachedFile: async (_env: unknown, _r: unknown, path: string) => (path in cached ? new Response(cached[path], { headers: { 'Content-Type': 'text/html' } }) : null),
  checkForUpdate: async () => ({ kind: 'unchanged' }),
  pruneCaches: async () => undefined,
  fetchLazy: async (_env: unknown, r: TrustRecord, path: string) => {
    if (!(path in (r.current?.files ?? {}))) return null
    const got = lazy[path]
    if (!got) return { response: new Response('', { status: 404 }) }
    return got.changed ? { response: new Response('', { status: 404 }), check: { passed: false, cause: 'changed-file', path, refused: true } } : { response: new Response(got.body, { headers: { 'Content-Type': 'text/html' } }) }
  },
}))

const handlers: Record<string, (e: unknown) => void> = {}
const SERVER_CSP = "default-src 'none'; sandbox"
let served: () => Response = () => new Response('from the server', { headers: { 'Content-Security-Policy': SERVER_CSP } })
const network = vi.fn(async (_input?: unknown) => served())
const g = globalThis as Record<string, unknown>
const saved: Record<string, unknown> = {}
const shared = workerCaches()

beforeAll(() => {
  for (const k of ['self', '__APP_KEYS__', 'fetch', 'caches']) saved[k] = g[k]
  g.self = {
    location: { origin: 'https://todo.example.com' },
    addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn },
    clients: { matchAll: async () => [], claim: async () => undefined },
    indexedDB: {}, navigator: { languages: ['en'] }, skipWaiting: () => undefined,
    __WB_MANIFEST: [],
  }
  g.caches = shared.caches
  g.__APP_KEYS__ = []
  g.fetch = network
})
afterAll(() => { for (const [k, v] of Object.entries(saved)) g[k] = v })
beforeEach(async () => {
  stored = null
  cached = { 'index.html': '<div id=root></div>' }
  lazy = { 't.html': { body: '<title>task page</title>' } }
  served = () => new Response('from the server', { headers: { 'Content-Security-Policy': SERVER_CSP } })
  shared.reset()
  vi.resetModules()
  await import('./sw')
  network.mockClear()
})

/** Dispatches a GET through the worker's fetch handler: null when the worker left it to the browser. */
function answer(path: string, mode: RequestMode | 'navigate' = 'cors', destination = ''): Promise<Response> | null {
  let responded: Promise<Response> | null = null
  const request = { url: `https://todo.example.com${path}`, method: 'GET', mode, destination, headers: new Headers() }
  handlers.fetch({ request, respondWith: (p: Promise<Response>) => { responded = p }, waitUntil: () => undefined })
  return responded
}
const navigate = (path: string) => answer(path, 'navigate', 'document')
const fromServer = () => network.mock.calls.some(([req]) => typeof req === 'object' && req !== null && 'mode' in req)

describe('while reporting (refusal off)', () => {
  beforeEach(() => { stored = record(false) })

  it('asks the network for a path the list does not name', async () => {
    expect(await answer('/robots.txt')!.then((r) => r.text())).toBe('from the server')
  })

  it('leaves task pages, note pages and stop pages to the server, never the app', async () => {
    for (const p of ['/t/abc', '/n/abc', '/routine-emails/abc']) {
      network.mockClear()
      expect(await navigate(p)!.then((r) => r.text()), p).toBe('from the server')
      expect(fromServer(), p).toBe(true)
    }
  })

  it('passes a server document through unchanged', async () => {
    const r = await navigate('/api/v1/attachments/1')!
    expect(r.headers.get('Content-Security-Policy')).toBe(SERVER_CSP)
  })

  it('serves a public list from the verified page with the server headers', async () => {
    const r = await navigate('/public/list-abc')!
    expect(await r.text()).toBe('<div id=root></div>')
    expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(r.headers.get('Referrer-Policy')).toBe('no-referrer')
  })
})

describe('with refusal on', () => {
  beforeEach(() => { stored = record(true) })

  it('answers 404 for a path the list does not name, without asking the network', async () => {
    for (const p of ['/robots.txt', '/assets/injected-1.js', '/push-sw.js']) {
      expect((await answer(p, 'no-cors', 'script')!).status, p).toBe(404)
    }
    expect(network).not.toHaveBeenCalled()
  })

  it('serves a task page from the verified t.html with the server headers and the build policy', async () => {
    for (const p of ['/t/abc', '/n/abc', '/routine-emails/abc']) {
      const r = await navigate(p)!
      expect(await r.text(), p).toBe('<title>task page</title>')
      expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
      expect(r.headers.get('Referrer-Policy')).toBe('no-referrer')
      expect(r.headers.get('Cache-Control')).toBe('no-store')
      expect(r.headers.get('Content-Security-Policy')).toContain("script-src 'self'")
    }
    expect(fromServer()).toBe(false)
  })

  it('answers 404 for a task page whose t.html does not match the list', async () => {
    lazy = { 't.html': { body: 'changed', changed: true } }
    expect((await navigate('/t/abc')!).status).toBe(404)
    expect(fromServer()).toBe(false)
  })

  it('adds the sandbox to a document from the server, keeping its own policy and body', async () => {
    for (const p of ['/api/v1/attachments/1', '/api/v1/auth/oidc/app-continue', '/app/sign-in', '/healthz', '/dav/x', '/.well-known/x']) {
      const r = await navigate(p)!
      expect(await r.text(), p).toBe('from the server')
      expect(r.headers.get('Content-Security-Policy'), p).toBe(`${SERVER_CSP}, ${SERVER_DOCUMENT_POLICY}`)
    }
    // No script runs in it; forms and the origin stay, for the sign-in steps that post.
    expect(SERVER_DOCUMENT_POLICY.split(' ')).toEqual(['sandbox', 'allow-forms', 'allow-same-origin'])
  })

  it('passes a redirect as it is, and keeps a response without a body', async () => {
    const redirect = Object.defineProperty(new Response(null, { status: 200 }), 'type', { value: 'opaqueredirect' })
    served = () => redirect
    expect(await navigate('/oauth/authorize')!).toBe(redirect)
    served = () => new Response(null, { status: 204 })
    const empty = await navigate('/api/v1/nothing')!
    expect(empty.status).toBe(204)
    expect(empty.headers.get('Content-Security-Policy')).toBe(SERVER_DOCUMENT_POLICY)
  })

  it('never loads code from a data path, public lists included', async () => {
    for (const p of ['/api/v1/x', '/public/x', '/branding/logo.svg']) {
      expect((await answer(p, 'no-cors', 'script')!).status, p).toBe(404)
    }
    expect(network).not.toHaveBeenCalled()
  })

  it('leaves the API, sw.js and the list of files to the network (the changed-worker check reads both)', () => {
    expect(answer('/api/v1/tasks')).toBeNull()
    expect(answer('/sw.js')).toBeNull()
    expect(answer('/app-manifest.json')).toBeNull()
  })
})
