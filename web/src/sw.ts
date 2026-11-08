/// <reference lib="webworker" />
// The app's service worker. It installs the web app from the signed file list
// and serves it (OpenSpec change signed-web-app; the checks are in
// lib/appInstall.ts), handles reminder push (push-sw.js, OpenSpec `reminders`)
// and the share sheet's POST /share with files, handed to the page through
// IndexedDB (attachments D9). While refusal is off (report-only, design D17),
// every check runs and is recorded, and updates are installed anyway.
import { checkForUpdate, cachedFile, fetchLazy, pruneCaches, type CheckOutcome, type InstallEnv } from './lib/appInstall'
import { loadTrust, saveTrust, trustsOwnKey, type TrustRecord } from './lib/appTrust'
import { pagePolicy } from './lib/pagePolicy'
import { entryFromForm, entrySize, putInboxEntry, SHARE_MAX_BYTES, shareRequestVerdict } from './lib/shareInbox'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] }
/** The keys built into this worker (vite.config.ts): the official keys, or an own-key build's key. */
declare const __APP_KEYS__: string[]


// The file list in Workbox's format, kept as data only: the Android app
// versions already installed read it from sw.js for their offline copy
// (ShellCache.precacheEntries), and it makes sw.js change with every release,
// so the browser installs the new worker and its install runs the check
// (design D6). Nothing here reads it.
;(self as unknown as { opentodoPrecache: unknown }).opentodoPrecache = self.__WB_MANIFEST

// Reminder push, notification actions and the shown set (OpenSpec `reminders`).
importScripts('push-sw.js')

const env: InstallEnv = {
  fetch: (path, init) => fetch(new URL(path, self.location.origin).href, init),
  caches: self.caches,
  builtinKeys: __APP_KEYS__,
  now: () => Date.now(),
  load: () => loadTrust(self.indexedDB),
  save: (r) => saveTrust(r, self.indexedDB),
}

// The worker's own state: the trust record, read once per worker start and
// after every write; the check that is running; when the last one started.
const state: { record: Promise<TrustRecord | null> | null; running: Promise<CheckOutcome | null> | null; lastCheck: number } = { record: null, running: null, lastCheck: 0 }
function trust(): Promise<TrustRecord | null> {
  state.record ??= env.load().catch(() => null)
  return state.record
}

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
      state.record = null
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
    await pruneCaches(env, await trust(), true)
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
    state.record = null // another worker may have written it
    const r = await trust()
    const source = event.source as Client | null
    if (r?.lastCheck?.refused && source) source.postMessage({ type: 'opentodo-app', state: 'refused', check: r.lastCheck, ownKey: await trustsOwnKey(r).catch(() => false) })
  })())
})

// Nothing under /api/ (in particular the live event stream) or /healthz is ever
// answered by the app shell or stored in a cache.
// A task page (/t/, task-pages D8) is its own document from the server, never the app.
// The OAuth endpoints and the discovery documents must reach the server too
// (mcp-oauth): answered with the app shell, an authorize navigation showed the
// app and the connection stopped without a code ever being issued. /mcp itself
// is never a navigation, but a GET of it is the server's 405, not the app.
const NAVIGATION_DENYLIST = [/^\/api\//, /^\/healthz/, /^\/t\//, /^\/oauth\//, /^\/\.well-known\//, /^\/mcp$/]
// The server's own addresses: never a script, a worker or a stylesheet (design D7).
const DATA_PATHS = [/^\/api\//, /^\/healthz/, /^\/dav\//, /^\/feeds\//, /^\/oauth\//, /^\/\.well-known\//, /^\/mcp(\/|$)/, /^\/branding\//, /^\/manifest\.webmanifest$/]
const CODE_DESTINATIONS = new Set(['script', 'worker', 'sharedworker', 'style', 'serviceworker'])

// The page's policy follows the owner's settings only in connect-src (the
// on-device assistant's provider origins, assistant-on-device D4): the latest
// policy the server sent, refreshed in the background on every navigation.
const POLICY_CACHE = 'opentodo-policy'
const POLICY_KEY = '/__policy'

async function refreshPolicy(): Promise<void> {
  try {
    const res = await fetch('/', { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' })
    const policy = res.ok ? res.headers.get('Content-Security-Policy') : null
    if (policy) await (await caches.open(POLICY_CACHE)).put(POLICY_KEY, new Response(policy))
  } catch {
    // Offline: the last policy stays.
  }
}

async function navigation(event: FetchEvent): Promise<Response> {
  const r = await trust()
  const page = await cachedFile(env, r, 'index.html')
  event.waitUntil(Promise.all([refreshPolicy(), check()]))
  if (!page) return fetch(event.request)
  const stored = await (await caches.open(POLICY_CACHE)).match(POLICY_KEY).catch(() => undefined)
  const headers = new Headers(page.headers)
  headers.set('Content-Security-Policy', pagePolicy(stored ? await stored.text() : null))
  headers.set('Cache-Control', 'no-cache')
  return new Response(page.body, { status: 200, headers })
}

async function appFile(event: FetchEvent, path: string): Promise<Response> {
  const r = await trust()
  const hit = await cachedFile(env, r, path)
  if (hit) return hit
  if (r) {
    const lazy = await fetchLazy(env, r, path)
    if (lazy) {
      if (lazy.check) {
        state.record = null
        await tell({ state: lazy.check.refused ? 'refused' : 'checked', check: lazy.check })
      }
      return lazy.response
    }
  }
  return fetch(event.request)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === '/share' && request.method === 'POST') {
    event.respondWith(share(request))
    return
  }
  if (request.method !== 'GET') return
  const path = url.pathname
  if (DATA_PATHS.some((re) => re.test(path))) {
    // A JSONP-style answer or a stylesheet from the server's addresses never runs.
    if (CODE_DESTINATIONS.has(request.destination)) event.respondWith(new Response('', { status: 404 }))
    return
  }
  if (request.mode === 'navigate') {
    if (NAVIGATION_DENYLIST.some((re) => re.test(path))) return
    event.respondWith(navigation(event))
    return
  }
  let rel: string
  try { rel = decodeURIComponent(path.slice(1)) } catch { return }
  if (!rel || rel === 'sw.js') return
  event.respondWith(appFile(event, rel).catch(() => fetch(request)))
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
  await putInboxEntry(entry)
  return Response.redirect(`/share?inbox=${encodeURIComponent(id)}`, 303)
}
