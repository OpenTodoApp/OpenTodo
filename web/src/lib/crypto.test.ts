// Known-answer and property tests for the end-to-end encryption primitives
// (OpenSpec e2ee, task 1.1). The vectors come from an independent Go
// implementation (internal/e2ee/vectors_test.go), so passing here means the
// browser code and the documented format agree byte for byte.
import { describe, expect, it } from 'vitest'
import {
  b64url, createKeyRecord, decryptValue, DecryptError, derivePassphraseKey, deriveRecoveryKey, encryptValue, formatRecoveryKey, fromB64url,
  isCiphertext, isEnvelope, parseRecoveryKey, RecoveryKeyFormatError, resetWithRecoveryKey, rewrapWithPassphrase, unlockWithPassphrase,
  unlockWithRecoveryKey, unwrapAccountKey, wrapAccountKey, WrongSecretError, MAX_PLAINTEXT_BYTES, PREFIX_V1,
} from './crypto'
import vectors from './e2ee.vectors.json'

const hex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)))
const toHex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const gcmKey = (raw: Uint8Array, extractable = false) => crypto.subtle.importKey('raw', raw as Uint8Array<ArrayBuffer>, { name: 'AES-GCM' }, extractable, ['encrypt', 'decrypt'])
const FAST = { iterations: 1000 }

describe('known-answer vectors', () => {
  it('AES-256-GCM content values match the Go implementation and open again', async () => {
    for (const v of vectors.content) {
      const key = await gcmKey(hex(v.key))
      expect(await encryptValue(key, v.entity, v.entityId, v.field, v.plaintext, hex(v.nonce))).toBe(v.value)
      expect(await decryptValue(key, v.entity, v.entityId, v.field, v.value)).toBe(v.plaintext)
    }
  })

  it('AES-KW matches RFC 3394 section 4.6', async () => {
    const kek = await crypto.subtle.importKey('raw', hex('000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F'), 'AES-KW', false, ['wrapKey'])
    const key = await gcmKey(hex('00112233445566778899AABBCCDDEEFF000102030405060708090A0B0C0D0E0F'), true)
    expect(toHex(await crypto.subtle.wrapKey('raw', key, kek, 'AES-KW')).toUpperCase())
      .toBe('28C9F404C4B810F4CBCCB35CFB87F8263F5786E2D80ED326CBC7F0E71A99F43BFB988B9B7A02DD21')
  })

  it('PBKDF2-SHA-256 passphrase wrap matches the Go implementation', async () => {
    const p = vectors.passphrase
    const kek = await derivePassphraseKey(p.passphrase, hex(p.salt), p.iterations)
    expect(await wrapAccountKey(await gcmKey(hex(p.accountKey), true), kek)).toBe(p.wrapped)
    const dek = await unwrapAccountKey(p.wrapped, kek, true)
    expect(toHex(await crypto.subtle.exportKey('raw', dek))).toBe(p.accountKey)
  })

  it('recovery key text and HKDF wrap match the Go implementation', async () => {
    const r = vectors.recovery
    expect(await formatRecoveryKey(hex(r.raw))).toBe(r.text)
    expect(toHex(await parseRecoveryKey(r.text))).toBe(r.raw)
    // Typing leniency: case, spacing, and 0/1/8 for O/I/B.
    expect(toHex(await parseRecoveryKey(r.text.toLowerCase().replace(/-/g, ' ')))).toBe(r.raw)
    const kek = await deriveRecoveryKey(hex(r.raw))
    expect(await wrapAccountKey(await gcmKey(hex(r.accountKey), true), kek)).toBe(r.wrapped)
  })
})

describe('tamper detection and binding', () => {
  const v = vectors.content[0]

  it('rejects a modified ciphertext, nonce or tag', async () => {
    const key = await gcmKey(hex(v.key))
    const raw = fromB64url(v.value.slice(PREFIX_V1.length))
    for (const i of [0, 12, raw.length - 1]) {
      const bad = raw.slice()
      bad[i] ^= 1
      await expect(decryptValue(key, v.entity, v.entityId, v.field, PREFIX_V1 + b64url(bad))).rejects.toBeInstanceOf(DecryptError)
    }
    await expect(decryptValue(key, v.entity, v.entityId, v.field, PREFIX_V1 + b64url(raw.slice(0, 20)))).rejects.toBeInstanceOf(DecryptError)
    await expect(decryptValue(key, v.entity, v.entityId, v.field, 'enc:v1:!!')).rejects.toBeInstanceOf(DecryptError)
  })

  it('rejects a value moved to another field, entity id or entity kind (AAD)', async () => {
    const key = await gcmKey(hex(v.key))
    await expect(decryptValue(key, v.entity, v.entityId, 'description', v.value)).rejects.toBeInstanceOf(DecryptError)
    await expect(decryptValue(key, v.entity, 't2', v.field, v.value)).rejects.toBeInstanceOf(DecryptError)
    await expect(decryptValue(key, 'project', v.entityId, v.field, v.value)).rejects.toBeInstanceOf(DecryptError)
  })

  it('rejects the wrong key', async () => {
    const other = await gcmKey(new Uint8Array(32).fill(9))
    await expect(decryptValue(other, v.entity, v.entityId, v.field, v.value)).rejects.toBeInstanceOf(DecryptError)
  })

  it('uses a fresh nonce per encryption', async () => {
    const key = await gcmKey(hex(v.key))
    const a = await encryptValue(key, 'task', 't1', 'title', 'same')
    const b = await encryptValue(key, 'task', 't1', 'title', 'same')
    expect(a).not.toBe(b)
    expect(isEnvelope(a) && isCiphertext(a)).toBe(true)
    expect(isEnvelope('enc: my plain title')).toBe(false)
  })

  it('keeps the largest allowed plaintext under the server value limit', async () => {
    const key = await gcmKey(hex(v.key))
    const value = await encryptValue(key, 'task', 't1', 'description', 'x'.repeat(MAX_PLAINTEXT_BYTES))
    expect(JSON.stringify(value).length).toBeLessThanOrEqual(64 * 1024)
  })
})

describe('key record lifecycle', () => {
  it('unlocks with the passphrase or the recovery key; the device key is non-extractable', async () => {
    const { record, key, recoveryKey } = await createKeyRecord('correct horse battery', FAST)
    expect(key.extractable).toBe(false)
    expect(record).toMatchObject({ version: 1, kdf: 1, iterations: 1000 })
    expect(fromB64url(record.salt)).toHaveLength(16)
    expect(fromB64url(record.wrappedByPassphrase)).toHaveLength(40)
    expect(recoveryKey).toMatch(/^([A-Z2-7]{4}-){13}[A-Z2-7]{4}$/)
    const value = await encryptValue(key, 'task', 't1', 'title', 'Dentist')
    for (const k of [await unlockWithPassphrase(record, 'correct horse battery'), await unlockWithRecoveryKey(record, recoveryKey)]) {
      expect(k.extractable).toBe(false)
      expect(await decryptValue(k, 'task', 't1', 'title', value)).toBe('Dentist')
    }
  })

  it('refuses a wrong passphrase, a wrong recovery key and a mistyped one', async () => {
    const { record, recoveryKey } = await createKeyRecord('correct horse battery', FAST)
    await expect(unlockWithPassphrase(record, 'correct horse battery!')).rejects.toBeInstanceOf(WrongSecretError)
    const other = await formatRecoveryKey(new Uint8Array(32).fill(7))
    await expect(unlockWithRecoveryKey(record, other)).rejects.toBeInstanceOf(WrongSecretError)
    const typo = recoveryKey.slice(0, 5) + (recoveryKey[5] === 'A' ? 'B' : 'A') + recoveryKey.slice(6)
    await expect(unlockWithRecoveryKey(record, typo)).rejects.toBeInstanceOf(RecoveryKeyFormatError)
    await expect(parseRecoveryKey('ABCD-EFGH')).rejects.toBeInstanceOf(RecoveryKeyFormatError)
    await expect(createKeyRecord('too short', FAST)).rejects.toThrow(/12 characters/)
  })

  it('passphrase change re-wraps the same key and keeps the recovery wrap', async () => {
    const { record, key } = await createKeyRecord('correct horse battery', FAST)
    const value = await encryptValue(key, 'project', 'p1', 'name', 'Home')
    const next = await rewrapWithPassphrase(record, 'correct horse battery', 'a brand new passphrase', FAST)
    expect(next.version).toBe(2)
    expect(next.wrappedByRecovery).toBe(record.wrappedByRecovery)
    expect(next.salt).not.toBe(record.salt)
    await expect(unlockWithPassphrase(next, 'correct horse battery')).rejects.toBeInstanceOf(WrongSecretError)
    expect(await decryptValue(await unlockWithPassphrase(next, 'a brand new passphrase'), 'project', 'p1', 'name', value)).toBe('Home')
    await expect(rewrapWithPassphrase(record, 'wrong passphrase!!', 'x'.repeat(12), FAST)).rejects.toBeInstanceOf(WrongSecretError)
  })

  it('recovery reset issues a new recovery key; the old one stops working', async () => {
    const { record, key, recoveryKey } = await createKeyRecord('correct horse battery', FAST)
    const value = await encryptValue(key, 'task', 't1', 'title', 'Dentist')
    const reset = await resetWithRecoveryKey(record, recoveryKey, 'forgot it, new one', FAST)
    expect(reset.recoveryKey).not.toBe(recoveryKey)
    await expect(unlockWithRecoveryKey(reset.record, recoveryKey)).rejects.toBeInstanceOf(WrongSecretError)
    expect(await decryptValue(await unlockWithRecoveryKey(reset.record, reset.recoveryKey), 'task', 't1', 'title', value)).toBe('Dentist')
    expect(await decryptValue(reset.key, 'task', 't1', 'title', value)).toBe('Dentist')
  })
})
