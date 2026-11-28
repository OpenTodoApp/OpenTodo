// The v2 envelope (OpenSpec change e2ee-rollback, design D1 and D7): the same
// bytes as the independent Go implementation (internal/e2ee/vectors_test.go),
// and every refusal case of the shared vectors refused for its reason.
import { describe, expect, it } from 'vitest'
import { DecryptError, decryptValue, encryptValue, encryptValueV2, isEnvelope, isV2, MAX_PLAINTEXT_BYTES, MAX_STAMP, stampOf, StampMismatchError } from './crypto'
import vectors from './e2ee.vectors.json'

const hex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)))
const gcmKey = (raw: Uint8Array) => crypto.subtle.importKey('raw', raw as Uint8Array<ArrayBuffer>, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])

describe('v2 known-answer vectors', () => {
  it('seal to the Go bytes and open with the matching timestamp', async () => {
    expect(vectors.contentV2.length).toBeGreaterThan(0)
    for (const v of vectors.contentV2) {
      const key = await gcmKey(hex(v.key))
      expect(await encryptValueV2(key, v.stamp, v.entity, v.entityId, v.field, v.plaintext, hex(v.nonce))).toBe(v.value)
      expect(await decryptValue(key, v.entity, v.entityId, v.field, v.value, v.stamp)).toBe(v.plaintext)
      expect(await decryptValue(key, v.entity, v.entityId, v.field, v.value)).toBe(v.plaintext)
      expect(stampOf(v.value)).toBe(v.stamp)
      expect(isEnvelope(v.value) && isV2(v.value)).toBe(true)
    }
  })

  it('refuse every refusal vector for its reason', async () => {
    expect(vectors.refusedV2.length).toBeGreaterThan(5)
    for (const v of vectors.refusedV2) {
      const key = await gcmKey(hex(v.key))
      const err = await decryptValue(key, v.entity, v.entityId, v.field, v.value, v.ts).then(() => null, (e: unknown) => e)
      expect(err, v.name).toBeInstanceOf(DecryptError)
      expect(err instanceof StampMismatchError, v.name).toBe(v.reason === 'mismatch')
      if (v.reason === 'malformed') expect(stampOf(v.value), v.name).toBeNull()
    }
  })

  it('a replayed value names both timestamps', async () => {
    const v = vectors.refusedV2.find((r) => r.reason === 'mismatch')!
    const err = await decryptValue(await gcmKey(hex(v.key)), v.entity, v.entityId, v.field, v.value, v.ts).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StampMismatchError)
    expect((err as StampMismatchError).ts).toBe(v.ts)
    expect((err as StampMismatchError).stamp).not.toBe(v.ts)
  })
})

describe('v2 envelope', () => {
  it('refuses stamps outside 1 to 2^53 - 1 when sealing', async () => {
    const key = await gcmKey(new Uint8Array(32))
    for (const s of [0, -1, 1.5, MAX_STAMP + 1]) await expect(encryptValueV2(key, s, 'task', 't', 'title', 'x')).rejects.toThrow()
    expect(stampOf(await encryptValueV2(key, MAX_STAMP, 'task', 't', 'title', 'x'))).toBe(MAX_STAMP)
  })

  it('keeps the plaintext limit inside the 64 KiB value limit', async () => {
    const key = await gcmKey(new Uint8Array(32))
    const v = await encryptValueV2(key, Date.now(), 'task', 't', 'description', 'x'.repeat(MAX_PLAINTEXT_BYTES))
    expect(JSON.stringify(v).length).toBeLessThanOrEqual(64 * 1024)
  })

  it('reads no stamp from v1 values or plain text', async () => {
    const key = await gcmKey(new Uint8Array(32))
    expect(stampOf(await encryptValue(key, 'task', 't', 'title', 'x'))).toBeNull()
    expect(stampOf('enc:v2: a title someone typed')).toBeNull()
    expect(stampOf(null)).toBeNull()
  })
})
