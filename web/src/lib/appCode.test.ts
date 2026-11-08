import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareVersions, DOMAIN, fingerprint, parseList, shortFingerprint, verifyList, type Envelope } from './appCode'

// The shared vectors of the signed web app (docs/contracts.md), written by
// internal/websign/vectors_test.go: the worker must accept and refuse exactly
// what the Go side does.
interface Vectors {
  domain: string
  keys: Record<string, { spki: string; fingerprint: string; short: string }>
  envelopes: { name: string; envelope: Envelope; trusted: string[]; signer: string; error: string }[]
  versions: { a: string; b: string; cmp: number }[]
}
const vectors = JSON.parse(readFileSync(path.resolve(process.cwd(), '../internal/websign/testdata/manifest.vectors.json'), 'utf8')) as Vectors

describe('signed list vectors', () => {
  it('uses the same domain string', () => {
    expect(DOMAIN).toBe(vectors.domain)
  })

  it('computes the same fingerprints', async () => {
    for (const k of Object.values(vectors.keys)) {
      expect(await fingerprint(k.spki)).toBe(k.fingerprint)
      expect(shortFingerprint(k.fingerprint)).toBe(k.short)
    }
  })

  it.each(vectors.envelopes.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
    const list = parseList(JSON.stringify(c.envelope))
    if (c.error === 'invalid') {
      expect(list).toBeNull()
      return
    }
    expect(list).not.toBeNull()
    const result = await verifyList(list!, c.trusted.map((n) => vectors.keys[n].spki))
    if (c.error) expect(result).toEqual({ error: c.error })
    else expect(result).toEqual({ signer: vectors.keys[c.signer].fingerprint })
  })

  it('orders versions as Go does', () => {
    expect(vectors.versions.length).toBeGreaterThan(10)
    for (const v of vectors.versions) {
      expect(compareVersions(v.a, v.b), `${v.a} vs ${v.b}`).toBe(v.cmp)
      expect(compareVersions(v.b, v.a), `${v.b} vs ${v.a}`).toBe(-v.cmp || 0)
    }
  })
})

describe('parseList', () => {
  it('refuses what is not a list', () => {
    expect(parseList('not json')).toBeNull()
    expect(parseList('{"format":1,"payload":"!!","signatures":[]}')).toBeNull()
    expect(parseList('<!doctype html>')).toBeNull()
  })
})
