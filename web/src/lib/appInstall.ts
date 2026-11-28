// How the service worker checks, installs and serves the web app (OpenSpec
// change signed-web-app, design D5 to D7 and D17). It fetches app-manifest.json,
// checks who signed it with the keys this device trusts, refuses older
// versions, downloads every file needed offline into a staging cache, checks
// each file's size and SHA-256, and switches to the new set in one write of the
// trust record. While refusal is off (report-only, the first releases), every
// check runs and its result is recorded, but the update is installed anyway.
// sw.ts wires this to the worker's events; the tests run it with fakes.
import { compareVersions, MANIFEST_PATH, parseList, sha256Hex, verifyList, type ManifestFile, type ParsedList } from './appCode'
import type { CheckCause, CheckResult, InstalledVersion, TrustMode, TrustRecord } from './appTrust'
import { uuid } from './ids'

export interface InstallEnv {
  /** A same-origin fetch from the worker (never through its own fetch handler). */
  fetch: (path: string, init?: RequestInit) => Promise<Response>
  caches: CacheStorage
  /** The keys built into this worker: the official keys, or an own-key build's key. */
  builtinKeys: readonly string[]
  /** The device's languages (the worker's navigator.languages), for a list that names no catalogue's language. */
  languages?: () => readonly string[]
  now: () => number
  load: () => Promise<TrustRecord | null>
  /** Changes the record as stored in one transaction (`updateTrust`): null from `change` leaves it. Every write goes through it. */
  update: (change: (stored: TrustRecord | null) => TrustRecord | null) => Promise<TrustRecord | null>
}

export type CheckOutcome =
  | { kind: 'unchanged' }
  | { kind: 'installed'; version: string; first: boolean; check: CheckResult }
  | { kind: 'refused'; check: CheckResult; announce: boolean }

/** Every cache this module owns starts with this; the rest of the worker's caches are left alone. */
export const APP_CACHE_PREFIX = 'opentodo-app-'
const DOWNLOADS = 6

class Interrupted extends Error {}

/** The cache key of a listed file. */
export function cacheKey(path: string): string {
  return '/' + path
}

interface Verdict {
  cause?: CheckCause
  /** The mode and keys the device moves to when the update is installed. */
  mode: TrustMode
  keys: string[]
  signer?: string
  /** The signature verified with a trusted key (and, in signed mode, the version is newer). */
  verified: boolean
}

/** Checks the list's signature and version against the record (D5, D6). */
async function judge(list: ParsedList, payloadHash: string, record: TrustRecord | null, builtin: readonly string[]): Promise<Verdict> {
  const m = list.manifest
  const unsignedMode: TrustMode = m.build === 'preview' ? 'preview' : 'self-built'
  if (record?.mode === 'signed') {
    const sig = await verifyList(list, record.keys)
    const base = { mode: 'signed' as TrustMode, keys: record.keys, signer: record.signer }
    if ('error' in sig) return { ...base, cause: sig.error, verified: false }
    // An older version, or the same version with other files, is a downgrade.
    const order = compareVersions(m.version, record.verified?.version ?? '')
    if (order < 0 || (order === 0 && record.verified?.payloadHash !== payloadHash)) {
      return { ...base, cause: 'older', verified: false }
    }
    return { mode: 'signed', keys: m.keys.map((k) => k.spki), signer: sig.signer, verified: true }
  }
  // First use, or self-built: a list signed by a key built into this worker
  // moves the device to signed mode; anything else is self-built (D5).
  const sig = await verifyList(list, builtin)
  if ('signer' in sig) return { mode: 'signed', keys: m.keys.map((k) => k.spki), signer: sig.signer, verified: true }
  return { mode: unsignedMode, keys: [], verified: false }
}

async function download(env: InstallEnv, path: string): Promise<{ body: ArrayBuffer; type: string | null } | null> {
  let res: Response
  try {
    // Hashed assets never change; everything else is revalidated.
    res = await env.fetch(cacheKey(path), { cache: path.startsWith('assets/') ? 'default' : 'no-cache', credentials: 'same-origin', redirect: 'error' })
  } catch {
    throw new Interrupted(path)
  }
  if (!res.ok) return null
  try {
    return { body: await res.arrayBuffer(), type: typeFor(path) ?? res.headers.get('Content-Type') }
  } catch {
    throw new Interrupted(path)
  }
}

/** The type of a listed file from its extension, so the server's header never decides how checked bytes run. */
const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', ico: 'image/x-icon', woff2: 'font/woff2',
  md: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8', wasm: 'application/wasm',
}
function typeFor(path: string): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase()
  return (ext && TYPES[ext]) || null
}

/** A stored copy of a file, with only the headers the worker writes. */
export function fileResponse(body: BodyInit | null, type: string | null): Response {
  const headers = new Headers({ 'X-Content-Type-Options': 'nosniff' })
  if (type) headers.set('Content-Type', type)
  return new Response(body, { status: 200, headers })
}

interface StageResult { failure?: { cause: CheckCause; path: string } }

/**
 * The languages whose interface catalogue the current set holds: those the
 * device has used (precache-device-language D3). The cache is the record, so
 * a first install holds none and a cleared cache forgets them.
 */
async function heldLanguages(current: InstalledVersion | undefined, currentCache: Cache | null, languages: readonly string[] = []): Promise<Set<string>> {
  const held = new Set<string>()
  if (!current || !currentCache) return held
  // A list from before catalogues named their language installed every catalogue:
  // the device's own languages stand in for the ones it used.
  if (!Object.values(current.files).some((f) => f.lang)) {
    for (const tag of languages) held.add(tag.toLowerCase().split('-')[0])
    return held
  }
  for (const [path, f] of Object.entries(current.files)) {
    if (f.lang && !held.has(f.lang) && (await currentCache.match(cacheKey(path)))) held.add(f.lang)
  }
  return held
}

/**
 * Downloads every install file, and the catalogues of the languages the
 * current set holds, into the staging cache, reusing unchanged files
 * of the current version. With stopOnFailure (refusal on), the first file that
 * fails stops the download; otherwise every file is stored as served and the
 * first failure is reported. A network error throws Interrupted.
 */
async function stage(env: InstallEnv, staging: Cache, files: Record<string, ManifestFile>, current: InstalledVersion | undefined, stopOnFailure: boolean): Promise<StageResult> {
  const result: StageResult = {}
  const currentCache = current ? await env.caches.open(current.cache) : null
  const held = await heldLanguages(current, currentCache, env.languages?.() ?? [])
  const queue = Object.keys(files).filter((p) => files[p].load === 'install' || (files[p].lang !== undefined && held.has(files[p].lang!))).sort()
  const fail = (cause: CheckCause, path: string) => {
    if (!result.failure || path < result.failure.path) result.failure = { cause, path }
  }
  const worker = async () => {
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
      if (stopOnFailure && result.failure) return
      const want = files[path]
      if (currentCache && current?.files[path]?.sha256 === want.sha256) {
        const kept = await currentCache.match(cacheKey(path))
        if (kept) { await staging.put(cacheKey(path), kept); continue }
      }
      const got = await download(env, path)
      if (!got) { fail('missing-file', path); continue }
      if (got.body.byteLength !== want.size || (await sha256Hex(got.body)) !== want.sha256) {
        fail('changed-file', path)
        if (stopOnFailure) return
      }
      await staging.put(cacheKey(path), fileResponse(got.body, got.type))
    }
  }
  await Promise.all(Array.from({ length: DOWNLOADS }, worker))
  return result
}

/**
 * A staging cache is named after the version, the list and the time the check
 * started: two workers (the active one and a new one installing) may check at
 * once, and each stages into its own cache, never one the other deletes.
 */
export function stagingName(version: string, payloadHash: string, now: number): string {
  // A random tail after the start time keeps two installs of one list apart, also within
  // one millisecond; the time still parses (base 36 stops at the dot).
  return `${APP_CACHE_PREFIX}${version}-${payloadHash.slice(0, 12)}-${now.toString(36)}.${uuid().slice(0, 8)}`
}

/** A staging cache younger than this may still be filling in another worker. */
const STAGING_GRACE_MS = 10 * 60_000

/** Deletes this module's caches that the record no longer names, except recent ones another check may be filling. */
export async function pruneCaches(env: Pick<InstallEnv, 'caches'> & Partial<Pick<InstallEnv, 'now'>>, record: TrustRecord | null, alsoLegacy = false): Promise<void> {
  const keep = new Set([record?.current?.cache, record?.previous?.cache].filter(Boolean))
  const now = env.now?.() ?? Date.now()
  for (const name of await env.caches.keys()) {
    if (alsoLegacy && name.startsWith('workbox-precache')) await env.caches.delete(name)
    if (!name.startsWith(APP_CACHE_PREFIX) || keep.has(name)) continue
    const started = parseInt(name.slice(name.lastIndexOf('-') + 1), 36)
    if (Number.isFinite(started) && now - started < STAGING_GRACE_MS && started <= now) continue
    await env.caches.delete(name)
  }
}

function announceOnce(record: TrustRecord, payloadHash: string): boolean {
  if (record.announced.includes(payloadHash)) return false
  record.announced = [...record.announced, payloadHash].slice(-5)
  return true
}

/**
 * One check: fetch the list, judge it, stage and switch (or refuse). Throws
 * when the network fails, so nothing is recorded and the next check retries.
 */
export async function checkForUpdate(env: InstallEnv): Promise<CheckOutcome> {
  let res: Response
  try {
    res = await env.fetch(cacheKey(MANIFEST_PATH), { cache: 'no-store', credentials: 'same-origin', redirect: 'error' })
  } catch {
    throw new Interrupted(MANIFEST_PATH)
  }
  const text = res.ok ? await res.text() : ''
  const list = res.ok ? parseList(text) : null
  const record = await env.load()
  const now = env.now()
  // Every write goes onto the record as stored, in one transaction, and only while it is
  // still the one this check started from: another worker (an open tab's worker beside
  // the one installing) may have installed or refused meanwhile, and its write stays.
  // The installed set by its cache, unique per install: a list installed again since has a new one.
  const unchanged = (stored: TrustRecord | null) => (stored?.current?.cache ?? null) === (record?.current?.cache ?? null)
    && !!stored?.refuse === !!record?.refuse && stored?.mode === record?.mode
  /** Records a check on the stored record; answers whether it announces, false when nothing was written. */
  const recordCheck = async (check: CheckResult, announceKey: string | null): Promise<boolean> => {
    let announce = false
    await env.update((stored) => {
      if (!stored || !unchanged(stored)) return null
      const next = { ...stored, lastCheck: check }
      announce = announceKey !== null && announceOnce(next, announceKey)
      return next
    })
    return announce
  }
  if (!list) {
    // No readable list: a server older than signed-web-app answers 404 (self-built).
    if (!record) return { kind: 'unchanged' }
    const check: CheckResult = { at: now, version: record.current?.version ?? '', passed: false, cause: 'no-list', refused: record.refuse }
    const announce = await recordCheck(check, record.refuse ? 'no-list:' + (await sha256Hex(new TextEncoder().encode(text))) : null)
    return record.refuse ? { kind: 'refused', check, announce } : { kind: 'unchanged' }
  }
  const payloadHash = await sha256Hex(list.payload)
  if (record?.current?.payloadHash === payloadHash) return { kind: 'unchanged' }
  // Refusals are remembered by the whole list, signatures included.
  const listHash = await sha256Hex(new TextEncoder().encode(text))

  const refuse = record?.refuse === true
  // A refused list is judged once; the same list again changes nothing.
  if (refuse && record.lastCheck?.refused && record.announced.includes(listHash)) return { kind: 'refused', check: record.lastCheck, announce: false }
  const verdict = await judge(list, payloadHash, record, env.builtinKeys)
  const version = list.manifest.version
  if (verdict.cause && refuse) {
    const check: CheckResult = { at: now, version, passed: false, cause: verdict.cause, refused: true }
    const announce = await recordCheck(check, listHash)
    return { kind: 'refused', check, announce }
  }

  const cacheName = stagingName(version, payloadHash, now)
  const staging = await env.caches.open(cacheName)
  let staged: StageResult
  try {
    staged = await stage(env, staging, list.manifest.files, record?.current, refuse)
  } catch (err) {
    await env.caches.delete(cacheName)
    throw err
  }
  const cause = verdict.cause ?? staged.failure?.cause
  const check: CheckResult = { at: now, version, passed: !cause, refused: false, ...(cause ? { cause } : {}), ...(!verdict.cause && staged.failure ? { path: staged.failure.path } : {}) }
  if (cause && refuse) {
    await env.caches.delete(cacheName)
    check.refused = true
    const announce = await recordCheck(check, listHash)
    return { kind: 'refused', check, announce }
  }

  // Install: the staged set becomes current in one write. The mode, the keys
  // and refusal move forward only on a check that passed, or on first use (D17).
  const installed: InstalledVersion = { version, payloadHash, cache: cacheName, files: list.manifest.files, at: now }
  if (typeof list.manifest.worker?.sha256 === 'string') installed.worker = list.manifest.worker.sha256
  const first = !record
  const passed = !cause
  // First use decides the mode; after that only a passing check moves it, and
  // in signed mode judge() never answers an unsigned mode.
  const moves = first || passed
  const next: TrustRecord = {
    mode: moves ? verdict.mode : record!.mode,
    keys: moves ? verdict.keys : record!.keys,
    refuse: refuse || (passed && verdict.verified && list.manifest.refuse),
    current: installed,
    lastCheck: check,
    announced: record?.announced ?? [],
  }
  const signer = moves ? verdict.signer : record?.signer
  if (signer) next.signer = signer
  const verified = verdict.verified && moves ? { version, payloadHash } : record?.verified
  if (verified) next.verified = verified
  if (record?.current) next.previous = record.current
  // The announced lists stay the stored record's own (a refusal recorded meanwhile).
  const written = await env.update((stored) => (unchanged(stored) ? { ...next, announced: stored?.announced ?? next.announced } : null))
  if (!written) {
    // Overtaken: the record another worker wrote stays, and this staged set goes.
    await env.caches.delete(cacheName)
    return { kind: 'unchanged' }
  }
  await pruneCaches(env, written)
  return { kind: 'installed', version, first, check }
}

/**
 * The installed copy of a listed file, from the current set or, for an older open tab, the previous one.
 * The stored body is read whole here and answered as a new response, never the
 * cache's own: Chromium can drop a stored body handed straight to respondWith()
 * while the page is still reading it, when the worker collects garbage, and the
 * page gets net::ERR_ABORTED (GitHub issue 1363: one failed static import and
 * the app never starts). Read here, a failed read is the worker's to handle: the
 * file comes from the other set, or from the server.
 */
export async function cachedFile(env: Pick<InstallEnv, 'caches'>, record: TrustRecord | null, path: string): Promise<Response | null> {
  for (const v of [record?.current, record?.previous]) {
    if (!v || !(path in v.files)) continue
    const hit = await (await env.caches.open(v.cache)).match(cacheKey(path))
    if (!hit) continue
    try {
      return fileResponse(await hit.blob(), hit.headers.get('Content-Type'))
    } catch {
      // Unreadable: the other set, or the server.
    }
  }
  return null
}

export type LazyResult = { response: Response; check?: CheckResult }

/**
 * A listed file that isn't stored yet (a lazy chunk such as the map): fetched,
 * checked against the current list and stored when it matches (D7). A mismatch
 * is recorded; with refusal on it fails the request, while reporting the
 * served file is used but never stored. A listed file that could not be
 * downloaded answers 404: a listed file is only ever served checked, so the
 * caller never asks the network for it again on its own. `refuse` is the mode
 * that applies, the record's own unless the caller knows better (a stand-in record).
 */
export async function fetchLazy(env: InstallEnv, record: TrustRecord, path: string, persist = true, refuse = record.refuse): Promise<LazyResult | null> {
  const want = record.current?.files[path] ?? record.previous?.files[path]
  if (!want) return null
  const got = await download(env, path).catch(() => null)
  if (!got) return { response: new Response('', { status: 404 }) }
  if (got.body.byteLength === want.size && (await sha256Hex(got.body)) === want.sha256) {
    const holder = record.current?.files[path]?.sha256 === want.sha256 ? record.current : record.previous
    // A store that fails (storage full) only means the file is fetched again next time: it was checked.
    if (holder) await env.caches.open(holder.cache).then((c) => c.put(cacheKey(path), fileResponse(got.body.slice(0), got.type))).catch(() => undefined)
    return { response: fileResponse(got.body, got.type) }
  }
  const check: CheckResult = { at: env.now(), version: record.current?.version ?? '', passed: false, cause: 'changed-file', path, refused: refuse }
  // `persist` false: the record in use stands in for one that could not be read, and
  // writing it back could replace a newer one.
  // The check is recorded on the record as stored, and only while it still holds the
  // set that was checked: another worker may have installed a newer one meanwhile.
  if (persist) await env.update((stored) => (stored && stored.current?.cache === record.current?.cache ? { ...stored, lastCheck: check } : null)).catch(() => undefined)
  if (refuse) return { response: new Response('', { status: 404 }), check }
  return { response: fileResponse(got.body, got.type), check }
}
