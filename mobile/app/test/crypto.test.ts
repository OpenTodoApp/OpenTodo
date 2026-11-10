// The encryption format's known-answer vectors shared with internal/e2ee
// (docs/contracts.md), run against web/src/lib/crypto.ts and the envelope on top of
// it. Jest has Node's Web Crypto; the native provider (react-native-quick-crypto) is
// checked against the same vectors on the simulator (design D3).
import { decryptValue, derivePassphraseKey, deriveRecoveryKey, encryptValue, formatRecoveryKey, isEnvelope, parseRecoveryKey, unwrapAccountKey, wrapAccountKey } from '@shared/crypto'
import { openValue, sealValue } from '@shared/e2eeEnvelope'
import vectors from '../../../web/src/lib/e2ee.vectors.json'

const hex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)))
const toHex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const gcmKey = (raw: Uint8Array, extractable = false) => crypto.subtle.importKey('raw', raw as Uint8Array<ArrayBuffer>, { name: 'AES-GCM' }, extractable, ['encrypt', 'decrypt'])

describe('e2ee.vectors.json', () => {
  it('content values seal and open like the Go implementation', async () => {
    for (const v of vectors.content) {
      const key = await gcmKey(hex(v.key))
      expect(await encryptValue(key, v.entity, v.entityId, v.field, v.plaintext, hex(v.nonce))).toBe(v.value)
      expect(await decryptValue(key, v.entity, v.entityId, v.field, v.value)).toBe(v.plaintext)
      expect(isEnvelope(v.value)).toBe(true)
    }
  })

  it('the envelope seals a content field and opens it back', async () => {
    const key = await gcmKey(hex(vectors.content[0].key))
    const sealed = await sealValue(key, 'task', 't1', 'title', 'Renew passport')
    expect(isEnvelope(sealed)).toBe(true)
    expect(await openValue(key, 'task', 't1', 'title', sealed)).toBe('Renew passport')
    expect(await sealValue(key, 'task', 't1', 'priority', 2)).toBe(2)
  })

  it('the passphrase wrap matches', async () => {
    const p = vectors.passphrase
    const kek = await derivePassphraseKey(p.passphrase, hex(p.salt), p.iterations)
    expect(await wrapAccountKey(await gcmKey(hex(p.accountKey), true), kek)).toBe(p.wrapped)
    const dek = await unwrapAccountKey(p.wrapped, kek, true)
    expect(toHex(await crypto.subtle.exportKey('raw', dek))).toBe(p.accountKey)
  })

  it('the recovery key and its wrap match', async () => {
    const r = vectors.recovery
    expect(await formatRecoveryKey(hex(r.raw))).toBe(r.text)
    expect(toHex(await parseRecoveryKey(r.text))).toBe(r.raw)
    const kek = await deriveRecoveryKey(hex(r.raw))
    expect(await wrapAccountKey(await gcmKey(hex(r.accountKey), true), kek)).toBe(r.wrapped)
  })
})
