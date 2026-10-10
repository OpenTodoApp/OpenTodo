import { describe, expect, it } from 'vitest'
import { detachedId, nameId, occurrenceId, sha256 } from './ids'

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

describe('sha256', () => {
  it('matches the standard test vectors', () => {
    const enc = new TextEncoder()
    expect(hex(sha256(enc.encode('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(hex(sha256(enc.encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hex(sha256(enc.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
    // Exactly one block of padding boundary (55 and 56 bytes) and a multi-block input.
    expect(hex(sha256(enc.encode('a'.repeat(55))))).toBe('9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318')
    expect(hex(sha256(enc.encode('a'.repeat(56))))).toBe('b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a')
    expect(hex(sha256(enc.encode('a'.repeat(1000))))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3')
  })
})

describe('nameId', () => {
  it('produces the same UUIDs as Go ids.NameID (internal/ids/ids_test.go)', () => {
    expect(nameId('occurrence', 'series-1:2026-10-12')).toBe('7106e6f1-b1b0-89c3-a9dc-81493398a2bd')
    expect(nameId('occurrence', 'series-1:detach:2026-10-12')).toBe('8f193c71-c00d-879f-a1fa-51a7b4ff2974')
    expect(nameId('occurrence', 'ünïcödé ✓:2026-10-12')).toBe('17d11a8d-aec2-8ffd-b6fd-9c4027f03e68')
    expect(nameId('', '')).toBe('e7ac0786-668e-8ff0-b02b-62bd04f45ff6')
  })

  it('derives distinct completion and detach ids per series and date', () => {
    expect(occurrenceId('series-1', '2026-10-12')).toBe('7106e6f1-b1b0-89c3-a9dc-81493398a2bd')
    expect(detachedId('series-1', '2026-10-12')).toBe('8f193c71-c00d-879f-a1fa-51a7b4ff2974')
    expect(occurrenceId('series-1', '2026-10-13')).not.toBe(occurrenceId('series-1', '2026-10-12'))
    expect(occurrenceId('series-2', '2026-10-12')).not.toBe(occurrenceId('series-1', '2026-10-12'))
    expect(occurrenceId('s', '2026-10-12')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
