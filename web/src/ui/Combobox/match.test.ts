import { describe, expect, it } from 'vitest'
import { fold, highlight, match, prepare } from './match'

const rank = (q: string, labels: string[]) =>
  labels.map((l) => ({ l, m: match(q, l) })).filter((x) => x.m.tier > 0)
    .sort((a, b) => b.m.tier - a.m.tier || a.m.gaps - b.m.gaps).map((x) => x.l)

describe('match', () => {
  it('"gro sh" lists "Grocery shopping" above fuzzy-only matches', () => {
    expect(match('gro sh', 'Grocery shopping').tier).toBe(2)
    expect(rank('gro sh', ['Garage organisation shelf', 'Grocery shopping', 'Go rush'])[0]).toBe('Grocery shopping')
  })

  it('is accent- and case-insensitive', () => {
    expect(match('cafe', 'Café').tier).toBe(3)
    expect(match('CAFÉ', 'cafe bar').tier).toBe(2)
    expect(fold('Crème Brûlée')).toBe('creme brulee')
  })

  it('exact beats prefix beats fuzzy; fuzzy needs two characters', () => {
    expect(match('work', 'Work').tier).toBe(3)
    expect(match('wo', 'Work').tier).toBe(2)
    expect(match('wrk', 'Work').tier).toBe(1)
    expect(match('k', 'Work').tier).toBe(0)
    expect(match('zz', 'Work').tier).toBe(0)
  })

  it('matches words in the secondary text (email)', () => {
    const m = match('sam exa', 'Sam Rivera', 'sam@example.com')
    expect(m.tier).toBe(2)
    expect(m.secondary).toEqual([[4, 7]])
  })

  it('returns highlight ranges on the original text', () => {
    const m = match('gro sh', 'Grocery shopping')
    expect(highlight('Grocery shopping', m.label)).toEqual([
      { text: 'Gro', hit: true }, { text: 'cery ', hit: false }, { text: 'sh', hit: true }, { text: 'opping', hit: false },
    ])
  })
})

describe('folding by char code (list-rendering-at-scale)', () => {
  // The per-character forms the char-code paths replace.
  const foldRef = (s: string) => { let out = ''; for (const ch of s) out += ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().charAt(0) || ch; return out }
  const startsRef = (text: string) => {
    const isWord = (c: string) => /[\p{L}\p{N}]/u.test(c)
    const starts: number[] = []
    for (let i = 0; i < text.length; i++) if (isWord(text[i]) && (i === 0 || !isWord(text[i - 1]))) starts.push(i)
    return starts
  }
  it('gives the same text and word starts as folding each character', () => {
    let seed = 3
    const rand = (n: number) => Math.floor(((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * n)
    const pieces = ['Big', 'backlog', ' · ', 'Nov 14', 'Éclair', 'straße', 'ÀB-c', '…', 'Ünïcode', '42', '_x', ' ', 'Ω', 'İstanbul']
    for (let round = 0; round < 300; round++) {
      const text = Array.from({ length: 1 + rand(6) }, () => pieces[rand(pieces.length)]).join('')
      expect(fold(text)).toBe(foldRef(text))
      expect(prepare(text).starts).toEqual(startsRef(foldRef(text)))
    }
  })
})
