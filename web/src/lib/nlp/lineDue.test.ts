import { describe, expect, it } from 'vitest'
import { duePhrase, withDue } from './lineDue'
import { parse, type ParseContext } from './parse'

// Saturday 21 November 2026.
const ctx = (languages: string[]): ParseContext => ({ today: '2026-11-21', languages, projects: [] })

describe('duePhrase', () => {
  it('words the next two days and later dates, as the parser reads them', () => {
    expect(duePhrase({ date: '2026-11-21' }, ctx(['en']))).toBe('today')
    expect(duePhrase({ date: '2026-11-22' }, ctx(['en']))).toBe('tomorrow')
    expect(duePhrase({ date: '2026-11-27' }, ctx(['en']))).toBe('Fri 27 Nov')
    expect(duePhrase({ date: '2026-11-22', time: '17:00' }, ctx(['en']))).toBe('tomorrow 17:00')
  })

  it('writes the year only when the date needs it', () => {
    expect(duePhrase({ date: '2027-01-08' }, ctx(['en']))).toBe('Fri 8 Jan')
    expect(duePhrase({ date: '2028-01-08' }, ctx(['en']))).toBe('Sat 8 Jan 2028')
  })

  it('uses the line language, and a form the parser reads back', () => {
    expect(duePhrase({ date: '2026-11-22' }, ctx(['it']))).toBe('domani')
    expect(duePhrase({ date: '2026-11-27' }, ctx(['it']))).toBe('ven 27 nov')
    expect(duePhrase({ date: '2026-11-27' }, ctx(['de']))).toBe('Fr. 27 Nov')
  })

  it('reads back as the picked date in every bundled language', () => {
    for (const lang of ['en', 'de', 'fr', 'it', 'es', 'pt', 'nl', 'tr', 'pl', 'ru', 'zh']) {
      for (const due of [{ date: '2026-11-21' }, { date: '2026-11-22', time: '09:30' }, { date: '2026-12-31' }, { date: '2027-03-02', time: '17:00' }]) {
        const r = parse(`Call ${duePhrase(due, ctx([lang]))}`, ctx([lang]))
        expect({ lang, title: r.title, due: r.due }).toEqual({ lang, title: 'Call', due })
      }
    }
  })
})

describe('withDue', () => {
  const line = (text: string, due: Parameters<typeof withDue>[2], languages = ['en']) => {
    const c = ctx(languages)
    const chip = parse(text, c).chips.find((x) => x.kind === 'due')
    return withDue(text, chip?.spans ?? [], due, c)
  }

  it('appends a date to a line without one', () => {
    expect(line('Call the plumber', { date: '2026-11-22', time: '17:00' })).toBe('Call the plumber tomorrow 17:00')
    expect(line('', { date: '2026-11-22' })).toBe('tomorrow')
  })

  it('replaces the line date rather than adding a second', () => {
    expect(line('Call the plumber tomorrow #Home', { date: '2026-11-23' })).toBe('Call the plumber #Home Mon 23 Nov')
    expect(line('Call tomorrow 5pm about tiles', { date: '2026-11-27' })).toBe('Call about tiles Fri 27 Nov')
  })

  it('removes the date for null', () => {
    expect(line('Call the plumber tomorrow at 5pm', null)).toBe('Call the plumber')
  })
})
