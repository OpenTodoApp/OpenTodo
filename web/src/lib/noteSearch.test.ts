import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import vectors from '../../../internal/notesearch/testdata/vectors.json'
import { matchNote, normalizeText, parseQuery, prepareNote, rankNotes, snippet, snippetPlain, stripMarkdown } from './noteSearch'

describe('note search (shared vectors.json with internal/notesearch)', () => {
  it('has the same cases as the Go test', () => {
    // internal/notesearch/notesearch_test.go TestVectorCounts pins the same counts.
    const counts = [vectors.normalize, vectors.strip, vectors.query, vectors.match, vectors.rank, vectors.snippet].map((v) => v.length)
    expect(counts).toEqual([12, 19, 9, 11, 3, 11])
  })
  for (const c of vectors.normalize) it(`normalize: ${c.name}`, () => expect(normalizeText(c.in)).toBe(c.out))
  for (const c of vectors.strip) it(`strip: ${c.name}`, () => expect(stripMarkdown(c.in)).toBe(c.out))
  for (const c of vectors.query) it(`query: ${c.name}`, () => expect(parseQuery(c.in)).toEqual(c.out))
  for (const c of vectors.match)
    it(`match: ${c.name}`, () => {
      expect(matchNote(c, parseQuery(c.query))).toEqual({ matched: c.matched, titleMatch: c.title_match, bodyWords: c.body_words })
    })
  for (const c of vectors.rank)
    it(`rank: ${c.name}`, () => {
      expect(rankNotes(c.notes, c.query).map((h) => h.note.key)).toEqual(c.keys)
    })
  for (const c of vectors.snippet)
    it(`snippet: ${c.name}`, () => {
      const max = (c as { max?: number }).max ?? 140
      expect(snippet(c.text, parseQuery(c.query), max)).toEqual(c.segments)
    })
})

describe('note search details', () => {
  it('normalises the whole text like its code points one by one', () => {
    const s = 'Ünïcödé ﬁ Straße ΟΔΟΣ Ёлка ＡＢＣ x² İ'
    expect(normalizeText(s)).toBe([...s].map((c) => normalizeText(c)).join(''))
  })
  it('lower-cases with the app language', () => {
    expect(normalizeText('KIR', 'tr')).toBe('kır')
    expect(parseQuery('IŞIK', 'tr')).toEqual(['ısık'])
  })
  it('snippet segments are the original text', () => {
    const plain = 'Ein Café in München, noch ein CAFÉ'
    const segs = snippetPlain(plain, parseQuery('cafe munchen'))
    expect(segs.map((s) => s.text).join('')).toBe(plain)
    expect(segs.filter((s) => s.mark).map((s) => s.text)).toEqual(['Café', 'München', 'CAFÉ'])
  })
  it('prepareNote is what matchNote compares', () => {
    expect(prepareNote({ title: 'Café', text: '**Oat** milk' })).toEqual({ title: 'cafe', body: 'oat milk' })
  })
})

// The Go port has no NFKD of its own: internal/notesearch/fold.go is a table of the code points
// in these blocks whose NFKD without combining marks differs. Check it against the platform.
describe('the Go fold table', () => {
  const blocks: Array<[number, number]> = [
    [0xa0, 0x24f], [0x370, 0x3ff], [0x400, 0x4ff], [0x1e00, 0x1fff], [0x2000, 0x206f], [0x2070, 0x209f],
    [0x2100, 0x218f], [0x2460, 0x24ff], [0x3000, 0x3000], [0xfb00, 0xfb06], [0xff01, 0xff5e],
  ]
  const src = readFileSync(new URL('../../../internal/notesearch/fold.go', import.meta.url), 'utf8')
  const table = new Map<number, string>()
  for (const m of src.matchAll(/0x([0-9A-F]{4,5}): ("(?:[^"\\]|\\.)*")/g)) table.set(parseInt(m[1], 16), JSON.parse(m[2]) as string)
  it('maps exactly the code points NFKD changes, to what NFKD gives', () => {
    const want = new Map<number, string>()
    for (const [a, b] of blocks)
      for (let c = a; c <= b; c++) {
        const ch = String.fromCodePoint(c)
        if (/\p{M}/u.test(ch)) continue
        const d = ch.normalize('NFKD').replace(/\p{M}/gu, '')
        if (d !== ch) want.set(c, d)
      }
    expect(table.size).toBe(want.size)
    for (const [c, d] of want) expect([c.toString(16), table.get(c)]).toEqual([c.toString(16), d])
  })
})
