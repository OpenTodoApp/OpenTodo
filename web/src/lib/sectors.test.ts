import { describe, expect, it } from 'vitest'
import vectors from './sectors.vectors.json'
import { compareSectors, currentPeriods, isCarried, isoWeeksIn, parseSector, periodRange, relativeName, resolvePhrase, sectorGroup } from './sectors'

describe('sector vectors (shared with internal/sector)', () => {
  it.each(vectors.valid)('validity of $value', ({ value, valid }) => {
    expect(parseSector(value) !== null).toBe(valid)
  })

  for (const c of vectors.cases) {
    it(`periods, names, carry-over and groups on ${c.today} (week start ${c.week_start})`, () => {
      expect(currentPeriods(c.today, c.week_start)).toEqual(c.current)
      for (const s of c.sectors) {
        expect(relativeName(s.sector, c.today, c.week_start), s.sector).toBe(s.name)
        expect(isCarried(s.sector, c.today, c.week_start), s.sector).toBe(s.carried)
        expect(sectorGroup(s.sector, c.today, c.week_start), s.sector).toBe(s.group)
      }
      for (const [word, sector] of Object.entries(c.current)) expect(resolvePhrase(word, c.today, c.week_start)).toBe(sector)
    })
  }
})

describe('sectors', () => {
  it('knows the years with 53 ISO weeks', () => {
    expect(isoWeeksIn(2026)).toBe(53)
    expect(isoWeeksIn(2027)).toBe(52)
    expect(isoWeeksIn(2020)).toBe(53)
  })

  it('gives the days of each kind of period', () => {
    expect(periodRange(parseSector('2026-W44')!)).toEqual({ start: '2026-10-26', end: '2026-11-01' })
    expect(periodRange(parseSector('2027-W01')!)).toEqual({ start: '2027-01-04', end: '2027-01-10' })
    expect(periodRange(parseSector('2026-02')!)).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(periodRange(parseSector('2026-Q4')!)).toEqual({ start: '2026-10-01', end: '2026-12-31' })
  })

  it('names a Sunday-start This week by the Monday inside it (spec "Sunday week on a Sunday")', () => {
    expect(resolvePhrase('this week', '2026-11-01', 0)).toBe('2026-W45')
    expect(isCarried('2026-W44', '2026-11-01', 0)).toBe(true)
    expect(isCarried('2026-W44', '2026-11-01', 1)).toBe(false)
  })

  it('refuses unknown words and invalid sectors', () => {
    expect(resolvePhrase('soon', '2026-10-28')).toBeNull()
    expect(relativeName('nope', '2026-10-28')).toBeNull()
    expect(sectorGroup('', '2026-10-28')).toBeNull()
  })

  it('orders sectors by their first day, week before month before quarter', () => {
    const list = ['2026-Q4', '2026-11', '2026-W45', '2026-10', '2026-W40']
    expect([...list].sort(compareSectors)).toEqual(['2026-W40', '2026-10', '2026-Q4', '2026-11', '2026-W45'])
  })
})
