// Formatting API (OpenSpec date-time-preferences, design D2): every preference
// combination, the spec examples, and `system` matching the old toLocale* calls.
import { afterEach, describe, expect, it } from 'vitest'
import {
  describeDue, formatDate, formatDateHeading, formatHour, formatInstant, formatShort, formatTime, resolveDateTime, setDateTime,
  systemDateTime, weekDays, weekStartOf, weekday, type SystemDateTime,
} from './dates'
import { readUserPrefs, type DateTimePrefs } from './userPrefs'

const US: SystemDateTime = { order: 'MD', hour12: true, weekStart: 0 }
const prefs = (p: Partial<DateTimePrefs>): DateTimePrefs => ({ date_format: 'system', time_format: 'system', week_start: 'system', ...p })
const r = (p: Partial<DateTimePrefs>, sys = US) => resolveDateTime(prefs(p), sys)
const TODAY = '2026-10-14'

afterEach(() => { setDateTime(prefs({})) })

describe('resolveDateTime (2.1)', () => {
  it('fills system values from the device', () => {
    expect(r({})).toMatchObject({ date: 'system', order: 'MD', time: 'system', hour12: true, weekStart: 0 })
    expect(r({}, { order: 'DM', hour12: false, weekStart: 1 })).toMatchObject({ order: 'DM', hour12: false, weekStart: 1 })
  })
  it('maps each explicit value', () => {
    expect(r({ date_format: 'day-month' })).toMatchObject({ date: 'DM', order: 'DM' })
    expect(r({ date_format: 'month-day' }, { order: 'DM', hour12: false, weekStart: 1 })).toMatchObject({ date: 'MD', order: 'MD' })
    expect(r({ date_format: 'iso' })).toMatchObject({ date: 'iso', order: 'YMD' })
    expect(r({ time_format: '12h' }, { order: 'DM', hour12: false, weekStart: 1 })).toMatchObject({ time: '12h', hour12: true })
    expect(r({ time_format: '24h' })).toMatchObject({ time: '24h', hour12: false })
    expect(r({ week_start: 'mon' }).weekStart).toBe(1)
    expect(r({ week_start: 'sun' }, { order: 'DM', hour12: false, weekStart: 1 }).weekStart).toBe(0)
    expect(r({ week_start: 'sat' }).weekStart).toBe(6)
  })
  it('reads an unknown value as system', () => {
    const row = readUserPrefs({ date_format: 'dd.mm' as never, time_format: '36h' as never, week_start: 'fri' as never })
    expect(resolveDateTime(row, US)).toMatchObject({ date: 'system', time: 'system', weekStart: 0 })
  })
  it('works out the system values on this device', () => {
    const sys = systemDateTime()
    expect(['DM', 'MD', 'YMD']).toContain(sys.order)
    expect(sys.weekStart).toBeGreaterThanOrEqual(0)
    expect(sys.weekStart).toBeLessThanOrEqual(6)
  })
})

describe('formatDate and formatTime (2.2)', () => {
  const DM = r({ date_format: 'day-month' })
  const MD = r({ date_format: 'month-day' })
  const ISO = r({ date_format: 'iso' })
  it.each([
    ['compact', DM, '2026-11-03', '3 Nov'],
    ['compact', MD, '2026-11-03', 'Nov 3'],
    ['compact', ISO, '2026-11-03', '2026-11-03'],
    ['compact', DM, '2027-02-03', '3 Feb 2027'],
    ['compact', MD, '2027-02-03', 'Feb 3, 2027'],
    ['numeric', DM, '2026-10-14', '14/10/2026'],
    ['numeric', MD, '2026-10-14', '10/14/2026'],
    ['numeric', ISO, '2026-10-14', '2026-10-14'],
    ['long', DM, '2026-11-03', 'Tue 3 Nov'],
    ['long', MD, '2026-11-03', 'Tue, Nov 3'],
    ['long', ISO, '2026-11-03', 'Tue 2026-11-03'],
    ['heading', DM, '2026-10-16', 'Friday 16 Oct'],
    ['heading', MD, '2026-10-16', 'Friday, Oct 16'],
  ] as const)('%s %o %s → %s', (style, p, iso, want) => {
    expect(formatDate(iso, style, p, TODAY)).toBe(want)
  })
  it('formats times on each clock and keeps stored due times on system', () => {
    expect(formatTime('15:00', r({ time_format: '12h' }))).toBe('3:00 PM')
    expect(formatTime('00:30', r({ time_format: '12h' }))).toBe('12:30 AM')
    expect(formatTime('12:05', r({ time_format: '12h' }))).toBe('12:05 PM')
    expect(formatTime('9:05', r({ time_format: '24h' }))).toBe('09:05')
    expect(formatTime('15:00', r({}))).toBe('15:00')
    expect(formatHour(9, r({ time_format: '12h' }))).toBe('9 AM')
    expect(formatHour(13, r({ time_format: '24h' }))).toBe('13:00')
  })
  it('formats instants: timestamps follow the format, the reminder list reads Tue 3 Nov, 09:00', () => {
    const at = new Date(2026, 10, 3, 9, 0).getTime()
    expect(formatInstant(at, 'long', r({ date_format: 'day-month', time_format: '24h' }), TODAY)).toBe('Tue 3 Nov, 09:00')
    expect(formatInstant(new Date(2026, 9, 14, 15, 5).getTime(), 'time', r({ time_format: '24h' }), TODAY)).toBe('15:05')
    expect(formatInstant(new Date(2026, 9, 14, 15, 5).getTime(), 'datetime', r({ date_format: 'iso', time_format: '12h' }), TODAY)).toBe('2026-10-14, 3:05 PM')
  })
  it('describeDue keeps Today and Tomorrow and formats the rest', () => {
    const p = r({ date_format: 'day-month', time_format: '12h' })
    expect(describeDue({ date: TODAY, time: '15:00' }, TODAY, 'UTC', p)?.label).toBe('Today 3:00 PM')
    expect(describeDue({ date: '2026-10-15' }, TODAY, 'UTC', p)?.label).toBe('Tomorrow')
    // The time on its own, in the user's format, for rows under a heading that names the day (calm-rows D4).
    expect(describeDue({ date: TODAY, time: '15:00' }, TODAY, 'UTC', p)?.time).toBe('3:00 PM')
    expect(describeDue({ date: '2026-10-15' }, TODAY, 'UTC', p)?.time).toBeNull()
    expect(describeDue({ date: '2026-11-03' }, TODAY, 'UTC', p)?.label).toBe('3 Nov')
    expect(describeDue({ date: '2027-02-03' }, TODAY, 'UTC', r({ date_format: 'month-day' }))?.label).toBe('Feb 3, 2027')
  })
})

describe('system output equals the old toLocale* output', () => {
  const sys = r({}, systemDateTime())
  const old = (iso: string, o: Intl.DateTimeFormatOptions) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, o) }
  it.each(['2026-01-05', '2026-10-14', '2026-12-31'])('%s', (iso) => {
    const thisYear = `${new Date().getFullYear()}${iso.slice(4)}`
    expect(formatShort(thisYear, sys)).toBe(old(thisYear, { month: 'short', day: 'numeric' }))
    expect(formatShort('2031' + iso.slice(4), sys)).toBe(old('2031' + iso.slice(4), { year: 'numeric', month: 'short', day: 'numeric' }))
    expect(weekday(iso)).toBe(old(iso, { weekday: 'long' }))
    expect(formatDateHeading(iso, '2000-01-01', sys)).toBe(old(iso, { weekday: 'long', month: 'short', day: 'numeric' }))
  })
})

describe('week start', () => {
  it('a Sunday start puts 2026-10-14 in 10-11 … 10-17; Monday in 10-12 … 10-18', () => {
    expect(weekDays('2026-10-14', r({ week_start: 'sun' }))).toEqual(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'])
    expect(weekStartOf('2026-10-14', r({ week_start: 'mon' }))).toBe('2026-10-12')
    expect(weekStartOf('2026-10-14', r({ week_start: 'sat' }))).toBe('2026-10-10')
    expect(weekStartOf('2026-10-11', r({ week_start: 'sun' }))).toBe('2026-10-11')
  })
  it('formatters read the snapshot when no preferences are passed', () => {
    setDateTime(prefs({ date_format: 'iso', time_format: '24h' }), US)
    expect(formatShort('2026-11-03')).toBe('2026-11-03')
    expect(formatTime('3:00')).toBe('03:00')
  })
})
