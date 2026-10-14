import { describe, expect, it } from 'vitest'
import { fold, highlight, match } from './match'

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
