// Quick add with the date and time preferences (OpenSpec date-time-preferences,
// D5 and D6; spec deltas of natural-language-capture).
import { describe, expect, it } from 'vitest'
import { nextNextWeekday, startOfNextWeek } from './dates'
import { parse, type ParseContext } from './parse'
import { dayMonthOrderSource, DEFAULT_QUICK_ADD_SETTINGS, resolveDayMonthOrder } from './settings'

const ctx = (over: Partial<ParseContext>): ParseContext => ({ today: '2026-10-09', now: '10:00', languages: ['en'], projects: [], ...over })
const auto = DEFAULT_QUICK_ADD_SETTINGS

describe('first day of the week (D5)', () => {
  it('next week with a Sunday start: Wed 2026-10-14 → Sunday 2026-10-18', () => {
    expect(parse('Plan trip next week', ctx({ today: '2026-10-14', weekStart: 0 })).due).toEqual({ date: '2026-10-18' })
  })
  it('keeps Monday when no week start is given', () => {
    expect(parse('Plan trip next week', ctx({ today: '2026-10-14' })).due).toEqual({ date: '2026-10-19' })
    expect(startOfNextWeek('2026-10-14')).toBe('2026-10-19')
    expect(startOfNextWeek('2026-10-14', 6)).toBe('2026-10-17')
  })
  it('"next <weekday>" uses the week that contains today', () => {
    // Friday 9 Oct with a Sunday start: the week is Sun 4 – Sat 10, so "next Sat" skips 10 Oct.
    expect(nextNextWeekday('2026-10-09', 5, 0)).toBe('2026-10-17')
    // Sunday 11 Oct with a Sunday start: Wed 14 Oct is in this week, so "next Wed" is 21 Oct.
    expect(nextNextWeekday('2026-10-11', 2, 0)).toBe('2026-10-21')
    // The same Sunday with a Monday start: 11 Oct ends the week, so "next Wed" is 14 Oct.
    expect(nextNextWeekday('2026-10-11', 2)).toBe('2026-10-14')
  })
})

describe('numeric order from the date format (D6)', () => {
  it('Numeric date follows the date format', () => {
    const order = resolveDayMonthOrder(auto, ['en-US'], { date_format: 'day-month' })
    expect(order).toBe('DM')
    expect(parse('Pay rent 3/11', ctx({ dayMonthOrder: order })).due).toEqual({ date: '2026-11-03' })
  })
  it('month-day reads month first', () => {
    const order = resolveDayMonthOrder(auto, ['en-GB'], { date_format: 'month-day' })
    expect(order).toBe('MD')
    expect(parse('Pay rent 3/11', ctx({ dayMonthOrder: order })).due).toEqual({ date: '2027-03-11' })
  })
  it('system and iso keep the language rule, and the source is reported', () => {
    expect(dayMonthOrderSource(auto, ['en-GB'], { date_format: 'iso' })).toEqual({ order: 'DM', source: 'language' })
    expect(dayMonthOrderSource(auto, ['en-US'], { date_format: 'system' })).toEqual({ order: 'MD', source: 'language' })
    expect(dayMonthOrderSource(auto, ['en-US'], { date_format: 'month-day' })).toEqual({ order: 'MD', source: 'date-format' })
  })
})
