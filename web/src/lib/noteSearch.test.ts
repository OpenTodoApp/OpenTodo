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

describe('snippets of ASCII text (list-rendering-at-scale)', () => {
  it('match the per-character path: a non-ASCII character past the window takes that path', () => {
    let seed = 11
    const rand = (n: number) => Math.floor(((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * n)
    const words = ['Kitchen', 'kitchen', 'aa', 'a', 'Oven', 'IKEA', 'shelf', 'in', 'the', 'I']
    for (let round = 0; round < 200; round++) {
      const head = Array.from({ length: 12 }, () => words[rand(words.length)]).join(' ')
      const text = `${head} ${'filler '.repeat(60)}`
      const terms = [...new Set([words[rand(words.length)], words[rand(words.length)]].map((w) => normalizeText(w)))]
      for (const lang of [undefined, 'en', 'tr']) {
        expect(snippetPlain(text, terms, 140, lang)).toEqual(snippetPlain(`${text}é`, terms, 140, lang))
      }
    }
  })
})

describe('fast paths for ASCII notes (notes-compaction-at-scale)', () => {
  let seed = 7
  const rand = (n: number) => Math.floor(((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * n)
  const pieces = ['word', 'Kitchen', ' ', '  ', '\t', '*', '**', '_', '~~', '~', '`', '``', '[', ']', '(', ')', '](x)', '!', '|', '\\', '\\*', '#', '- ', '1. ', '> ', '[ ] ', 'a_b', 'x*y', '---']

  it('strip a line the same way as the per-character path', () => {
    for (let round = 0; round < 3000; round++) {
      // Starting with a word: block markers stay out of it, the inline pass is what differs.
      const line = `word ${Array.from({ length: 1 + rand(10) }, () => pieces[rand(pieces.length)]).join('')}`
      // "—" (no letter, digit or marker) at the end sends the line through the code-point path and adds only itself.
      const ascii = stripMarkdown(line)
      const other = stripMarkdown(`${line}—`)
      expect(other.endsWith('—') ? other.slice(0, -1).trimEnd() : other).toBe(ascii)
    }
  })

  it('normalize ASCII text as NFKD would, in every language', () => {
    const slow = (s: string, lang?: string) => (lang ? s.normalize('NFKD').toLocaleLowerCase(lang) : s.normalize('NFKD').toLowerCase()).replace(/\p{M}/gu, '').replace(/ς/g, 'σ')
    for (const lang of [undefined, 'en', 'tr', 'az', 'lt', 'de'])
      for (const s of ['Kitchen IKEA', 'I i İ', 'ISTANBUL', 'Ii Jj', 'x'.repeat(50)]) expect(normalizeText(s, lang)).toBe(slow(s, lang))
  })
})
