/// <reference lib="webworker" />
// The app's service worker. It installs the web app from the signed file list
// and serves it (OpenSpec change signed-web-app; the checks are in
// lib/appInstall.ts), handles reminder push (push-sw.js, bundled in, so the
// list's hash of this file covers it: OpenSpec `reminders`, signed-web-app D1)
// and the share sheet's POST /share with files, handed to the page through
// IndexedDB (attachments D9). While refusal is off (report-only, design D17),
// every check runs and is recorded, and updates are installed anyway.
import { checkForUpdate, cachedFile, fetchLazy, pruneCaches, type CheckOutcome, type InstallEnv } from './lib/appInstall'
import { loadTrust, rememberedMode, trustReader, updateTrust, trustsOwnKey, type TrustRecord, type TrustState } from './lib/appTrust'
import { taskPageId, withAppBanner } from './lib/appBanner'
import { pagePolicy, sandboxed } from './lib/pagePolicy'
import { entryFromForm, entrySize, putInboxEntry, SHARE_MAX_BYTES, shareRequestVerdict } from './lib/shareInbox'
// Reminder push, notification actions and the shown set (OpenSpec `reminders`).
import './push-sw.js'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] }
/** The keys built into this worker (vite.config.ts): the official keys, or an own-key build's key. */
declare const __APP_KEYS__: string[]


// The file list in Workbox's format, kept as data only: the Android app
// versions already installed read it from sw.js for their offline copy
// (ShellCache.precacheEntries), and it makes sw.js change with every release,
// so the browser installs the new worker and its install runs the check
// (design D6). Nothing here reads it.
;(self as unknown as { opentodoPrecache: unknown }).opentodoPrecache = self.__WB_MANIFEST

const env: InstallEnv = {
  fetch: (path, init) => fetch(new URL(path, self.location.origin).href, init),
  caches: self.caches,
  builtinKeys: __APP_KEYS__,
  languages: () => self.navigator.languages ?? [],
  now: () => Date.now(),
  load: () => loadTrust(self.indexedDB),
  // Every write, the update check's included, also sets the record that stands in and the remembered mode.
  update: async (change) => { const r = await updateTrust(change, self.indexedDB); if (r) await records.saved(r); return r },
}

// The worker's own state: the check that is running and when the last one started.
// The trust record is read once per worker start and after every write; a read
// that fails is not kept, and the refusal mode is remembered beside the page
// policy so a worker that cannot read its record still fails closed.
const state: { running: Promise<CheckOutcome | null> | null; lastCheck: number } = { running: null, lastCheck: 0 }
// The page's policy follows the owner's settings only in connect-src (the
// on-device assistant's provider origins, assistant-on-device D4): the latest
// policy the server sent, refreshed in the background on every navigation.
const POLICY_CACHE = 'opentodo-policy'
const POLICY_KEY = '/__policy'
const remembered = rememberedMode(() => caches.open(POLICY_CACHE))
const records = trustReader(env.load, remembered)
/**
 * The refusal mode of the last trust read, for the one decision the fetch handler
 * makes before it can wait: whether to take a form's POST navigation (D7). Null
 * until the first read; it only ever moves to true, like the record.
 */
const mode: { refusing: boolean | null } = { refusing: null }
/** One read of the trust state: a request decides everything from the one it took. */
const trustState = (): Promise<TrustState> => records.read().then((t) => {
  mode.refusing = mode.refusing === true || t.refuse
  return t
})
async function trust(): Promise<TrustRecord | null> {
  return (await records.read()).record
}
/**
 * The answer for an app path that wasn't answered checked, once refusal applies: a
 * 404, never the network (design D7, phase 2). That covers a path the list doesn't
 * name, and, while the record cannot be read, any path the stand-in record (which
 * may be older than the set just installed) can't answer from the cache. Files the
 * stand-in's sets hold in the cache are served: each was checked when it was stored.
 */
const refusedPath = (t: TrustState): Response | null => (t.refuse ? new Response('', { status: 404 }) : null)

async function tell(message: Record<string, unknown>): Promise<void> {
  // An own-key build's refusal names that key instead of OpenTodo (design D11).
  const r = await trust()
  message = { ...message, ownKey: r ? await trustsOwnKey(r).catch(() => false) : false }
  for (const c of await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })) c.postMessage({ type: 'opentodo-app', ...message })
}

const CHECK_EVERY_MS = 60_000

/** One update check at a time; a network failure records nothing and the next check retries. */
function check(force = false): Promise<CheckOutcome | null> {
  if (state.running) return state.running
  if (!force && Date.now() - state.lastCheck < CHECK_EVERY_MS) return Promise.resolve(null)
  state.lastCheck = Date.now()
  state.running = (async () => {
    try {
      const outcome = await checkForUpdate(env)
      records.forget()
      if (outcome.kind === 'installed') await tell({ state: outcome.first ? 'installed' : 'ready', version: outcome.version, check: outcome.check })
      else if (outcome.kind === 'refused' && outcome.announce) await tell({ state: 'refused', check: outcome.check })
      return outcome
    } catch {
      return null
    } finally {
      state.running = null
    }
  })()
  return state.running
}

// The mode is known from the worker's start on (a failed read leaves it unknown).
void trustState().catch(() => undefined)

self.addEventListener('install', (event) => {
  self.skipWaiting()
  // The new worker installs the files of the list the server serves now.
  // A network failure fails the install, and the browser tries again later.
  event.waitUntil(check(true).then((o) => { if (!o) throw new Error('the app could not be installed: offline') }))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim()
    // The caches of the Workbox worker this one replaced, and any set the record no longer names.
    // Never while the record cannot be read: every set would look unnamed.
    // A fresh read, which also remembers the mode early, for a worker that later cannot read its record.
    records.forget()
    const t = await trustState()
    if (!t.unreadable) await pruneCaches(env, t.record, true)
  })())
})

// A page asks on start, on focus, when it comes back online and when a new
// worker takes control. After the check, it is told about a refused update
// it may have missed (the page shows each refusal once).
self.addEventListener('message', (event) => {
  const data = event.data as { type?: string; check?: boolean } | null
  if (data?.type !== 'opentodo-app' || !data.check) return
  event.waitUntil((async () => {
    await check()
    records.forget() // another worker may have written it
    const r = await trust()
    const source = event.source as Client | null
    if (r?.lastCheck?.refused && source) source.postMessage({ type: 'opentodo-app', state: 'refused', check: r.lastCheck, ownKey: await trustsOwnKey(r).catch(() => false) })
  })())
})

// Nothing under /api/ (in particular the live event stream) or /healthz is ever
// answered by the app shell or stored in a cache.
// The OAuth endpoints and the discovery documents must reach the server too
// (mcp-oauth): answered with the app shell, an authorize navigation showed the
// app and the connection stopped without a code ever being issued. /mcp itself
// is never a navigation, but a GET of it is the server's 405, not the app.
// The OpenTodo app's sign-in (app-sign-in) is the same kind of address:
// answered with the app shell, the sign-in sheet showed the web app instead of the
// confirmation, in every browser that had opened the web app before.
const SERVER_PAGES = [/^\/app\/sign-in$/]
// A task page, a note page and a routine email's stop page (task-pages D8,
// note-public-links D1, routines-shared-email D5) are t.html, never the app.
const TASK_PAGES = [/^\/t\//, /^\/n\//, /^\/routine-emails\//]
// A public list page (public-links D7) is the app, with the server's headers.
const PUBLIC_LIST = /^\/public\//
// The server's own addresses: never a script, a worker or a stylesheet, and a page from one is the server's document (design D7).
// The signed list is one: the page reads the server's own (lib/workerChange.ts).
const DATA_PATHS = [/^\/api\//, /^\/healthz/, /^\/dav\//, /^\/feeds\//, /^\/oauth\//, /^\/\.well-known\//, /^\/mcp(\/|$)/, /^\/branding\//, /^\/manifest\.webmanifest$/, /^\/app-manifest\.json$/, PUBLIC_LIST]
const CODE_DESTINATIONS = new Set(['script', 'worker', 'sharedworker', 'style', 'serviceworker'])


async function refreshPolicy(): Promise<void> {
  try {
    const res = await fetch('/', { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' })
    const policy = res.ok ? res.headers.get('Content-Security-Policy') : null
    if (policy) await (await caches.open(POLICY_CACHE)).put(POLICY_KEY, new Response(policy))
  } catch {
    // Offline: the last policy stays.
  }
}

/** The headers the server sends with a task page and a public list (task-pages D8, public-links D7), kept when the worker serves them. */
const TASK_PAGE_HEADERS = { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' }
const PUBLIC_LIST_HEADERS = { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' }

/** A page of the verified set (index.html, or t.html once refusal is on) with the build's policy and `extra` headers. */
async function page(event: FetchEvent, t: TrustState, file: string, extra: Record<string, string> = {}): Promise<Response> {
  event.waitUntil(Promise.all([refreshPolicy(), check()]))
  let doc: Response | null
  try {
    doc = await cachedFile(env, t.record, file)
  } catch {
    // The cache cannot be read: report-only keeps the network (D17), refusal serves nothing unchecked.
    return t.refuse ? new Response('', { status: 404 }) : fetch(event.request)
  }
  if (!doc) {
    // Report-only keeps the network (D17). With refusal the page is served only
    // checked against the record: fetched and checked now, or not at all.
    if (!t.refuse) return fetch(event.request)
    const lazy = t.record ? await fetchLazy(env, t.record, file, !t.unreadable, t.refuse).catch(() => null) : null
    if (!lazy || lazy.check || !lazy.response.ok) return new Response('', { status: 404 })
    doc = lazy.response
  }
  let stored: Response | undefined
  try {
    stored = await (await caches.open(POLICY_CACHE)).match(POLICY_KEY)
  } catch {
    // The stored policy cannot be read: report-only keeps the network, refusal the built-in policy.
    if (!t.refuse) return fetch(event.request)
  }
  const headers = new Headers(doc.headers)
  headers.set('Content-Security-Policy', pagePolicy(stored ? await stored.text() : null))
  headers.set('Cache-Control', 'no-cache')
  for (const [k, v] of Object.entries(extra)) headers.set(k, v)
  // A task's page offers the iPhone app in Safari, as the server's copy does (ios-app-banner):
  // only on the page checked here, so the network's answer passes through untouched.
  const task = file === 'index.html' && doc.ok ? taskPageId(new URL(event.request.url).pathname) : null
  if (task !== null) {
    headers.delete('Content-Length')
    return new Response(withAppBanner(await doc.text(), self.location.origin, task), { status: 200, headers })
  }
  return new Response(await doc.blob(), { status: 200, headers })
}

async function navigation(event: FetchEvent, extra?: Record<string, string>): Promise<Response> {
  return page(event, await trustState(), 'index.html', extra)
}

/**
 * A task page: the server's while reporting; once refusal is on, the verified
 * t.html with the server's headers (design D7, phase 2), so its code is checked
 * like the app's.
 */
async function taskPage(event: FetchEvent): Promise<Response> {
  const t = await trustState()
  return t.refuse ? page(event, t, 't.html', TASK_PAGE_HEADERS) : fetch(event.request)
}

/**
 * A page from one of the server's addresses (an attachment opened in a tab, a
 * sign-in step): the server's own document. Once refusal is on it is
 * sandboxed (design D7, phase 2): no script runs in it, so it cannot read the
 * app's storage.
 */
async function serverDocument(event: FetchEvent): Promise<Response> {
  const t = await trustState()
  const res = await fetch(event.request)
  return t.refuse ? sandboxed(res) : res
}

async function appFile(event: FetchEvent, path: string): Promise<Response> {
  const t = await trustState()
  try {
    const hit = await cachedFile(env, t.record, path)
    if (hit) return hit
    if (t.record) {
      // The mode that applies, not the stand-in's own: a mismatch is served only when report-only.
      const lazy = await fetchLazy(env, t.record, path, !t.unreadable, t.refuse)
      if (lazy) {
        if (lazy.check) {
          records.forget()
          await tell({ state: lazy.check.refused ? 'refused' : 'checked', check: lazy.check })
        }
        return lazy.response
      }
    }
    return refusedPath(t) ?? fetch(event.request)
  } catch {
    // Decided from the same snapshot: no second read within one request.
    return refusedPath(t) ?? fetch(event.request)
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === '/share' && request.method === 'POST') {
    event.respondWith(share(request))
    return
  }
  const path = url.pathname
  const navigate = request.mode === 'navigate'
  // A form's POST navigation (a cross-site one, or one from a sandboxed server page):
  // once refusal is on, its answer is the server's document, sandboxed like any other
  // (design D7). While reporting the browser keeps it, exactly as before. Before the
  // first trust read the mode is unknown: the worker takes it and decides from the
  // record, so a device with refusal on never lets one through unsandboxed.
  if (request.method !== 'GET') {
    if (navigate && mode.refusing !== false) event.respondWith(serverDocument(event))
    return
  }
  if (navigate && PUBLIC_LIST.test(path)) {
    event.respondWith(navigation(event, PUBLIC_LIST_HEADERS))
    return
  }
  if (DATA_PATHS.some((re) => re.test(path))) {
    // A JSONP-style answer or a stylesheet from the server's addresses never runs.
    if (CODE_DESTINATIONS.has(request.destination)) event.respondWith(new Response('', { status: 404 }))
    else if (navigate) event.respondWith(serverDocument(event))
    return
  }
  if (navigate) {
    if (TASK_PAGES.some((re) => re.test(path))) event.respondWith(taskPage(event))
    else if (SERVER_PAGES.some((re) => re.test(path))) event.respondWith(serverDocument(event))
    else event.respondWith(navigation(event))
    return
  }
  let rel: string
  try {
    rel = decodeURIComponent(path.slice(1))
  } catch {
    // Not a path any list can name: with refusal on, a 404 like any other.
    event.respondWith(trustState().then((t) => refusedPath(t) ?? fetch(event.request)))
    return
  }
  // sw.js is the one app path the worker leaves to the network: the browser fetches
  // it for updates without asking the worker, and the changed-worker check reads it.
  if (!rel || rel === 'sw.js') return
  event.respondWith(appFile(event, rel))
})

async function share(request: Request): Promise<Response> {
  // Only the share sheet or the app itself may hand over a share, and only up
  // to a size cap; anything else opens the app without storing a thing. A
  // request that does not say where it came from opens the capture screen,
  // which says why nothing arrived.
  const verdict = shareRequestVerdict(request.headers)
  if (verdict === 'unverified') return Response.redirect('/share?files=unverified', 303)
  if (verdict !== 'store') return Response.redirect('/', 303)
  const id = crypto.randomUUID()
  const entry = entryFromForm(await request.formData(), id)
  if (entrySize(entry) > SHARE_MAX_BYTES) return Response.redirect('/', 303)
  await putInboxEntry(indexedDB, entry)
  return Response.redirect(`/share?inbox=${encodeURIComponent(id)}`, 303)
}
