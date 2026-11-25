// The vault store keeps an older ciphertext out (OpenSpec change
// e2ee-rollback, design D4), as internal/vault TestStoreRefusesOlderCiphertext.
import { describe, expect, it } from 'vitest'
import { encryptValue, encryptValueV2 } from '../../../web/src/lib/crypto'
import { openValue, sealText, WRITE_V2 } from '../../../web/src/lib/e2eeEnvelope'
import { apply, get, olderCiphertext, type Op, type Store } from './store'

const key = () => crypto.subtle.importKey('raw', new Uint8Array(32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
const op = (id: string, value: string, ts: number): Op => ({ id, entity: 'task', entityId: 't1', field: 'title', value, ts, device: 'A' })

describe('vault store and v2 ciphertext', () => {
  it('refuses a v2 value replayed under a newer timestamp', async () => {
    const k = await key()
    const s: Store = {}
    const old = await encryptValueV2(k, 100, 'task', 't1', 'title', 'Last month')
    expect(apply(s, op('a', old, 100))).toBe(true)
    expect(apply(s, op('b', old, 200))).toBe(false)
    expect(get(s, 'task', 't1')?.title.t).toBe(100)
    // v1 over v2: refused from the writer release (WRITE_V2) only.
    expect(olderCiphertext(op('c', await encryptValue(k, 'task', 't1', 'title', 'Older still'), 300), get(s, 'task', 't1')?.title)).toBe(WRITE_V2)
    const next = await encryptValueV2(k, 400, 'task', 't1', 'title', 'Now')
    expect(apply(s, op('d', next, 400))).toBe(true)
    expect(await openValue(k, 'task', 't1', 'title', get(s, 'task', 't1')!.title.v, 400)).toBe('Now')
  })

  it('applies a title typed as "enc:v2: …" as text', () => {
    const s: Store = {}
    expect(apply(s, op('a', 'enc:v2: release notes', 5))).toBe(true)
    expect(apply(s, op('b', 'enc:v2: release notes, take two', 6))).toBe(true)
  })

  it('applies v1 over v1 as before', async () => {
    const k = await key()
    const s: Store = {}
    expect(apply(s, op('a', await encryptValue(k, 'task', 't1', 'title', 'one'), 1))).toBe(true)
    expect(apply(s, op('b', await encryptValue(k, 'task', 't1', 'title', 'two'), 2))).toBe(true)
  })

  it('the reader release still seals v1', async () => {
    expect(WRITE_V2).toBe(false)
    expect(await sealText(await key(), 'task', 't1', 'title', 'x', 5)).toMatch(/^enc:v1:/)
  })
})
