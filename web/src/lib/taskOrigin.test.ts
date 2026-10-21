import { describe, expect, it } from 'vitest'
import vectors from '../../../internal/origin/testdata/origin_vectors.json'
import { cutOriginTitle, originFromUrl, originIcon, originLabel, originMatches, originOf } from './taskOrigin'
import type { Origin } from './types'

describe('originFromUrl (shared vectors with internal/origin)', () => {
  it('has the same cases as the Go test', () => {
    // internal/origin/vectors_test.go pins the same count.
    expect(vectors.cases).toHaveLength(21)
  })
  for (const c of vectors.cases) {
    it(c.name, () => {
      expect(originFromUrl(c.url, (c as { title?: string }).title)).toEqual(c.want)
    })
  }
})

describe('web mail origins (shared label vectors with internal/origin)', () => {
  for (const c of vectors.labels) {
    if (c.label === null) continue
    it(c.name, () => {
      expect(originLabel(c.origin as Origin)).toBe(c.label)
    })
  }
  it('an email origin without a link still reads as nothing (callers show "Email")', () => {
    expect(originLabel({ kind: 'email', provider: 'gmail', id: '1' })).toBe('')
  })
})

describe('origin readers', () => {
  const issue: Origin = { kind: 'issue', provider: 'github', id: 'o/r#7', url: 'https://github.com/o/r/issues/7' }
  const page: Origin = { kind: 'url', url: 'https://www.example.org/post', title: 'Interesting article' }
  const mail: Origin = { kind: 'email', id: '<a1@mail.example>' }
  const imported: Origin = { kind: 'import', provider: 'ticktick', id: '6f1a' }

  it('labels with the id, else the host, never a Message-ID', () => {
    expect(originLabel(issue)).toBe('o/r#7')
    expect(originLabel(page)).toBe('example.org')
    expect(originLabel(mail)).toBe('')
  })
  it('picks an icon by kind', () => {
    expect([issue, page, mail, imported].map(originIcon)).toEqual(['link', 'link', 'at-sign', 'download'])
  })
  it('matches the provider, else the kind, ignoring case', () => {
    expect(originMatches(issue, 'GitHub')).toBe(true)
    expect(originMatches(issue, 'issue')).toBe(false)
    expect(originMatches(page, 'url')).toBe(true)
    expect(originMatches(mail, 'email')).toBe(true)
    expect(originMatches(null, 'url')).toBe(false)
  })
  it('reads only object origins', () => {
    expect(originOf({ origin: issue })).toBe(issue)
    expect(originOf({ origin: null })).toBeNull()
    expect(originOf({ origin: undefined })).toBeNull()
    expect(originOf({ origin: '[Cannot decrypt]' })).toBeNull()
  })
  it('cuts a long title to 500 characters', () => {
    expect(Array.from(cutOriginTitle('é'.repeat(600)))).toHaveLength(500)
  })
})
