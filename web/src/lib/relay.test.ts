// Device relay worker (OpenSpec change mcp-device-relay): stream crypto shared
// with the server, the device's own checks and caps, and write confirmation.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta, setMeta } from './db'
import { decryptValue, encryptValue, fromB64url, generateAccountKey } from './crypto'
import vectors from './relay.vectors.json'

const key = vi.hoisted(() => ({ current: null as CryptoKey | null }))
vi.mock('./e2ee', async (orig) => ({ ...(await orig<typeof import('./e2ee')>()), currentKey: async () => key.current }))

const { answer, HOUR_CAP, open, relaySnapshot, onRelayChange, seal, setConfirmWrites, spend, streamKey } = await import('./relay')

beforeEach(async () => {
  await db.delete()
  await db.open()
  key.current = await generateAccountKey()
})
afterEach(() => vi.useRealTimers())

describe('lifecycle', () => {
  it('locking an unlocked device opts it out with reason locked; other encryption events do not', async () => {
    const { api } = await import('./api')
    const { publishEncryption } = await import('./e2ee')
    const { startRelay } = await import('./relay')
    const out = vi.spyOn(api, 'relayOptOut').mockResolvedValue(undefined)
    await setMeta('relay.optedIn', true)
    publishEncryption({ enabled: true, unlocked: false })
    const stop = startRelay()
    await vi.waitFor(() => expect(relaySnapshot().optedIn).toBe(true))
    // A change while still locked (the state loading) is not a lock.
    publishEncryption({ keyVersion: 1 })
    expect(out).not.toHaveBeenCalled()
    publishEncryption({ unlocked: true })
    publishEncryption({ unlocked: false })
    await vi.waitFor(() => expect(out).toHaveBeenCalledWith(expect.any(String), 'locked'))
    await vi.waitFor(() => expect(relaySnapshot().optedIn).toBe(false))
    expect(await getMeta('relay.optedIn', true)).toBe(false)
    stop()
    out.mockRestore()
  })
})

describe('stream crypto', () => {
  it('opens the box the server sealed for the shared vector (same ECDH, HKDF and AES-GCM)', async () => {
    const priv = await crypto.subtle.importKey('jwk', { ...vectors.deviceJwk, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
    const k = await streamKey(priv, fromB64url(vectors.serverPub), vectors.stream)
    expect(await open(k, vectors.box, vectors.id)).toBe(vectors.plaintext)
    await expect(open(k, vectors.box, 'another-request')).rejects.toThrow()
    expect(await open(k, await seal(k, 'answer', vectors.id), vectors.id)).toBe('answer')
  })
})

describe('answering', () => {
  const req = (op: 'decrypt' | 'encrypt', items: { entity: string; id: string; field: string; value: string }[]) =>
    ({ op, items, call: { tool: 'get_task', write: op === 'encrypt' }, deadline: Date.now() + 10_000 })

  it('encrypts and decrypts content fields with the account key, bound to entity, id and field', async () => {
    const out = await answer(req('encrypt', [{ entity: 'task', id: 't1', field: 'title', value: 'Call the plumber' }]))
    if (!('results' in out)) throw new Error(JSON.stringify(out))
    const env = out.results[0].value!
    expect(env.startsWith('enc:v1:')).toBe(true)
    expect(await decryptValue(key.current!, 'task', 't1', 'title', env)).toBe('Call the plumber')
    const ct = await encryptValue(key.current!, 'task', 't2', 'title', 'Buy paint')
    const back = await answer(req('decrypt', [
      { entity: 'task', id: 't2', field: 'title', value: ct },
      { entity: 'task', id: 'other', field: 'title', value: ct },
    ]))
    expect(back).toEqual({ results: [{ value: 'Buy paint' }, { error: 'decrypt_failed' }] })
  })

  it('refuses fields that are not content and requests that are too big', async () => {
    const out = await answer(req('decrypt', [{ entity: 'task', id: 't1', field: 'due', value: 'x' }, { entity: 'user', id: 'u', field: 'email', value: 'x' }]))
    expect(out).toEqual({ results: [{ error: 'refused' }, { error: 'refused' }] })
    const many = Array.from({ length: 2001 }, (_, i) => ({ entity: 'task', id: `t${i}`, field: 'title', value: 'x' }))
    expect(await answer(req('encrypt', many))).toEqual({ error: 'refused' })
  })

  it('answers locked without the key', async () => {
    key.current = null
    expect(await answer(req('decrypt', [{ entity: 'task', id: 't1', field: 'title', value: 'enc:v1:x' }]))).toEqual({ error: 'locked' })
  })

  it('keeps its own caps across reloads and answers device_limit beyond them', async () => {
    const now = Date.UTC(2026, 9, 21, 10)
    expect(await spend(HOUR_CAP - 1, now)).toBe(true)
    // The counter is stored on the device, not in memory.
    expect((await getMeta<{ hour: number }>('relay.usage', { hour: 0 })).hour).toBe(HOUR_CAP - 1)
    expect(await spend(2, now + 1000)).toBe(false)
    expect(await spend(1, now + 1000)).toBe(true)
    expect(await spend(1, now + 3_600_001)).toBe(true)
    await setMeta('relay.usage', { hourStart: Date.now(), hour: HOUR_CAP, dayStart: Date.now(), day: HOUR_CAP })
    expect(await answer(req('decrypt', [{ entity: 'task', id: 't1', field: 'title', value: 'x' }]))).toEqual({ error: 'device_limit' })
    expect(relaySnapshot().recent[0]).toMatchObject({ tool: 'get_task', outcome: 'device_limit', count: 1 })
    expect(JSON.stringify(relaySnapshot().recent)).not.toContain('x"')
  })

  it('asks before a write when confirmation is on; Decline answers declined_on_device', async () => {
    await setConfirmWrites(true)
    const asked = new Promise<void>((resolve) => {
      const off = onRelayChange(() => {
        const p = relaySnapshot().pending
        if (p) {
          off()
          expect(p.items[0].value).toBe('Call the plumber')
          p.decide(false)
          resolve()
        }
      })
    })
    const out = await answer(req('encrypt', [{ entity: 'task', id: 't1', field: 'title', value: 'Call the plumber' }]))
    await asked
    expect(out).toEqual({ error: 'declined_on_device' })
    // Reads never ask.
    const ct = await encryptValue(key.current!, 'task', 't1', 'title', 'x')
    expect(await answer(req('decrypt', [{ entity: 'task', id: 't1', field: 'title', value: ct }]))).toEqual({ results: [{ value: 'x' }] })
  })
})
