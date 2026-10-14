// Date and time field input (date-time-preferences 3.1).
import { describe, expect, it } from 'vitest'
import { parseDateInput, parseTimeInput } from './parse'

const TODAY = '2026-10-14' // a Wednesday
const DM = { today: TODAY, prefs: { order: 'DM' as const, weekStart: 1 } }
const MD = { today: TODAY, prefs: { order: 'MD' as const, weekStart: 1 } }
const YMD = { today: TODAY, prefs: { order: 'YMD' as const, weekStart: 1 } }

describe('parseDateInput', () => {
  it('reads numeric dates in the user order and rolls forward', () => {
    expect(parseDateInput('3/11', DM)).toBe('2026-11-03')
    expect(parseDateInput('3/11', MD)).toBe('2027-03-11')
    expect(parseDateInput('3.10', DM)).toBe('2027-10-03') // 3 Oct has passed
    expect(parseDateInput('14-10', DM)).toBe('2026-10-14') // today counts
    expect(parseDateInput('14/10/2026', DM)).toBe('2026-10-14')
    expect(parseDateInput('10/14/26', MD)).toBe('2026-10-14')
    expect(parseDateInput('2026/10/14', YMD)).toBe('2026-10-14')
  })
  it('reads ISO in any order', () => {
    expect(parseDateInput('2026-11-03', MD)).toBe('2026-11-03')
    expect(parseDateInput('2027-2-3', DM)).toBe('2027-02-03')
  })
  it('rejects dates that do not exist', () => {
    expect(parseDateInput('31/02', DM)).toBeNull()
    expect(parseDateInput('31/02/2027', DM)).toBeNull()
    expect(parseDateInput('2026-13-01', DM)).toBeNull()
    expect(parseDateInput('13/13', DM)).toBeNull()
    expect(parseDateInput('soon-ish', DM)).toBeNull()
    expect(parseDateInput('', DM)).toBeNull()
  })
  it('reads relative words and weekday names', () => {
    expect(parseDateInput('today', DM)).toBe(TODAY)
    expect(parseDateInput('Tomorrow', DM)).toBe('2026-10-15')
    expect(parseDateInput('fri', DM)).toBe('2026-10-16')
    expect(parseDateInput('3 Nov', DM)).toBe('2026-11-03')
    expect(parseDateInput('domani', { ...DM, languages: ['it'] })).toBe('2026-10-15')
    expect(parseDateInput('tomorrow evening plans', DM)).toBeNull() // the whole text must be a date
  })
})

describe('parseTimeInput', () => {
  it.each([
    ['15', '15:00'], ['1530', '15:30'], ['15:30', '15:30'], ['930', '09:30'], ['9.05', '09:05'],
    ['3pm', '15:00'], ['3:30 pm', '15:30'], ['3:30 PM', '15:30'], ['12am', '00:00'], ['12 pm', '12:00'], ['noon', '12:00'],
  ])('%s → %s', (input, want) => expect(parseTimeInput(input)).toBe(want))
  it.each(['24', '25:00', '13pm', '0am', '15:60', 'later', ''])('rejects %s', (input) => expect(parseTimeInput(input)).toBeNull())
})
