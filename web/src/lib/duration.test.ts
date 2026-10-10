import { describe, expect, it } from 'vitest'
import { formatMinutes, parseDuration } from './duration'

describe('parseDuration', () => {
  it.each([
    ['15m', 15], ['15', 15], ['90', 90], ['1h', 60], ['1h30', 90], ['1h30m', 90], ['1h 30m', 90], ['1H30', 90],
    ['45min', 45], ['1.5h', 90], ['2h', 120], ['+30m', 30], [' 20 ', 20], ['1:30', 90], ['0:45', 45], ['10080', 10080], ['168h', 10080],
  ])('%s → %i', (input, want) => {
    expect(parseDuration(input)).toBe(want)
  })

  it.each(['', ' ', '0', '0m', '-15', '10081', '169h', '1h60', 'abc', '1.5', '15 apples', '1:75', 'h'])('rejects %j', (input) => {
    expect(parseDuration(input)).toBeNull()
  })
})

describe('formatMinutes', () => {
  it('formats compactly with a space between hours and minutes', () => {
    expect([15, 45, 60, 90, 120, 125, 10080].map(formatMinutes)).toEqual(['15m', '45m', '1h', '1h 30m', '2h', '2h 5m', '168h'])
  })

  it('treats zero and negatives as 0m', () => {
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(-5)).toBe('0m')
  })

  it('round-trips through parseDuration', () => {
    for (const n of [1, 15, 59, 60, 61, 95, 480, 10080]) expect(parseDuration(formatMinutes(n))).toBe(n)
  })
})
