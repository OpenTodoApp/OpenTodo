import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { base64Decode, fingerprint } from './appCode'
import { checkForUpdate, cachedFile, fetchLazy, pruneCaches, stagingName, type InstallEnv } from './appInstall'
import { loadTrust, updateTrust, type TrustRecord } from './appTrust'
import { clearLocalData } from './db'

// The worker's checks (OpenSpec change signed-web-app, tasks 3.1 to 3.3), run
// with an in-memory server, cache storage and trust record. Lists are signed
// with the test keys of internal/websign/testdata, as the e2e test does.

const testdata = path.resolve(process.cwd(), '../internal/websign/testdata')

async function loadKey(file: string): Promise<{ spki: string; key: CryptoKey }> {
  const pem = readFileSync(path.join(testdata, file), 'utf8')
  const der = base64Decode(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''))
  const key = await crypto.subtle.importKey('pkcs8', der as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
  const { createPrivateKey, createPublicKey } = await import('node:crypto')
  const spki = createPublicKey(createPrivateKey(pem)).export({ type: 'spki', format: 'der' }).toString('base64')
  return { spki, key }
}

const keys: Record<'release' | 'recovery' | 'unknown', { spki: string; key: CryptoKey }> = {} as never

class MemoryCache {
  entries = new Map<string, { body: ArrayBuffer; headers: [string, string][] }>()
  async match(key: string) {
    const e = this.entries.get(key)
    return e ? new Response(e.body.slice(0), { headers: e.headers }) : undefined
  }
  async put(key: string, res: Response) {
    this.entries.set(key, { body: await res.arrayBuffer(), headers: [...res.headers] })
  }
}

class MemoryCaches {
  stores = new Map<string, MemoryCache>()
  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new MemoryCache())
    return this.stores.get(name)!
  }
  async delete(name: string) { return this.stores.delete(name) }
  async keys() { return [...this.stores.keys()] }
  async has(name: string) { return this.stores.has(name) }
}

type Signer = 'release' | 'recovery' | 'unknown'

interface Release {
  version: string
  files: Record<string, string>
  lazy?: string[]
  /** Catalogues: path → language (lazy, precache-device-language D2). */
  langs?: Record<string, string>
  refuse?: boolean
  build?: string
  signers?: Signer[]
  /** Keys the list names; the release and recovery keys by default. */
  names?: Signer[]
  /** What the server serves in place of a listed file. */
  served?: Record<string, string | null>
}

const sha = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex')

async function envelope(r: Release): Promise<string> {
  const files: Record<string, { sha256: string; size: number; load: string; lang?: string }> = {}
  for (const [p, body] of Object.entries(r.files)) {
    const lang = r.langs?.[p]
    files[p] = { sha256: sha(body), size: Buffer.byteLength(body), load: r.lazy?.includes(p) || lang ? 'lazy' : 'install', ...(lang ? { lang } : {}) }
  }
  const payload = Buffer.from(JSON.stringify({
    app: 'opentodo-web', version: r.version, ...(r.build ? { build: r.build } : {}), refuse: r.refuse ?? false,
    keys: (r.names ?? ['release', 'recovery']).map((n) => ({ spki: keys[n].spki, role: n })),
    worker: { path: 'sw.js', sha256: sha(r.files['sw.js'] ?? '') }, files,
  }))
  const message = Buffer.concat([Buffer.from('opentodo-web-manifest/v1\n'), payload])
  const signatures = []
  for (const n of r.signers ?? []) {
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys[n].key, message))
    signatures.push({ key: await fingerprint(keys[n].spki), sig: Buffer.from(sig).toString('base64url') })
  }
  return JSON.stringify({ format: 1, payload: payload.toString('base64url'), signatures })
}

/** A server serving one release; offline and per-file failures on demand. */
function server() {
  const s = {
    release: null as Release | null,
    list: '' as string | null,
    offline: false,
    dropAfter: -1,
    requests: [] as string[],
    async serve(r: Release) { s.release = r; s.list = await envelope(r) },
    fetch: async (p: string) => {
      s.requests.push(p)
      if (s.offline) throw new TypeError('offline')
      if (s.dropAfter === 0) throw new TypeError('connection lost')
      if (s.dropAfter > 0) s.dropAfter--
      const rel = p.slice(1)
      if (rel === 'app-manifest.json') return s.list === null ? new Response('not found', { status: 404 }) : new Response(s.list)
      const served = s.release?.served && rel in s.release.served ? s.release.served[rel] : s.release?.files[rel]
      if (served === null || served === undefined) return new Response('', { status: 404 })
      return new Response(served, { headers: { 'Content-Type': rel.endsWith('.html') ? 'text/html' : 'text/javascript' } })
    },
  }
  return s
}

function env(srv: ReturnType<typeof server>, caches = new MemoryCaches(), builtin: Signer[] = ['release', 'recovery'], languages: string[] = []) {
  let record: TrustRecord | null = null
  const e: InstallEnv & { caches: MemoryCaches; record: () => TrustRecord; save: (r: TrustRecord) => Promise<void> } = {
    fetch: srv.fetch,
    caches: caches as unknown as CacheStorage & MemoryCaches,
    builtinKeys: builtin.map((n) => keys[n].spki),
    languages: () => languages,
    now: () => 1_700_000_000_000,
    load: async () => (record ? structuredClone(record) : null),
    save: async (r: TrustRecord) => { record = structuredClone(r) },
    update: async (change: (stored: TrustRecord | null) => TrustRecord | null) => {
      const next = change(record ? structuredClone(record) : null)
      if (next) record = structuredClone(next)
      return next
    },
    record: () => record!,
  } as never
  return e
}

const v1: Release = { version: '1.3.0', files: { 'index.html': '<div id=root>1</div>', 'sw.js': 'w1', 'assets/index-1.js': 'one', 'assets/MapView-1.js': 'map1' }, lazy: ['assets/MapView-1.js'], signers: ['release'] }
const v2: Release = { version: '1.4.0', files: { 'index.html': '<div id=root>2</div>', 'sw.js': 'w2', 'assets/index-2.js': 'two', 'assets/MapView-1.js': 'map1' }, lazy: ['assets/MapView-1.js'], signers: ['release'] }

async function text(r: Response | null) { return r ? r.text() : null }

beforeEach(async () => {
  keys.release = await loadKey('test-key.pem')
  keys.recovery = await loadKey('test-recovery-key.pem')
  const { generateKeyPairSync } = await import('node:crypto')
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  keys.unknown = {
    spki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    key: await crypto.subtle.importKey('pkcs8', privateKey.export({ type: 'pkcs8', format: 'der' }) as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']),
  }
})

describe('first install', () => {
  it('trusts a list signed by a built-in key: signed mode, every install file cached', async () => {
    const srv = server()
    await srv.serve(v1)
    const e = env(srv)
    const out = await checkForUpdate(e)
    expect(out).toMatchObject({ kind: 'installed', first: true, check: { passed: true, refused: false } })
    const r = e.record()
    expect(r).toMatchObject({ mode: 'signed', refuse: false, signer: await fingerprint(keys.release.spki), verified: { version: '1.3.0' } })
    expect(r.keys).toEqual([keys.release.spki, keys.recovery.spki])
    // The worker the list names, for the changed-worker warning (D8).
    expect(r.current?.worker).toBe(sha('w1'))
    // The type comes from the file's name, never from the server, and is never sniffed.
    const page = (await cachedFile(e, r, 'index.html'))!
    expect(page.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(page.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await text(await cachedFile(e, r, 'index.html'))).toBe('<div id=root>1</div>')
    expect(await cachedFile(e, r, 'assets/MapView-1.js')).toBeNull()
    expect(srv.requests).not.toContain('/assets/MapView-1.js')
  })

  it('is self-built for an unsigned list or an unknown key, and preview for a preview build', async () => {
    const cases: [Release, string][] = [[{ ...v1, signers: [] }, 'self-built'], [{ ...v1, signers: ['unknown'] }, 'self-built'], [{ ...v1, signers: [], build: 'preview' }, 'preview']]
    for (const [release, mode] of cases) {
      const srv = server()
      await srv.serve(release)
      const e = env(srv)
      expect(await checkForUpdate(e)).toMatchObject({ kind: 'installed', check: { passed: true } })
      expect(e.record()).toMatchObject({ mode, keys: [] })
    }
  })

  it('records nothing for a server without a list', async () => {
    const srv = server()
    srv.list = null
    const e = env(srv)
    expect(await checkForUpdate(e)).toEqual({ kind: 'unchanged' })
    expect(e.record()).toBeNull()
  })
})

describe('updates while reporting (refusal off)', () => {
  async function installed() {
    const srv = server()
    await srv.serve(v1)
    const e = env(srv)
    await checkForUpdate(e)
    srv.requests = []
    return { srv, e }
  }

  it('a report-only check writes nothing when another worker turned refusal on or changed the mode meanwhile', async () => {
    for (const change of [{ refuse: true }, { mode: 'self-built' }] as Partial<TrustRecord>[]) {
      const { srv, e } = await installed()
      const held = e.record()
      expect(held.refuse).toBe(false)
      await e.save({ ...held, ...change })
      const other = e.record()
      e.load = async () => structuredClone(held)
      await srv.serve(v2)
      expect(await checkForUpdate(e)).toEqual({ kind: 'unchanged' })
      expect(e.record()).toEqual(other)
      expect((await e.caches.keys()).filter((n) => n.includes('1.4.0'))).toEqual([])
    }
  })

  it('installs a valid update, keeps the previous set and reuses unchanged files', async () => {
    const { srv, e } = await installed()
    await srv.serve(v2)
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'installed', first: false, version: '1.4.0', check: { passed: true } })
    const r = e.record()
    expect(r.current?.version).toBe('1.4.0')
    expect(r.previous?.version).toBe('1.3.0')
    expect(await text(await cachedFile(e, r, 'index.html'))).toBe('<div id=root>2</div>')
    expect(await text(await cachedFile(e, r, 'assets/index-1.js'))).toBe('one')
    expect(srv.requests).not.toContain('/assets/MapView-1.js')
    expect(await checkForUpdate(e)).toEqual({ kind: 'unchanged' })
  })

  it('installs a tampered chunk anyway and records the cause and the path', async () => {
    const { srv, e } = await installed()
    await srv.serve({ ...v2, served: { 'assets/index-2.js': 'two;evil()' } })
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'installed', check: { passed: false, cause: 'changed-file', path: 'assets/index-2.js', refused: false } })
    const r = e.record()
    expect(r.current?.version).toBe('1.4.0')
    expect(await text(await cachedFile(e, r, 'assets/index-2.js'))).toBe('two;evil()')
    // A failed check never moves the trust forward.
    expect(r.verified?.version).toBe('1.3.0')
  })

  it('records a missing file', async () => {
    const { srv, e } = await installed()
    await srv.serve({ ...v2, served: { 'assets/index-2.js': null } })
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'installed', check: { cause: 'missing-file', path: 'assets/index-2.js' } })
  })

  it('records an unsigned list without leaving signed mode', async () => {
    const { srv, e } = await installed()
    await srv.serve({ ...v2, signers: [] })
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'installed', check: { passed: false, cause: 'unsigned' } })
    expect(e.record()).toMatchObject({ mode: 'signed', keys: [keys.release.spki, keys.recovery.spki] })
    // The next signed list passes again.
    await srv.serve({ ...v2, version: '1.4.1' })
    expect(await checkForUpdate(e)).toMatchObject({ check: { passed: true } })
  })

  it('records a list signed by an unknown key, and a bad signature', async () => {
    const { srv, e } = await installed()
    await srv.serve({ ...v2, signers: ['unknown'] })
    expect(await checkForUpdate(e)).toMatchObject({ check: { cause: 'unknown-key' } })
    srv.list = srv.list!.replace(/"sig":"(.)/, (_m, c) => `"sig":"${c === 'A' ? 'B' : 'A'}`)
    await srv.serve({ ...v2, version: '1.5.0' })
    srv.list = srv.list!.replace(/"sig":"(.)/, (_m, c) => `"sig":"${c === 'A' ? 'B' : 'A'}`)
    expect(await checkForUpdate(e)).toMatchObject({ check: { cause: 'bad-signature' } })
  })

  it('records an older version, and the same version with other files', async () => {
    const { srv, e } = await installed()
    await srv.serve({ ...v1, version: '1.2.0' })
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'installed', check: { cause: 'older' } })
    const { srv: s2, e: e2 } = await installed()
    await s2.serve({ ...v1, files: { ...v1.files, 'assets/index-1.js': 'one, rebuilt' } })
    expect(await checkForUpdate(e2)).toMatchObject({ check: { cause: 'older' } })
  })

  it('moves a self-built install to signed, never back', async () => {
    const srv = server()
    await srv.serve({ ...v1, signers: [] })
    const e = env(srv)
    await checkForUpdate(e)
    expect(e.record().mode).toBe('self-built')
    await srv.serve(v2)
    expect(await checkForUpdate(e)).toMatchObject({ check: { passed: true } })
    expect(e.record().mode).toBe('signed')
    await srv.serve({ ...v2, version: '1.5.0', signers: [] })
    await checkForUpdate(e)
    expect(e.record().mode).toBe('signed')
  })

  it('follows a rotation: a release signed by both keys that names only the new one', async () => {
    const { srv, e } = await installed()
    await srv.serve({ ...v2, signers: ['unknown', 'release'], names: ['unknown', 'recovery'] })
    expect(await checkForUpdate(e)).toMatchObject({ check: { passed: true } })
    await srv.serve({ ...v2, version: '1.5.0', signers: ['release'] })
    expect(await checkForUpdate(e)).toMatchObject({ check: { cause: 'unknown-key' } })
    await srv.serve({ ...v2, version: '1.6.0', signers: ['recovery'], names: ['unknown', 'recovery'] })
    expect(await checkForUpdate(e)).toMatchObject({ check: { passed: true } })
  })

  it('keeps the current set when the download is cut off, and retries later', async () => {
    const { srv, e } = await installed()
    await srv.serve(v2)
    srv.dropAfter = 2
    await expect(checkForUpdate(e)).rejects.toThrow()
    expect(e.record().current?.version).toBe('1.3.0')
    expect((await e.caches.keys()).filter((n) => n.includes('1.4.0'))).toEqual([])
    srv.dropAfter = -1
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'installed', version: '1.4.0' })
  })

  it('makes no check and records nothing offline', async () => {
    const { srv, e } = await installed()
    const before = e.record()
    srv.offline = true
    await expect(checkForUpdate(e)).rejects.toThrow()
    expect(e.record()).toEqual(before)
    expect(await text(await cachedFile(e, e.record(), 'index.html'))).toBe('<div id=root>1</div>')
  })
})

describe('refusal (design D17)', () => {
  async function refusing() {
    const srv = server()
    await srv.serve({ ...v1, refuse: true })
    const e = env(srv)
    await checkForUpdate(e)
    expect(e.record().refuse).toBe(true)
    return { srv, e }
  }

  it('is turned on only by a verified list', async () => {
    const srv = server()
    await srv.serve({ ...v1, refuse: true, signers: [] })
    const e = env(srv)
    await checkForUpdate(e)
    expect(e.record().refuse).toBe(false)
  })

  it('refuses a tampered chunk: nothing installed, staging deleted, announced once', async () => {
    const { srv, e } = await refusing()
    await srv.serve({ ...v2, served: { 'assets/index-2.js': 'two;evil()' } })
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'refused', announce: true, check: { cause: 'changed-file', path: 'assets/index-2.js', refused: true } })
    expect(e.record().current?.version).toBe('1.3.0')
    expect((await e.caches.keys()).filter((n) => n.includes('1.4.0'))).toEqual([])
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'refused', announce: false })
  })

  it('refuses unsigned, unknown-key and older lists before downloading anything', async () => {
    const { srv, e } = await refusing()
    for (const [release, cause] of [[{ ...v2, signers: [] }, 'unsigned'], [{ ...v2, signers: ['unknown'] }, 'unknown-key'], [{ ...v1, version: '1.2.0' }, 'older']] as const) {
      await srv.serve(release as Release)
      srv.requests = []
      expect(await checkForUpdate(e)).toMatchObject({ kind: 'refused', check: { cause } })
      expect(srv.requests).toEqual(['/app-manifest.json'])
    }
    expect(e.record().current?.version).toBe('1.3.0')
  })

  it('stays on when a later list says refuse: false', async () => {
    const { srv, e } = await refusing()
    await srv.serve({ ...v2, refuse: false })
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'installed' })
    expect(e.record().refuse).toBe(true)
    // A proxy rewrites the new page (unchanged files are reused, not downloaded).
    await srv.serve({ ...v2, version: '1.5.0', refuse: false, files: { ...v2.files, 'index.html': '<div id=root>5</div>' }, served: { 'index.html': '<div id=root>5</div><script src=//cdn.example/rocket.js></script>' } })
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'refused', check: { cause: 'changed-file', path: 'index.html' } })
  })

  it('refuses a missing list', async () => {
    const { srv, e } = await refusing()
    srv.list = null
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'refused', check: { cause: 'no-list' } })
  })

  // Two workers at once (an open tab's worker beside the one installing): each write goes
  // onto the record as stored, and only while it is the one the check started from.
  it('records a refusal on the record as stored, keeping what another worker wrote meanwhile', async () => {
    const { srv, e } = await refusing()
    const held = e.record()
    await e.save({ ...held, announced: [...held.announced, 'meanwhile'] })
    e.load = async () => structuredClone(held)
    await srv.serve({ ...v2, signers: [] })
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'refused', announce: true, check: { cause: 'unsigned' } })
    expect(e.record().announced).toContain('meanwhile')
    expect(e.record().lastCheck).toMatchObject({ cause: 'unsigned', refused: true })
  })

  it('an install another worker overtook writes nothing and drops its staged set', async () => {
    const { srv, e } = await refusing()
    const held = e.record()
    await srv.serve(v2)
    await checkForUpdate(e)
    const other = e.record()
    expect(other.current?.version).toBe('1.4.0')
    e.load = async () => structuredClone(held)
    await srv.serve({ ...v2, version: '1.5.0', files: { ...v2.files, 'index.html': '<div id=root>5</div>' } })
    expect(await checkForUpdate(e)).toEqual({ kind: 'unchanged' })
    expect(e.record()).toEqual(other)
    expect((await e.caches.keys()).filter((n) => n.includes('1.5.0'))).toEqual([])
  })

  it('an install of the same list again since the check started counts as overtaken (v1, v2, v1)', async () => {
    const { srv, e } = await refusing()
    const held = e.record()
    await srv.serve(v2)
    await checkForUpdate(e)
    await srv.serve({ ...v1, version: '1.3.0' })
    await e.save({ ...e.record(), current: { ...held.current!, cache: stagingName('1.3.0', held.current!.payloadHash, 1_700_000_000_000) }, previous: e.record().current })
    const again = e.record()
    expect(again.current?.payloadHash).toBe(held.current?.payloadHash)
    expect(again.current?.cache).not.toBe(held.current?.cache)
    e.load = async () => structuredClone(held)
    await srv.serve({ ...v2, version: '1.5.0', files: { ...v2.files, 'index.html': '<div id=root>5</div>' } })
    expect(await checkForUpdate(e)).toEqual({ kind: 'unchanged' })
    expect(e.record()).toEqual(again)
  })

  it('a check another worker\'s install overtook records nothing and announces nothing', async () => {
    const { srv, e } = await refusing()
    const held = e.record()
    await srv.serve(v2)
    await checkForUpdate(e)
    const other = e.record()
    e.load = async () => structuredClone(held)
    srv.list = null
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'refused', announce: false, check: { cause: 'no-list' } })
    expect(e.record()).toEqual(other)
  })
})

describe('lazy files (design D7)', () => {
  async function installed(refuse = false) {
    const srv = server()
    await srv.serve({ ...v1, refuse })
    const e = env(srv)
    await checkForUpdate(e)
    return { srv, e }
  }

  it('stores an intact lazy chunk on first use', async () => {
    const { e } = await installed()
    const got = await fetchLazy(e, e.record(), 'assets/MapView-1.js')
    expect(await text(got!.response)).toBe('map1')
    expect(got!.check).toBeUndefined()
    expect(await text(await cachedFile(e, e.record(), 'assets/MapView-1.js'))).toBe('map1')
  })

  it('records a tampered lazy chunk and serves it while reporting, without storing it', async () => {
    const { srv, e } = await installed()
    srv.release!.served = { 'assets/MapView-1.js': 'map1;evil()' }
    const got = await fetchLazy(e, e.record(), 'assets/MapView-1.js')
    expect(got!.check).toMatchObject({ cause: 'changed-file', path: 'assets/MapView-1.js', refused: false })
    expect(await text(got!.response)).toBe('map1;evil()')
    expect(await cachedFile(e, e.record(), 'assets/MapView-1.js')).toBeNull()
    expect(e.record().lastCheck?.cause).toBe('changed-file')
  })

  it('fails a tampered lazy chunk with refusal on', async () => {
    const { srv, e } = await installed(true)
    srv.release!.served = { 'assets/MapView-1.js': 'map1;evil()' }
    const got = await fetchLazy(e, e.record(), 'assets/MapView-1.js')
    expect(got!.response.status).toBe(404)
    expect(got!.check?.refused).toBe(true)
  })

  it('answers nothing for a path that is not listed', async () => {
    const { e } = await installed()
    expect(await fetchLazy(e, e.record(), 'evil.js')).toBeNull()
  })

  it('while reporting: a failed download answers 404, and a later changed file is served only with its check recorded', async () => {
    const { srv, e } = await installed()
    srv.release!.served = { 'assets/MapView-1.js': null }
    expect((await fetchLazy(e, e.record(), 'assets/MapView-1.js'))?.response.status).toBe(404)
    srv.release!.served = { 'assets/MapView-1.js': 'tampered' }
    const changed = await fetchLazy(e, e.record(), 'assets/MapView-1.js')
    expect(changed?.check).toMatchObject({ passed: false, cause: 'changed-file', path: 'assets/MapView-1.js', refused: false })
    // Report-only serves what it got, and the check is saved with the record.
    expect(await text(changed!.response)).toBe('tampered')
    expect(e.record().lastCheck).toMatchObject({ passed: false, cause: 'changed-file', path: 'assets/MapView-1.js', refused: false })
    expect(await cachedFile(e, e.record(), 'assets/MapView-1.js')).toBeNull()
  })

  it('persist false never writes the record in use back (a stand-in for one that could not be read)', async () => {
    const { srv, e } = await installed(true)
    const saves: unknown[] = []
    const update = e.update
    e.update = async (change) => { const r = await update(change); if (r) saves.push(r); return r }
    srv.release!.served = { 'assets/MapView-1.js': 'tampered' }
    const changed = await fetchLazy(e, e.record(), 'assets/MapView-1.js', false)
    expect(changed?.response.status).toBe(404)
    expect(changed?.check).toMatchObject({ cause: 'changed-file' })
    expect(saves).toEqual([])
    await fetchLazy(e, e.record(), 'assets/MapView-1.js', true)
    expect(saves).toHaveLength(1)
  })

  it('records the check on the record as stored, keeping what another worker wrote meanwhile', async () => {
    const { srv, e } = await installed()
    const held = e.record()
    await e.save({ ...held, announced: ['written meanwhile'] })
    srv.release!.served = { 'assets/MapView-1.js': 'tampered' }
    await fetchLazy(e, held, 'assets/MapView-1.js')
    expect(e.record().announced).toEqual(['written meanwhile'])
    expect(e.record().lastCheck).toMatchObject({ cause: 'changed-file', path: 'assets/MapView-1.js' })
  })

  it('records nothing when the same list was installed again since (a new cache)', async () => {
    const { srv, e } = await installed()
    const held = e.record()
    await e.save({ ...held, current: { ...held.current!, cache: stagingName(held.current!.version, held.current!.payloadHash, 1_700_000_000_000) } })
    const again = e.record()
    expect(again.current?.cache).not.toBe(held.current?.cache)
    srv.release!.served = { 'assets/MapView-1.js': 'tampered' }
    const changed = await fetchLazy(e, held, 'assets/MapView-1.js')
    expect(changed?.check).toMatchObject({ cause: 'changed-file' })
    expect(e.record()).toEqual(again)
  })

  it('never writes an older set back over one another worker installed meanwhile', async () => {
    const { srv, e } = await installed()
    const held = e.record()
    await srv.serve(v2)
    await checkForUpdate(e)
    const installed2 = e.record()
    expect(installed2.current?.version).toBe('1.4.0')
    srv.release!.served = { 'assets/MapView-1.js': 'tampered' }
    const changed = await fetchLazy(e, held, 'assets/MapView-1.js')
    expect(changed?.check).toMatchObject({ cause: 'changed-file' })
    expect(e.record()).toEqual(installed2)
  })

  it('with refusal on, storage that fails never lets an unchecked file through', async () => {
    const { srv, e } = await installed(true)
    const open = e.caches.open.bind(e.caches)
    e.caches.open = async (name: string) => { const c = await open(name); return Object.assign(Object.create(Object.getPrototypeOf(c)), c, { put: async () => { throw new DOMException('full', 'QuotaExceededError') } }) }
    e.update = async () => { throw new DOMException('full', 'QuotaExceededError') }
    // An intact file is still served (it was checked), just not stored.
    expect(await text((await fetchLazy(e, e.record(), 'assets/MapView-1.js'))!.response)).toBe('map1')
    e.caches.open = open
    expect(await cachedFile(e, e.record(), 'assets/MapView-1.js')).toBeNull()
    e.caches.open = async (name: string) => { const c = await open(name); return Object.assign(Object.create(Object.getPrototypeOf(c)), c, { put: async () => { throw new DOMException('full', 'QuotaExceededError') } }) }
    // A changed one answers 404 although its check could not be recorded.
    srv.release!.served = { 'assets/MapView-1.js': 'tampered' }
    expect((await fetchLazy(e, e.record(), 'assets/MapView-1.js'))?.response.status).toBe(404)
  })

  it('answers 404 for a listed file that could not be downloaded, and never serves a later changed one', async () => {
    const { srv, e } = await installed(true)
    srv.release!.served = { 'assets/MapView-1.js': null }
    const failed = await fetchLazy(e, e.record(), 'assets/MapView-1.js')
    expect(failed?.response.status).toBe(404)
    expect(await cachedFile(e, e.record(), 'assets/MapView-1.js')).toBeNull()
    srv.release!.served = { 'assets/MapView-1.js': 'tampered' }
    const changed = await fetchLazy(e, e.record(), 'assets/MapView-1.js')
    expect(changed?.response.status).toBe(404)
    expect(await text(changed!.response)).toBe('')
    expect(await cachedFile(e, e.record(), 'assets/MapView-1.js')).toBeNull()
  })
})

describe('interface catalogues (precache-device-language D3)', () => {
  const langs1 = { 'assets/lang-de-1.js': 'de', 'assets/lang-fr-1.js': 'fr' }
  const c1: Release = { ...v1, files: { ...v1.files, 'assets/lang-de-1.js': 'de1', 'assets/lang-fr-1.js': 'fr1' }, langs: langs1 }
  const c2: Release = { ...v2, files: { ...v2.files, 'assets/lang-de-2.js': 'de2', 'assets/lang-fr-2.js': 'fr2' }, langs: { 'assets/lang-de-2.js': 'de', 'assets/lang-fr-2.js': 'fr' } }

  it('a first install stores no catalogue; the language is stored when first loaded', async () => {
    const srv = server()
    await srv.serve(c1)
    const e = env(srv)
    await checkForUpdate(e)
    expect(srv.requests.filter((p) => p.includes('/lang-'))).toEqual([])
    expect(await cachedFile(e, e.record(), 'assets/lang-de-1.js')).toBeNull()
    await fetchLazy(e, e.record(), 'assets/lang-de-1.js')
    expect(await text(await cachedFile(e, e.record(), 'assets/lang-de-1.js'))).toBe('de1')
  })

  it('an update installs the catalogues of the languages the device holds, and no other', async () => {
    const srv = server()
    await srv.serve(c1)
    const e = env(srv)
    await checkForUpdate(e)
    await fetchLazy(e, e.record(), 'assets/lang-de-1.js')
    srv.requests = []
    await srv.serve(c2)
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'installed', version: '1.4.0', check: { passed: true } })
    expect(srv.requests).toContain('/assets/lang-de-2.js')
    expect(srv.requests).not.toContain('/assets/lang-fr-2.js')
    srv.offline = true
    const r = e.record()
    expect(await text(await cachedFile(e, { ...r, previous: undefined }, 'assets/lang-de-2.js'))).toBe('de2')
    expect(await cachedFile(e, { ...r, previous: undefined }, 'assets/lang-fr-2.js')).toBeNull()
  })

  it('from a list that names no language, an update keeps the device language\'s catalogue', async () => {
    const srv = server()
    // The list before catalogues named their language: every catalogue installed.
    await srv.serve({ ...v1, files: { ...v1.files, 'assets/de-1.js': 'de1', 'assets/fr-1.js': 'fr1' } })
    const e = env(srv, new MemoryCaches(), ['release', 'recovery'], ['de-DE', 'en'])
    await checkForUpdate(e)
    srv.requests = []
    await srv.serve(c2)
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'installed', version: '1.4.0' })
    expect(srv.requests).toContain('/assets/lang-de-2.js')
    expect(srv.requests).not.toContain('/assets/lang-fr-2.js')
  })

  it('refuses an update whose held catalogue was changed, with refusal on', async () => {
    const srv = server()
    await srv.serve({ ...c1, refuse: true })
    const e = env(srv)
    await checkForUpdate(e)
    await fetchLazy(e, e.record(), 'assets/lang-de-1.js')
    await srv.serve({ ...c2, refuse: true, served: { 'assets/lang-de-2.js': 'tampered' } })
    expect(await checkForUpdate(e)).toMatchObject({ kind: 'refused', check: { cause: 'changed-file', path: 'assets/lang-de-2.js' } })
    expect(e.record().current?.version).toBe('1.3.0')
  })
})

describe('caches', () => {
  // Chromium can drop a stored body handed straight to respondWith() when the
  // worker collects garbage, and the page's import fails with ERR_ABORTED.
  it('answers a stored file read whole, never the cache\'s own response (issue 1363)', async () => {
    const srv = server()
    await srv.serve(v1)
    const e = env(srv)
    await checkForUpdate(e)
    const r = e.record()
    const stored = e.caches.stores.get(r.current!.cache)!
    const handed: Response[] = []
    const match = stored.match.bind(stored)
    stored.match = async (key: string) => { const res = await match(key); if (res) handed.push(res); return res }
    const got = await cachedFile(e, r, 'assets/index-1.js')
    expect(handed).toHaveLength(1)
    expect(got).not.toBe(handed[0])
    expect(handed[0].bodyUsed).toBe(true)
    expect(got!.headers.get('Content-Type')).toBe('text/javascript; charset=utf-8')
    expect(await text(got)).toBe('one')
  })

  it('takes the previous set, then nothing, when a stored body cannot be read', async () => {
    const srv = server()
    await srv.serve(v1)
    const e = env(srv)
    await checkForUpdate(e)
    await srv.serve(v2)
    await checkForUpdate(e)
    const r = e.record()
    const broken = () => new Response(new ReadableStream({ pull(c) { c.error(new TypeError('aborted')) } }))
    e.caches.stores.get(r.current!.cache)!.match = async () => broken()
    expect(await cachedFile(e, r, 'assets/index-2.js')).toBeNull()
    expect(await text(await cachedFile(e, r, 'index.html'))).toBe('<div id=root>1</div>')
    e.caches.stores.get(r.previous!.cache)!.match = async () => broken()
    expect(await cachedFile(e, r, 'index.html')).toBeNull()
  })

  it('deletes sets the record no longer names, and the Workbox precache on activation', async () => {
    const srv = server()
    await srv.serve(v1)
    const e = env(srv)
    await e.caches.open('workbox-precache-v2-https://x/')
    await e.caches.open('opentodo-policy')
    await checkForUpdate(e)
    await srv.serve(v2)
    await checkForUpdate(e)
    await srv.serve({ ...v2, version: '1.5.0' })
    await checkForUpdate(e)
    // A staging cache may still be filling in another worker for a while; an hour later it is gone.
    await pruneCaches(e, e.record(), true)
    expect((await e.caches.keys()).filter((n) => n.startsWith('opentodo-app-'))).toHaveLength(3)
    e.now = () => 1_700_000_000_000 + 3_600_000
    await pruneCaches(e, e.record(), true)
    const names = await e.caches.keys()
    expect(names.filter((n) => n.startsWith('opentodo-app-')).map((n) => n.split('-')[2])).toEqual(['1.4.0', '1.5.0'])
    expect(names).toContain('opentodo-policy')
    expect(names.some((n) => n.startsWith('workbox-'))).toBe(false)
  })
})

describe('the trust record', () => {
  it('survives signing out (clearLocalData clears only the app database)', async () => {
    const record: TrustRecord = { mode: 'signed', keys: ['k'], refuse: true, announced: [] }
    await updateTrust(() => record)
    await clearLocalData()
    expect(await loadTrust()).toEqual(record)
  })

  it('updateTrust changes the record as stored, or leaves it', async () => {
    await updateTrust(() => ({ mode: 'signed', keys: ['k'], refuse: false, announced: ['1.0.0'] }))
    const next = await updateTrust((stored) => (stored ? { ...stored, refuse: true } : null))
    expect(next).toMatchObject({ refuse: true, announced: ['1.0.0'] })
    expect(await loadTrust()).toMatchObject({ refuse: true, announced: ['1.0.0'] })
    expect(await updateTrust(() => null)).toBeNull()
    expect(await loadTrust()).toMatchObject({ refuse: true })
  })
})
