// Date and time field input (date-time-preferences 3.1).
import { describe, expect, it } from 'vitest'
import { SHIPPED } from '../../locales'
import { parseDateInput, parseDateTimeInput, parseTimeInput } from './parse'

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

// OpenSpec change when-picker, D4: the Do on field takes a date with a time.
describe('parseDateTimeInput', () => {
  const EN = { ...DM, languages: ['en'] }
  it('reads a date alone exactly as the date reader does', () => {
    expect(parseDateTimeInput('fri', EN)).toEqual({ date: '2026-10-16' })
    expect(parseDateTimeInput('3/11', EN)).toEqual({ date: '2026-11-03' })
  })
  it.each([
    ['tomorrow 3pm', { date: '2026-10-15', time: '15:00' }],
    ['tomorrow at 15:30', { date: '2026-10-15', time: '15:30' }],
    ['fri 9am', { date: '2026-10-16', time: '09:00' }],
    ['3pm tomorrow', { date: '2026-10-15', time: '15:00' }],
    ['15:30', { date: null, time: '15:30' }],
  ])('%s', (input, want) => expect(parseDateTimeInput(input, EN)).toEqual(want))
  it('reads German through its vocabulary', () => {
    expect(parseDateTimeInput('morgen um 15 Uhr', { ...DM, languages: ['de'] })).toEqual({ date: '2026-10-15', time: '15:00' })
  })
  it.each(['tomorrow soon', 'later', 'fri 3pm please', ''])('rejects %s', (input) => expect(parseDateTimeInput(input, EN)).toBeNull())

  // Every catalogue's placeholder example is text the field reads in that language (D4).
  const catalogs = import.meta.glob<{ default: Record<string, string> }>(['../../locales/*.json', '!../../locales/messages.json'], { eager: true })
  it.each(SHIPPED.map((l) => l.code))('the %s placeholder example parses', (code) => {
    const example = code === 'en' ? 'tomorrow 3pm, next fri' : catalogs[`../../locales/${code}.json`].default['tomorrow 3pm, next fri']
    const parts = example.split(/[,，、]\s*/)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) expect(parseDateTimeInput(part, { ...DM, languages: [code] }), `${code}: ${part}`).not.toBeNull()
    expect(parseDateTimeInput(parts[0], { ...DM, languages: [code] })?.time, `${code}: a time in ${parts[0]}`).toBeTruthy()
  })
})
