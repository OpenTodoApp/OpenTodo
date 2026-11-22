// One trust snapshot per request (precache follow-up): a request decides from the one
// read it took, every save the worker makes stands in and sets the remembered mode, a stand-in record older than the set just installed never lets a file
// through, the stand-in path goes through the checked download without saving, and
// activate neither prunes while the record cannot be read nor forgets the mode.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrustRecord } from './lib/appTrust'

const recordWith = (files: string[]): TrustRecord => ({
  mode: 'signed', keys: [], refuse: true, announced: [],
  current: { version: '1', payloadHash: 'h', cache: 'c', at: 0, files: Object.fromEntries(files.map((f) => [f, { sha256: 'x', size: 1, load: 'lazy' }])) },
} as unknown as TrustRecord)
const older = recordWith(['assets/old-1.js'])
let update: TrustRecord | null = null
let cacheFails = false

/** What each load answers, in order: a record or 'fail'. The last answer repeats. */
let loads: (TrustRecord | 'fail')[] = []
const load = vi.fn(async () => {
  const next = loads.length > 1 ? loads.shift()! : loads[0]
  if (next === 'fail') throw new Error('unreadable')
  return next
})
vi.mock('./lib/appTrust', async (real) => ({
  ...(await real<typeof import('./lib/appTrust')>()),
  loadTrust: () => load(),
  saveTrust: async () => undefined,
  trustsOwnKey: async () => false,
}))
const lazy = vi.fn(async (_env: unknown, record: TrustRecord, path: string) => (path in (record.current?.files ?? {}) ? { response: new Response('checked') } : null))
const prune = vi.fn(async () => undefined)
vi.mock('./lib/appInstall', async (real) => ({
  ...(await real<typeof import('./lib/appInstall')>()),
  cachedFile: async () => { if (cacheFails) throw new Error('caches'); return null },
  // An update the test sets is saved through the worker's env, as checkForUpdate saves.
  checkForUpdate: async (env: { save: (r: TrustRecord) => Promise<void> }) => {
    if (!update) return { kind: 'unchanged' }
    await env.save(update)
    update = null
    return { kind: 'installed', first: false, version: '2', check: {} }
  },
  pruneCaches: (...a: unknown[]) => prune(...(a as [])),
  fetchLazy: (...a: unknown[]) => lazy(...(a as [unknown, TrustRecord, string])),
}))

const handlers: Record<string, (e: unknown) => void> = {}
const network = vi.fn(async () => new Response('from the network'))
const g = globalThis as Record<string, unknown>
const saved: Record<string, unknown> = {}
let marker: string | null = null
let markerFails = false

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
  g.caches = {
    open: async () => {
      if (markerFails) throw new Error('caches')
      return { match: async () => (marker === null ? undefined : new Response(marker)), put: async (_k: string, r: Response) => { marker = await r.text() } }
    },
  }
  await import('./sw')
})
afterAll(() => { for (const [k, v] of Object.entries(saved)) g[k] = v })
beforeEach(() => { marker = null; markerFails = false; update = null; cacheFails = false })

/** Every test starts from its own state: the worker read `record`, then (unless kept readable) its store failed. */
async function standIn(record: TrustRecord, readable = false) {
  loads = [record]
  await reread()
  if (!readable) { loads = ['fail']; await reread() }
  network.mockClear(); lazy.mockClear(); prune.mockClear(); load.mockClear()
}

/** Lets the worker read its record again, as it does after a check a page asks for. */
async function reread() {
  let done: Promise<unknown> = Promise.resolve()
  handlers.message({ data: { type: 'opentodo-app', check: true }, source: null, waitUntil: (p: Promise<unknown>) => { done = p } })
  await done
}
async function respond(path: string): Promise<Response> {
  let responded: Promise<Response> | null = null
  handlers.fetch({ request: { url: `https://todo.example.com${path}`, method: 'GET', mode: 'cors', destination: 'script', headers: new Headers() }, respondWith: (p: Promise<Response>) => { responded = p }, waitUntil: () => undefined })
  return responded!
}
async function install() {
  let done: Promise<unknown> = Promise.resolve()
  handlers.install({ waitUntil: (p: Promise<unknown>) => { done = p } })
  await done
}
async function activate() {
  let done: Promise<unknown> = Promise.resolve()
  handlers.activate({ waitUntil: (p: Promise<unknown>) => { done = p } })
  await done
}

describe('the worker decides each request from one snapshot', () => {
  it('activate remembers a refusing record\'s mode', async () => {
    await standIn(older, true)
    marker = null
    await activate()
    expect(marker).toBe('1')
    expect(prune).toHaveBeenCalledOnce()
  })

  it('a read that fails, then one that would succeed: the request still answers from its own (404), no network', async () => {
    // The re-read below takes the first failure; the request's own read takes the second,
    // and a further read (which the handler must not make) would succeed.
    await standIn(older, true)
    loads = ['fail', 'fail', recordWith(['assets/new-1.js'])]
    await reread()
    load.mockClear()
    const r = await respond('/assets/new-1.js')
    expect(r.status).toBe(404)
    expect(load).toHaveBeenCalledOnce()
    expect(network).not.toHaveBeenCalled()
  })

  it('a stand-in older than the set just installed: a file it does not list gets 404, not the network', async () => {
    await standIn(older)
    expect((await respond('/assets/new-1.js')).status).toBe(404)
    expect(network).not.toHaveBeenCalled()
  })

  it('a file the stand-in lists goes through the checked download, without saving the stand-in', async () => {
    await standIn(older)
    expect(await (await respond('/assets/old-1.js')).text()).toBe('checked')
    expect(lazy).toHaveBeenCalledWith(expect.anything(), older, 'assets/old-1.js', false, true)
  })

  it('activate does not prune while the record cannot be read', async () => {
    await standIn(older)
    await activate()
    expect(prune).not.toHaveBeenCalled()
  })

  it('after the update check saves a refusing set, a forget and a failed read: the new set stands in, refusing', async () => {
    const reportOnly = { ...recordWith(['assets/old-1.js']), refuse: false } as TrustRecord
    const refusing = recordWith(['assets/new-1.js'])
    await standIn(reportOnly, true)
    expect(marker).toBe('0')
    update = refusing
    loads = ['fail']
    await install()
    expect(marker).toBe('1')
    expect(await (await respond('/assets/new-1.js')).text()).toBe('checked')
    expect(lazy).toHaveBeenCalledWith(expect.anything(), refusing, 'assets/new-1.js', false, true)
    expect((await respond('/assets/other-1.js')).status).toBe(404)
    expect(network).not.toHaveBeenCalled()
  })

  it('a report-only stand-in does not override a refusal another worker remembered since', async () => {
    await standIn({ ...older, refuse: false } as TrustRecord)
    marker = '1'
    expect((await respond('/assets/other-1.js')).status).toBe(404)
    expect(network).not.toHaveBeenCalled()
  })

  it('a page the stored policy cannot be read for: report-only goes to the network', async () => {
    await standIn({ ...older, refuse: false } as TrustRecord, true)
    markerFails = true
    let responded: Promise<Response> | null = null
    handlers.fetch({ request: { url: 'https://todo.example.com/inbox', method: 'GET', mode: 'navigate', destination: 'document', headers: new Headers() }, respondWith: (p: Promise<Response>) => { responded = p }, waitUntil: () => undefined })
    expect(await (await responded!).text()).toBe('from the network')
  })

  it('a page whose cache cannot be read: the network when report-only, 404 with refusal', async () => {
    const navigate = async () => {
      let responded: Promise<Response> | null = null
      handlers.fetch({ request: { url: 'https://todo.example.com/inbox', method: 'GET', mode: 'navigate', destination: 'document', headers: new Headers() }, respondWith: (p: Promise<Response>) => { responded = p }, waitUntil: () => undefined })
      return responded!
    }
    await standIn({ ...older, refuse: false } as TrustRecord, true)
    cacheFails = true
    expect(await (await navigate()).text()).toBe('from the network')
    await standIn(older, true)
    cacheFails = true
    expect((await navigate()).status).toBe(404)
  })
})
