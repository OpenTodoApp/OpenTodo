// inbox-triage "Scheduling sheet in triage": choices counted back from the deadline.
import { describe, expect, it } from 'vitest'
import { monthBefore, relativeDoOn } from './relativeDoOn'

describe('relativeDoOn', () => {
  it('A week before the deadline: key 4 means seven days earlier', () => {
    const c = relativeDoOn('2026-11-06', '2026-10-21')
    expect(c.map((x) => [x.key, x.date])).toEqual([
      ['1', '2026-11-06'], ['2', '2026-11-05'], ['3', '2026-11-03'], ['4', '2026-10-30'], ['5', '2026-10-23'],
    ])
  })

  it('Choices in the past are left out; the others keep their keys', () => {
    const c = relativeDoOn('2026-10-24', '2026-10-21')
    expect(c.map((x) => [x.key, x.id, x.date])).toEqual([['1', 'on', '2026-10-24'], ['2', 'day', '2026-10-23'], ['3', 'three-days', '2026-10-21']])
  })

  it('Month without the day: 31 March is 28 February', () => {
    expect(monthBefore('2026-03-31')).toBe('2026-02-28')
    expect(relativeDoOn('2026-03-31', '2026-01-01').find((x) => x.key === '6')?.date).toBe('2026-02-28')
  })

  it('a month before in January is in December of the year before; leap years keep the 29th', () => {
    expect(monthBefore('2027-01-15')).toBe('2026-12-15')
    expect(monthBefore('2028-03-29')).toBe('2028-02-29')
  })

  it('No deadline: no relative choices', () => {
    expect(relativeDoOn(null, '2026-10-21')).toEqual([])
    expect(relativeDoOn(undefined, '2026-10-21')).toEqual([])
  })

  it('a deadline already past offers nothing', () => {
    expect(relativeDoOn('2026-10-20', '2026-10-21')).toEqual([])
  })
})
