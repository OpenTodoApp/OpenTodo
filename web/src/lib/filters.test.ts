import { describe, expect, it } from 'vitest'
import { durationPredicate, loadDurationFilter, saveDurationFilter, type DurationFilter } from './filters'

const est = (estimate_minutes: number | null) => ({ estimate_minutes })
const sample = [null, 1, 10, 15, 16, 29, 30, 45, 60, 61, 120]

function keep(kind: DurationFilter) {
  return sample.filter((m) => durationPredicate(kind)(est(m)))
}

describe('durationPredicate', () => {
  it('quick: 15 minutes or less, estimated only', () => {
    expect(keep('quick')).toEqual([1, 10, 15])
  })
  it('under30: strictly under 30 minutes', () => {
    expect(keep('under30')).toEqual([1, 10, 15, 16, 29])
  })
  it('over60: strictly over one hour', () => {
    expect(keep('over60')).toEqual([61, 120])
  })
  it('unestimated: no estimate', () => {
    expect(keep('unestimated')).toEqual([null])
  })
})

describe('duration filter persistence', () => {
  function memory() {
    const data = new Map<string, string>()
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
  }

  it('stores one filter per view and clears it', () => {
    const s = memory()
    saveDurationFilter('today', 'quick', s)
    saveDurationFilter('project:p1', 'over60', s)
    expect(loadDurationFilter('today', s)).toBe('quick')
    expect(loadDurationFilter('project:p1', s)).toBe('over60')
    expect(loadDurationFilter('inbox', s)).toBeNull()
    saveDurationFilter('today', null, s)
    expect(loadDurationFilter('today', s)).toBeNull()
    expect(loadDurationFilter('project:p1', s)).toBe('over60')
  })

  it('ignores unknown values, corrupt JSON and missing storage', () => {
    const s = memory()
    s.setItem('opentodo.durationFilter', JSON.stringify({ today: 'tiny' }))
    expect(loadDurationFilter('today', s)).toBeNull()
    s.setItem('opentodo.durationFilter', '{nope')
    expect(loadDurationFilter('today', s)).toBeNull()
    expect(loadDurationFilter('today', null)).toBeNull()
    expect(() => saveDurationFilter('today', 'quick', null)).not.toThrow()
  })
})
