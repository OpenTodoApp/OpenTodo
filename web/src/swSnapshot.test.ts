// One trust snapshot per request (precache follow-up): a request decides from the one
// read it took; every save the worker makes stands in and sets the remembered mode,
// which only ever turns on, also between workers; a stand-in record older than the set
// just installed never lets a file through; the stand-in path goes through the checked
// download without saving; activate neither prunes while the record cannot be read nor
// forgets the mode. Each test starts a new worker on the same caches.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrustRecord } from './lib/appTrust'
import { workerCaches } from './test/workerCaches'

const recordWith = (files: string[]): TrustRecord => ({
  mode: 'signed', keys: [], refuse: true, announced: [],
  current: { version: '1', payloadHash: 'h', cache: 'c', at: 0, files: Object.fromEntries(files.map((f) => [f, { sha256: 'x', size: 1, load: 'lazy' }])) },
} as unknown as TrustRecord)
const older = recordWith(['assets/old-1.js'])
const reportOnly = (r: TrustRecord) => ({ ...r, refuse: false }) as TrustRecord
let update: TrustRecord | null = null
let cacheFails = false

/** What each load answers, in order: a record or 'fail'. The last answer repeats. A held load waits for `gate`. */
let loads: (TrustRecord | 'fail')[] = []
let gate: Promise<TrustRecord> | null = null
const load = vi.fn(async () => {
  if (gate) { const held = gate; gate = null; return held }
  const next = loads.length > 1 ? loads.shift()! : loads[0]
  if (next === 'fail') throw new Error('unreadable')
  return next
})
vi.mock('./lib/appTrust', async (real) => ({
  ...(await real<typeof import('./lib/appTrust')>()),
  loadTrust: () => load(),
  updateTrust: async (change: (s: null) => TrustRecord | null) => change(null),
  trustsOwnKey: async () => false,
}))
const lazy = vi.fn(async (_env: unknown, record: TrustRecord, path: string) => (path in (record.current?.files ?? {}) ? { response: new Response('checked') } : null))
const prune = vi.fn(async () => undefined)
vi.mock('./lib/appInstall', async (real) => ({
  ...(await real<typeof import('./lib/appInstall')>()),
  cachedFile: async () => { if (cacheFails) throw new Error('caches'); return null },
  // An update the test sets is written through the worker's env, as checkForUpdate writes.
  checkForUpdate: async (env: { update: (change: () => TrustRecord) => Promise<TrustRecord | null> }) => {
    if (!update) return { kind: 'unchanged' }
    const next = update
    await env.update(() => next)
    update = null
    return { kind: 'installed', first: false, version: '2', check: {} }
  },
  pruneCaches: (...a: unknown[]) => prune(...(a as [])),
  fetchLazy: (...a: unknown[]) => lazy(...(a as [unknown, TrustRecord, string])),
}))

let handlers: Record<string, (e: unknown) => void> = {}
const network = vi.fn(async () => new Response('from the network'))
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
  g.fetch = network
  g.caches = shared.caches
})
afterAll(() => { for (const [k, v] of Object.entries(saved)) g[k] = v })

/** Starts a new worker on the same caches; its handlers become the ones the helpers use. */
async function startWorker(): Promise<Record<string, (e: unknown) => void>> {
  handlers = {}
  vi.resetModules()
  await import('./sw')
  return handlers
}
beforeEach(async () => {
  shared.reset(); update = null; cacheFails = false; gate = null
  await startWorker()
})

/** The worker read `record`, then (unless kept readable) its store failed. */
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
  return respondFrom(handlers, path)
}
async function respondFrom(h: Record<string, (e: unknown) => void>, path: string): Promise<Response> {
  let responded: Promise<Response> | null = null
  h.fetch({ request: { url: `https://todo.example.com${path}`, method: 'GET', mode: 'cors', destination: 'script', headers: new Headers() }, respondWith: (p: Promise<Response>) => { responded = p }, waitUntil: () => undefined })
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

async function navigate(): Promise<Response> {
  let responded: Promise<Response> | null = null
  handlers.fetch({ request: { url: 'https://todo.example.com/inbox', method: 'GET', mode: 'navigate', destination: 'document', headers: new Headers() }, respondWith: (p: Promise<Response>) => { responded = p }, waitUntil: () => undefined })
  return responded!
}

describe('the worker decides each request from one snapshot', () => {
  it('activate remembers a refusing record\'s mode', async () => {
    await standIn(older, true)
    shared.setMode(null)
    await activate()
    expect(shared.mode()).toBe('1')
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
    const refusing = recordWith(['assets/new-1.js'])
    await standIn(reportOnly(older), true)
    expect(shared.mode()).toBe('0')
    update = refusing
    loads = ['fail']
    await install()
    expect(shared.mode()).toBe('1')
    expect(await (await respond('/assets/new-1.js')).text()).toBe('checked')
    expect(lazy).toHaveBeenCalledWith(expect.anything(), refusing, 'assets/new-1.js', false, true)
    expect((await respond('/assets/other-1.js')).status).toBe(404)
    expect(network).not.toHaveBeenCalled()
  })

  it('a report-only stand-in does not override a refusal another worker remembered since', async () => {
    await standIn(reportOnly(older))
    shared.setMode('1')
    expect((await respond('/assets/other-1.js')).status).toBe(404)
    expect(network).not.toHaveBeenCalled()
  })

  it('a page the stored policy cannot be read for: report-only goes to the network', async () => {
    await standIn(reportOnly(older), true)
    shared.fail(true)
    expect(await (await navigate()).text()).toBe('from the network')
  })

  it('a page whose cache cannot be read, report-only: the network', async () => {
    await standIn(reportOnly(older), true)
    cacheFails = true
    expect(await (await navigate()).text()).toBe('from the network')
  })

  it('a page whose cache cannot be read, with refusal: 404', async () => {
    await standIn(older, true)
    cacheFails = true
    expect((await navigate()).status).toBe(404)
  })

  it('an empty or corrupt remembered mode counts as unknown, and refuses', async () => {
    await standIn(reportOnly(older))
    for (const v of ['', 'garbage', 'false']) {
      shared.setMode(v)
      expect((await respond('/assets/other-1.js')).status).toBe(404)
    }
    shared.setMode('0')
    expect(await (await respond('/assets/other-1.js')).text()).toBe('from the network')
  })

  it('two workers: a report-only read that ends after another worker saved refusal never turns it off', async () => {
    // Worker A starts a read that the store answers late, with the record as it was.
    let release: (r: TrustRecord) => void = () => undefined
    gate = new Promise((resolve) => { release = resolve })
    const a = handlers
    const slow = respondFrom(a, '/assets/old-1.js')
    // Worker B installs a refusing set meanwhile.
    await startWorker()
    loads = [recordWith(['assets/new-1.js'])]
    update = recordWith(['assets/new-1.js'])
    await install()
    expect(shared.mode()).toBe('1')
    // A's read ends with the report-only record and remembers its mode.
    release(reportOnly(older))
    await slow
    expect(shared.mode()).toBe('1')
    // A worker that cannot read its record refuses.
    await startWorker()
    loads = ['fail']
    network.mockClear()
    expect((await respond('/assets/other-1.js')).status).toBe(404)
    expect(network).not.toHaveBeenCalled()
  })
})
