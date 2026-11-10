// The Quarter view's calendar math (OpenSpec change quarter-view-and-plan-spans, task 2.1):
// a quarter is the calendar quarter of the anchor, never a rolling 90 days.
import { describe, expect, it } from 'vitest'
import { quarterOf } from './quarter'

describe('quarterOf', () => {
  it('names the calendar quarter of the anchor with three months and inclusive bounds', () => {
    expect(quarterOf('2026-11-18')).toEqual({
      n: 4, year: 2026, months: ['2026-10', '2026-11', '2026-12'],
      from: '2026-10-01', to: '2026-12-31',
    })
  })

  it('crosses a year boundary and stays with the calendar quarter', () => {
    expect(quarterOf('2027-01-31').months).toEqual(['2027-01', '2027-02', '2027-03'])
    expect(quarterOf('2027-01-31')).toMatchObject({ n: 1, year: 2027 })
    expect(quarterOf('2026-12-31')).toMatchObject({ n: 4, year: 2026 })
  })

  it('uses the first and last day of the quarter, not 90 days from the anchor', () => {
    expect(quarterOf('2026-03-01').from).toBe('2026-01-01')
    expect(quarterOf('2026-06-30').to).toBe('2026-06-30')
    expect(quarterOf('2026-04-01').months).toEqual(['2026-04', '2026-05', '2026-06'])
    expect(quarterOf('2026-09-30')).toMatchObject({ n: 3, year: 2026 })
  })
})
