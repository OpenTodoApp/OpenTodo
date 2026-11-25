// The changed-worker warning (OpenSpec change signed-web-app, design D8, task 7.4):
// once refusal is on, the server's sw.js must be one a verified list names, the
// installed list or a newer one signed by a key the device trusts. Lists are
// signed with the test key of internal/websign/testdata.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { fingerprint } from './appCode'
import type { TrustRecord } from './appTrust'
import { workerChanged, type WorkerCheckEnv } from './workerChange'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const pem = readFileSync(path.resolve(process.cwd(), '../internal/websign/testdata/test-key.pem'), 'utf8')
const trusted = createPublicKey(createPrivateKey(pem)).export({ type: 'spki', format: 'der' }).toString('base64')
let release: CryptoKey
let stranger: CryptoKey
let strangerSpki: string

beforeAll(async () => {
  const pkcs8 = (k: ReturnType<typeof createPrivateKey>) => k.export({ type: 'pkcs8', format: 'der' }) as BufferSource
  release = await crypto.subtle.importKey('pkcs8', pkcs8(createPrivateKey(pem)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const other = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  strangerSpki = other.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  stranger = await crypto.subtle.importKey('pkcs8', pkcs8(other.privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
})

/** A list for `version` naming `worker`, signed by the release key or another one. */
async function list(version: string, worker: string, by: 'release' | 'stranger' = 'release'): Promise<string> {
  const payload = Buffer.from(JSON.stringify({ app: 'opentodo-web', version, refuse: true, keys: [{ spki: trusted, role: 'release' }], worker: { path: 'sw.js', sha256: sha(worker) }, files: {} }))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, by === 'release' ? release : stranger, Buffer.concat([Buffer.from('opentodo-web-manifest/v1\n'), payload])))
  return JSON.stringify({ format: 1, payload: payload.toString('base64url'), signatures: [{ key: await fingerprint(by === 'release' ? trusted : strangerSpki), sig: Buffer.from(sig).toString('base64url') }] })
}

const record = (refuse: boolean, worker?: string): TrustRecord => ({
  mode: 'signed', keys: [trusted], refuse, announced: [], verified: { version: '1.3.0', payloadHash: 'h' },
  current: { version: '1.3.0', payloadHash: 'h', cache: 'c', at: 0, files: {}, ...(worker ? { worker: sha(worker) } : {}) },
})

type Served = string | number | Error
const env = (r: TrustRecord | null | Error, served: { worker: Served; list?: Served }): WorkerCheckEnv => ({
  load: async () => { if (r instanceof Error) throw r; return r },
  fetch: async (p) => {
    const s = p === 'sw.js' ? served.worker : (served.list ?? 404)
    if (s instanceof Error) throw s
    return typeof s === 'number' ? new Response('', { status: s }) : new Response(s)
  },
})

describe('workerChanged', () => {
  it('is false for the worker the installed list names', async () => {
    expect(await workerChanged(env(record(true, 'w1'), { worker: 'w1' }))).toBe(false)
  })

  it('is true for a worker no list names, while the server still serves the installed list', async () => {
    expect(await workerChanged(env(record(true, 'w1'), { worker: 'evil', list: await list('1.3.0', 'w1') }))).toBe(true)
  })

  it('is false for a newer release signed by a trusted key that names the worker (installed, or refused for another cause)', async () => {
    expect(await workerChanged(env(record(true, 'w1'), { worker: 'w2', list: await list('1.4.0', 'w2') }))).toBe(false)
  })

  it('is true when the list naming the worker is not signed by a trusted key, is not newer, or is missing', async () => {
    for (const served of [await list('1.4.0', 'w2', 'stranger'), await list('1.2.0', 'w2'), await list('1.3.0', 'w2'), 404, 'not a list']) {
      expect(await workerChanged(env(record(true, 'w1'), { worker: 'w2', list: served })), String(served).slice(0, 20)).toBe(true)
    }
  })

  it('is false while refusal is off: sw.js changes with every release while checks only report', async () => {
    expect(await workerChanged(env(record(false, 'w1'), { worker: 'evil' }))).toBe(false)
  })

  it('is false with nothing to compare: no record, a record from before the worker hash, an unreadable record', async () => {
    expect(await workerChanged(env(null, { worker: 'evil' }))).toBe(false)
    expect(await workerChanged(env(record(true), { worker: 'evil' }))).toBe(false)
    expect(await workerChanged(env(new Error('blocked'), { worker: 'evil' }))).toBe(false)
  })

  it('is false when the network fails or the server has no worker', async () => {
    expect(await workerChanged(env(record(true, 'w1'), { worker: new TypeError('offline') }))).toBe(false)
    expect(await workerChanged(env(record(true, 'w1'), { worker: 404 }))).toBe(false)
    expect(await workerChanged(env(record(true, 'w1'), { worker: 'w2', list: new TypeError('offline') }))).toBe(false)
  })
})
