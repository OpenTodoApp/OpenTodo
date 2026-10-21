import { describe, expect, it } from 'vitest'
import { matchDuration, matchLabel, matchPriority, matchProject, type ProjectRef } from './attributes'
import { matchDateAt, matchTimeAt, nextNextWeekday, nextWeekday, type DateContext } from './dates'
import { parse, rebaseDismissed, type ParseContext } from './parse'
import { logicalToday } from '../dates'
import { stripSpans, tokenize } from './tokenize'
import { activeLanguages, normalize, VOCABULARIES, vocabulariesFor } from './vocab'

// Friday 9 October 2026, 10:00 local: the reference date used by the spec scenarios.
const TODAY = '2026-10-09'
const NOW = '10:00'

const PROJECTS: ProjectRef[] = [
  { id: 'p-work', name: 'Work' },
  { id: 'p-home', name: 'Home' },
  { id: 'p-homework', name: 'Homework' },
  { id: 'p-travel', name: 'Travel' },
  { id: 'p-old', name: 'Oldies', archived: true },
  { id: 'p-gone', name: 'Garden', deleted_at: 5 },
]

function ctx(over: Partial<ParseContext> = {}): ParseContext {
  return { today: TODAY, now: NOW, languages: ['en'], projects: PROJECTS, ...over }
}

describe('tokenize', () => {
  it('splits on whitespace and reports character spans', () => {
    const { tokens } = tokenize('  Buy   milk\ttomorrow ')
    expect(tokens.map((t) => [t.text, t.start, t.end])).toEqual([
      ['Buy', 2, 5],
      ['milk', 8, 12],
      ['tomorrow', 13, 21],
    ])
    expect(tokens.every((t) => !t.quoted)).toBe(true)
  })

  it('marks words inside balanced double quotes as quoted and reports the quotes', () => {
    const { tokens, quoteSpans } = tokenize('Review "may 3" report')
    expect(tokens.map((t) => [t.text, t.quoted])).toEqual([
      ['Review', false],
      ['may', true],
      ['3', true],
      ['report', false],
    ])
    expect(quoteSpans.map((s) => s.start)).toEqual([7, 13])
  })

  it('treats an unmatched quote as an ordinary character', () => {
    const { tokens, quoteSpans } = tokenize('5" screen')
    expect(tokens.map((t) => t.text)).toEqual(['5"', 'screen'])
    expect(quoteSpans).toEqual([])
  })

  it('normalises case, diacritics, ß and trailing commas', () => {
    expect(normalize('Nächsten')).toBe('nachsten')
    expect(normalize('Straße')).toBe('strasse')
    expect(normalize('Mañana,')).toBe('manana')
    expect(normalize('aujourd’hui')).toBe("aujourd'hui")
  })

  it('stripSpans collapses whitespace and deletes quote characters without a gap', () => {
    const line = 'Buy  milk tomorrow   p2'
    expect(stripSpans(line, [{ start: 10, end: 18, text: 'tomorrow' }, { start: 21, end: 23, text: 'p2' }])).toBe('Buy milk')
    expect(stripSpans('"Read"!', [], [{ start: 0, end: 1, text: '"' }, { start: 5, end: 6, text: '"' }])).toBe('Read!')
    expect(stripSpans('  a   b  ', [])).toBe('a b')
  })
})

describe('attribute tokens', () => {
  it('matches projects exactly first, then by unique prefix, case-insensitively', () => {
    expect(matchProject('#work', PROJECTS)?.id).toBe('p-work')
    expect(matchProject('#WORK', PROJECTS)?.id).toBe('p-work')
    expect(matchProject('#trav', PROJECTS)?.id).toBe('p-travel')
    // "home" is an exact match even though it is also a prefix of "Homework".
    expect(matchProject('#home', PROJECTS)?.id).toBe('p-home')
    expect(matchProject('#homew', PROJECTS)?.id).toBe('p-homework')
  })

  it('does not guess an ambiguous prefix or an unknown name', () => {
    expect(matchProject('#hom', PROJECTS)).toBeNull()
    expect(matchProject('#ambiguous', PROJECTS)).toBeNull()
    expect(matchProject('#', PROJECTS)).toBeNull()
    expect(matchProject('work', PROJECTS)).toBeNull()
  })

  it('skips archived and deleted projects', () => {
    expect(matchProject('#oldies', PROJECTS)).toBeNull()
    expect(matchProject('#garden', PROJECTS)).toBeNull()
  })

  it('matches nested projects anywhere in the tree', () => {
    const tree: ProjectRef[] = [
      { id: 'work', name: 'Work' },
      { id: 'w-docs', name: 'Docs', parent_id: 'work' },
      { id: 'w-q4', name: 'Q4 launch', parent_id: 'w-docs' },
      { id: 'home', name: 'Home' },
      { id: 'h-docs', name: 'Docs', parent_id: 'home' },
      { id: 'h-deep', name: 'Paperwork', parent_id: 'h-docs' },
      { id: 'top-paper', name: 'Paperwork' },
    ]
    expect(matchProject('#q4launch', tree)?.id).toBe('w-q4')
    expect(matchProject('#q4', tree)?.id).toBe('w-q4')
    // Same exact name at the same depth: smallest id; at different depths: the shallowest.
    expect(matchProject('#docs', tree)?.id).toBe('h-docs')
    expect(matchProject('#paperwork', tree)?.id).toBe('top-paper')
    expect(matchProject('#paperwork', [...tree].reverse())?.id).toBe('top-paper')
    // An ambiguous prefix is still not guessed.
    expect(matchProject('#doc', tree)).toBeNull()
  })

  it('treats a child of an archived parent as top level and survives parent cycles', () => {
    const ps: ProjectRef[] = [
      { id: 'arch', name: 'Old', archived: true },
      { id: 'a', name: 'Notes', parent_id: 'arch' },
      { id: 'x', name: 'Loop', parent_id: 'y' },
      { id: 'y', name: 'Notes', parent_id: 'x' },
    ]
    expect(matchProject('#notes', ps)?.id).toBe('a')
    expect(matchProject('#loop', ps)?.id).toBe('x')
  })

  it('matches multi-word project names written without spaces', () => {
    const ps = [{ id: 'x', name: 'Side Project' }]
    expect(matchProject('#sideproject', ps)?.id).toBe('x')
    expect(matchProject('#side-project', ps)?.id).toBe('x')
    expect(matchProject('#side', ps)?.id).toBe('x')
  })

  it('keeps @label names exactly as typed', () => {
    expect(matchLabel('@call')).toBe('call')
    expect(matchLabel('@Waiting-For')).toBe('Waiting-For')
    expect(matchLabel('@call,')).toBe('call')
    expect(matchLabel('@')).toBeNull()
    expect(matchLabel('me@example.com')).toBeNull()
  })

  it('recognises p1–p4 only', () => {
    expect([matchPriority('p1'), matchPriority('P2'), matchPriority('p3'), matchPriority('p4')]).toEqual([1, 2, 3, 4])
    expect(matchPriority('p5')).toBeNull()
    expect(matchPriority('p0')).toBeNull()
    expect(matchPriority('p12')).toBeNull()
    expect(matchPriority('pp1')).toBeNull()
  })

  it.each([
    ['+30m', 30], ['+30', 30], ['+45min', 45], ['+2h', 120], ['+1h30', 90], ['+1h30m', 90], ['+1.5h', 90], ['+1,5h', 90],
    ['45min', 45], ['2h', 120], ['+10080m', 10080],
  ])('duration %s → %i minutes', (token, minutes) => {
    expect(matchDuration(token, { bareHourIsTime: false })).toBe(minutes)
  })

  it.each(['+0', '+0m', '+10081', '30m', '1h30', '+1h75', '+', '+abc', '+-5', 'h'])('rejects duration %s', (token) => {
    expect(matchDuration(token, { bareHourIsTime: false })).toBeNull()
  })

  it('leaves a bare "15h" to the time grammar when a language writes times that way', () => {
    expect(matchDuration('2h', { bareHourIsTime: true })).toBeNull()
    expect(matchDuration('+2h', { bareHourIsTime: true })).toBe(120)
  })
})

describe('vocabularies', () => {
  const codes = Object.keys(VOCABULARIES)

  it('bundles en, de, fr, it, es and pt', () => {
    expect(codes.sort()).toEqual(['de', 'en', 'es', 'fr', 'it', 'pt'])
  })

  it('every vocabulary defines the same keys and table shapes', () => {
    const shape = (v: object) => Object.keys(v).sort()
    const reference = shape(VOCABULARIES.en)
    for (const code of codes) {
      const v = VOCABULARIES[code]
      expect(shape(v), code).toEqual(reference)
      expect(v.code).toBe(code)
      expect(v.weekdays, code).toHaveLength(7)
      expect(v.months, code).toHaveLength(12)
      expect(shape(v.units), code).toEqual(['day', 'hour', 'minute', 'month', 'week', 'year'])
      for (const wd of v.weekdays) expect(wd.length, code).toBeGreaterThan(0)
      for (const m of v.months) expect(m.names.length, code).toBeGreaterThan(0)
      expect(Object.values(v.dayWords), code).toContain(0)
      expect(Object.values(v.dayWords), code).toContain(1)
      for (const t of Object.values(v.timeWords)) expect(t, code).toMatch(/^\d\d:\d\d$/)
    }
  })

  it('active languages follow the browser list, filtered to bundled ones, with English always on', () => {
    expect(activeLanguages(['de-CH', 'fr', 'en-US'])).toEqual(['de', 'fr', 'en'])
    expect(activeLanguages(['it'])).toEqual(['it', 'en'])
    expect(activeLanguages(['ja', 'zh-CN'])).toEqual(['en'])
    expect(activeLanguages([])).toEqual(['en'])
    expect(activeLanguages(['pt-BR', 'pt-PT'])).toEqual(['pt', 'en'])
  })
})

describe('calendar rules', () => {
  it('bare weekday is the next occurrence after today', () => {
    expect(nextWeekday(TODAY, 4)).toBe('2026-10-16') // Friday → next Friday
    expect(nextWeekday(TODAY, 5)).toBe('2026-10-10') // Saturday tomorrow
  })

  it('"next <weekday>" skips a day that is still in the current week', () => {
    expect(nextNextWeekday(TODAY, 5)).toBe('2026-10-17') // Sat is this week → the following one
    expect(nextNextWeekday(TODAY, 2)).toBe('2026-10-14') // Wed is already next week
    expect(nextNextWeekday('2026-10-05', 2)).toBe('2026-10-14') // from a Monday: Wed of next week
  })
})

/** Parse one phrase alone and return its due value (the whole line must be consumed). */
function dueOf(phrase: string, languages: string[] = ['en'], over: Partial<ParseContext> = {}) {
  const r = parse(phrase, ctx({ languages, ...over }))
  return { due: r.due, title: r.title }
}

describe('date phrases (English)', () => {
  it.each([
    ['today', '2026-10-09'],
    ['tonight', '2026-10-09'],
    ['tomorrow', '2026-10-10'],
    ['tmrw', '2026-10-10'],
    ['day after tomorrow', '2026-10-11'],
    ['Monday', '2026-10-12'],
    ['fri', '2026-10-16'],
    ['on Friday', '2026-10-16'],
    ['by wed.', '2026-10-14'],
    ['next Monday', '2026-10-12'],
    ['next sat', '2026-10-17'],
    ['this sat', '2026-10-10'],
    ['in 3 days', '2026-10-12'],
    ['in 1 day', '2026-10-10'],
    ['in 2 weeks', '2026-10-23'],
    ['in a week', '2026-10-16'],
    ['in a month', '2026-11-09'],
    ['next week', '2026-10-12'],
    ['next month', '2026-11-01'],
    ['3 Feb', '2027-02-03'],
    ['Feb 3', '2027-02-03'],
    ['3rd of February', '2027-02-03'],
    ['December 25th', '2026-12-25'],
    ['dec 25 2027', '2027-12-25'],
    ['October 9', '2026-10-09'],
    ['oct 8', '2027-10-08'],
    ['may', '2027-05-01'],
    ['mar 3', '2027-03-03'],
    ['12/11', '2026-12-11'],
    ['25/12', '2026-12-25'],
    ['1/2/2027', '2027-01-02'],
    ['2026-11-03', '2026-11-03'],
  ])('%s → %s', (phrase, date) => {
    const r = dueOf(phrase)
    expect(r.due).toEqual({ date })
    expect(r.title).toBe('')
  })

  it('month abbreviations need a day number', () => {
    expect(dueOf('mar').due).toBeNull()
    expect(dueOf('jan').due).toBeNull()
  })

  it('numeric dates follow the day/month order', () => {
    expect(dueOf('12/11', ['en'], { dayMonthOrder: 'DM' }).due).toEqual({ date: '2026-11-12' })
    expect(dueOf('12/11', ['de']).due).toEqual({ date: '2026-11-12' })
    expect(dueOf('12/11', ['de'], { dayMonthOrder: 'MD' }).due).toEqual({ date: '2026-12-11' })
  })

  it('a date in the past rolls forward, Feb 29 to the next leap year', () => {
    expect(dueOf('1/10').due).toEqual({ date: '2027-01-10' })
    expect(dueOf('Feb 29').due).toEqual({ date: '2028-02-29' })
    expect(dueOf('Feb 30').due).toBeNull()
  })

  it('in N months clamps to the end of the month', () => {
    expect(dueOf('in 1 month', ['en'], { today: '2027-01-31' }).due).toEqual({ date: '2027-02-28' })
  })
})

describe('time phrases', () => {
  it.each([
    ['at 3pm', '15:00'],
    ['3pm', '15:00'],
    ['3 pm', '15:00'],
    ['3:30pm', '15:30'],
    ['3:30 p.m.', '15:30'],
    ['12am', '00:00'],
    ['12pm', '12:00'],
    ['11:15 am', '11:15'],
    ['16:30', '16:30'],
    ['at 16:30', '16:30'],
    ['at 9', '09:00'],
    ['at 9.30', '09:30'],
    ['noon', '12:00'],
    ['at midnight', '00:00'],
    ['in 3 hours', '13:00'],
  ])('%s → today %s', (phrase, time) => {
    const r = dueOf(phrase)
    expect(r.due).toEqual({ date: TODAY, time })
    expect(r.title).toBe('')
  })

  it('a time alone means today, even if already past', () => {
    expect(dueOf('at 8am').due).toEqual({ date: TODAY, time: '08:00' })
  })

  it('"in N hours" crosses midnight', () => {
    expect(dueOf('in 2 hours', ['en'], { now: '23:30' }).due).toEqual({ date: '2026-10-10', time: '01:30' })
  })

  it('bare numbers are not times', () => {
    const r = parse('Buy 3 apples', ctx())
    expect(r.due).toBeNull()
    expect(r.title).toBe('Buy 3 apples')
    expect(parse('Read 9.30 notes', ctx()).due).toBeNull()
    expect(parse('Order 13pm', ctx()).due).toBeNull()
    expect(parse('Meet 25:00', ctx()).due).toBeNull()
  })

  it('combines a date and a time anywhere in the line', () => {
    expect(dueOf('next Wed at 3pm').due).toEqual({ date: '2026-10-14', time: '15:00' })
    const r = parse('tomorrow #work 9am call', ctx())
    expect(r.due).toEqual({ date: '2026-10-10', time: '09:00' })
    expect(r.title).toBe('call')
  })

  it('exposes matchers for direct use', () => {
    const d: DateContext = { today: TODAY, now: NOW, vocabs: vocabulariesFor(['en']), dayMonthOrder: 'MD' }
    const { tokens } = tokenize('see you next friday at 5pm')
    expect(matchDateAt(tokens, 2, d)).toEqual({ date: '2026-10-16', from: 2, to: 4 })
    expect(matchTimeAt(tokens, 4, d)).toEqual({ time: '17:00', from: 4, to: 6 })
    expect(matchDateAt(tokens, 0, d)).toBeNull()
  })
})

describe('date and time phrases in other languages', () => {
  it.each([
    // German
    ['de', 'heute', { date: '2026-10-09' }],
    ['de', 'morgen', { date: '2026-10-10' }],
    ['de', 'übermorgen', { date: '2026-10-11' }],
    ['de', 'uebermorgen', null],
    ['de', 'am Freitag', { date: '2026-10-16' }],
    ['de', 'Mi.', { date: '2026-10-14' }],
    ['de', 'nächsten Mittwoch um 15 Uhr', { date: '2026-10-14', time: '15:00' }],
    ['de', 'nächsten Samstag', { date: '2026-10-17' }],
    ['de', 'in 3 Tagen', { date: '2026-10-12' }],
    ['de', 'in einer Woche', { date: '2026-10-16' }],
    ['de', 'nächste Woche', { date: '2026-10-12' }],
    ['de', 'nächsten Monat', { date: '2026-11-01' }],
    ['de', '3. Februar', { date: '2027-02-03' }],
    ['de', '12.11.', { date: '2026-11-12' }],
    ['de', '24.12.2026', { date: '2026-12-24' }],
    ['de', '12.11', { date: '2026-11-12' }],
    ['de', '9.30', null],
    ['de', '14:30 Uhr', { date: TODAY, time: '14:30' }],
    ['de', 'um 9', { date: TODAY, time: '09:00' }],
    ['de', 'März 3', { date: '2027-03-03' }],
    // French
    ['fr', "aujourd'hui", { date: '2026-10-09' }],
    ['fr', 'demain à 15h', { date: '2026-10-10', time: '15:00' }],
    ['fr', 'après-demain', { date: '2026-10-11' }],
    ['fr', 'mardi prochain', { date: '2026-10-13' }],
    ['fr', 'samedi prochain', { date: '2026-10-17' }],
    ['fr', 'le vendredi', { date: '2026-10-16' }],
    ['fr', 'dans 2 semaines', { date: '2026-10-23' }],
    ['fr', 'dans 3 jours', { date: '2026-10-12' }],
    ['fr', 'la semaine prochaine', null],
    ['fr', 'semaine prochaine', { date: '2026-10-12' }],
    ['fr', '3 février', { date: '2027-02-03' }],
    ['fr', '15h30', { date: TODAY, time: '15:30' }],
    ['fr', 'à 9 heures', { date: TODAY, time: '09:00' }],
    ['fr', 'midi', { date: TODAY, time: '12:00' }],
    // Italian
    ['it', 'oggi', { date: '2026-10-09' }],
    ['it', 'domani alle 15', { date: '2026-10-10', time: '15:00' }],
    ['it', 'dopodomani', { date: '2026-10-11' }],
    ['it', 'mercoledì', { date: '2026-10-14' }],
    ['it', 'lunedì prossimo', { date: '2026-10-12' }],
    ['it', 'prossimo sabato', { date: '2026-10-17' }],
    ['it', 'tra 3 giorni', { date: '2026-10-12' }],
    ['it', 'fra una settimana', { date: '2026-10-16' }],
    ['it', 'il 3 febbraio', { date: '2027-02-03' }],
    ['it', 'alle 18:45', { date: TODAY, time: '18:45' }],
    ['it', 'mezzogiorno', { date: TODAY, time: '12:00' }],
    // Spanish
    ['es', 'hoy', { date: '2026-10-09' }],
    ['es', 'mañana a las 15:00', { date: '2026-10-10', time: '15:00' }],
    ['es', 'pasado mañana', { date: '2026-10-11' }],
    ['es', 'el próximo lunes', { date: '2026-10-12' }],
    ['es', 'martes que viene', { date: '2026-10-13' }],
    ['es', 'en 3 días', { date: '2026-10-12' }],
    ['es', 'dentro de 2 semanas', { date: '2026-10-23' }],
    ['es', '3 de febrero', { date: '2027-02-03' }],
    ['es', 'el 25 de diciembre', { date: '2026-12-25' }],
    ['es', 'a las 9', { date: TODAY, time: '09:00' }],
    // Portuguese
    ['pt', 'hoje', { date: '2026-10-09' }],
    ['pt', 'amanhã às 15h', { date: '2026-10-10', time: '15:00' }],
    ['pt', 'depois de amanhã', { date: '2026-10-11' }],
    ['pt', 'sexta-feira', { date: '2026-10-16' }],
    ['pt', 'próxima segunda', { date: '2026-10-12' }],
    ['pt', 'sábado que vem', { date: '2026-10-17' }],
    ['pt', 'daqui a 3 dias', { date: '2026-10-12' }],
    ['pt', 'em 2 semanas', { date: '2026-10-23' }],
    ['pt', '3 de fevereiro', { date: '2027-02-03' }],
    ['pt', 'às 9', { date: TODAY, time: '09:00' }],
  ])('[%s] %s', (lang, phrase, due) => {
    const r = dueOf(phrase, [lang])
    if (due === null) {
      // Not (fully) a phrase: some text must remain in the title.
      expect(r.title).not.toBe('')
    } else {
      expect(r.due).toEqual(due)
      expect(r.title).toBe('')
    }
  })

  it('all active languages match at once, English always included', () => {
    expect(parse('Pay rent tomorrow', ctx({ languages: ['it'] })).due).toEqual({ date: '2026-10-10' })
    expect(parse('Pagare affitto domani', ctx({ languages: ['it'] })).due).toEqual({ date: '2026-10-10' })
    // German vocabulary is off unless German is active.
    expect(parse('Zahnarzt morgen', ctx({ languages: ['en'] })).due).toBeNull()
  })

  it('longest match decides collisions ("mar" = Tuesday in Spanish, March next to a day)', () => {
    expect(parse('Pagar mar', ctx({ languages: ['es'] })).due).toEqual({ date: '2026-10-13' })
    expect(parse('Pay mar 3', ctx({ languages: ['es'] })).due).toEqual({ date: '2027-03-03' })
  })

  it('a bare "15h" is a duration in English and a time in French', () => {
    expect(parse('Workshop 2h', ctx({ languages: ['en'] })).estimateMinutes).toBe(120)
    const fr = parse('Atelier 15h', ctx({ languages: ['fr'] }))
    expect(fr.estimateMinutes).toBeNull()
    expect(fr.due).toEqual({ date: TODAY, time: '15:00' })
  })
})

describe('parse: spec scenarios', () => {
  it('full line', () => {
    const r = parse('Meeting with Sarah #work @call p1 +30m', ctx())
    expect(r).toMatchObject({ title: 'Meeting with Sarah', projectId: 'p-work', labels: ['call'], priority: 1, estimateMinutes: 30, due: null })
    expect(r.chips.map((c) => c.kind)).toEqual(['project', 'label', 'priority', 'estimate'])
  })

  it('full line with a date and time', () => {
    const r = parse('Meeting with Sarah next Wed at 3pm #work @call p1 +30m', ctx())
    expect(r).toMatchObject({
      title: 'Meeting with Sarah', due: { date: '2026-10-14', time: '15:00' }, projectId: 'p-work', labels: ['call'], priority: 1, estimateMinutes: 30,
    })
    expect(r.chips.map((c) => c.kind)).toEqual(['due', 'project', 'label', 'priority', 'estimate'])
    expect(r.chips[0].spans).toEqual([{ start: 19, end: 27, text: 'next Wed' }, { start: 28, end: 34, text: 'at 3pm' }])
  })

  it('unknown project token stays literal', () => {
    const r = parse('Read #ambiguous', ctx())
    expect(r.title).toBe('Read #ambiguous')
    expect(r.projectId).toBeNull()
    expect(r.chips).toEqual([])
  })

  it('ambiguous prefix is not guessed', () => {
    const r = parse('Fix sink #hom', ctx())
    expect(r.title).toBe('Fix sink #hom')
    expect(r.projectId).toBeNull()
    expect(r.chips.some((c) => c.kind === 'project')).toBe(false)
  })

  it('next weekday with time', () => {
    expect(parse('Dentist next Wed at 3pm', ctx())).toMatchObject({ title: 'Dentist', due: { date: '2026-10-14', time: '15:00' } })
  })

  it('time only', () => {
    expect(parse('Call back 16:30', ctx())).toMatchObject({ title: 'Call back', due: { date: TODAY, time: '16:30' } })
  })

  it('date in the past rolls forward', () => {
    expect(parse('Renew passport 3 Feb', ctx())).toMatchObject({ title: 'Renew passport', due: { date: '2027-02-03' } })
  })

  it('German phrase', () => {
    expect(parse('Zahnarzt nächsten Mittwoch um 15 Uhr', ctx({ languages: ['de'] }))).toMatchObject({
      title: 'Zahnarzt', due: { date: '2026-10-14', time: '15:00' },
    })
  })

  it('unsupported language falls back to English and attribute tokens still work', () => {
    const r = parse('Pay rent tomorrow p2 #work', ctx({ languages: ['ja-JP'] }))
    expect(r).toMatchObject({ title: 'Pay rent', due: { date: '2026-10-10' }, priority: 2, projectId: 'p-work' })
  })

  it('chips appear as tokens are typed and disappear when text changes', () => {
    const r = parse('Buy milk tomorrow p2', ctx())
    expect(r.title).toBe('Buy milk')
    expect(r.chips.map((c) => [c.kind, c.value])).toEqual([['due', { date: '2026-10-10' }], ['priority', 2]])
    const after = parse('Buy milk tomorrow ', ctx())
    expect(after.chips.map((c) => c.kind)).toEqual(['due'])
    expect(after.priority).toBeNull()
  })

  it('explicit tokens are reported so they can override view defaults', () => {
    expect(parse('Plan trip next Monday #travel', ctx())).toMatchObject({ title: 'Plan trip', due: { date: '2026-10-12' }, projectId: 'p-travel' })
  })
})

describe('parse: escaping and dismissal', () => {
  it('quoted text is never parsed and the quotes are removed', () => {
    const r = parse('Review "may" report', ctx())
    expect(r.title).toBe('Review may report')
    expect(r.due).toBeNull()
    expect(r.chips).toEqual([])
    expect(parse('Ship "p1 #work" docs', ctx())).toMatchObject({ title: 'Ship p1 #work docs', priority: null, projectId: null })
    expect(parse('Watch "Next Friday" tomorrow', ctx())).toMatchObject({ title: 'Watch Next Friday', due: { date: '2026-10-10' } })
  })

  it('a dismissed span is kept literally', () => {
    const line = 'Review may report'
    const first = parse(line, ctx())
    expect(first.due).toEqual({ date: '2027-05-01' })
    expect(first.title).toBe('Review report')
    const r = parse(line, ctx({ dismissed: first.chips[0].spans }))
    expect(r.title).toBe('Review may report')
    expect(r.due).toBeNull()
    expect(r.chips).toEqual([])
  })

  it('a dismissal survives further typing and lapses when its text changes', () => {
    const line = 'Review may report'
    const dismissed = parse(line, ctx()).chips[0].spans
    const longer = `${line} with Ana`
    const kept = rebaseDismissed(line, longer, dismissed)
    expect(parse(longer, ctx({ dismissed: kept })).due).toBeNull()
    // Editing the dismissed word itself drops the dismissal.
    expect(parse('Review May 3 report', ctx({ dismissed })).due).toEqual({ date: '2027-05-03' })
  })

  it('a dismissal ignores spans whose text no longer matches', () => {
    const r = parse('tomorrow call', ctx({ dismissed: [{ start: 0, end: 3, text: 'may' }] }))
    expect(r.due).toEqual({ date: '2026-10-10' })
  })

  it('dismissing one chip keeps the others', () => {
    const line = 'Plan p1 trip #travel'
    const p = parse(line, ctx()).chips.find((c) => c.kind === 'priority')!
    const r = parse(line, ctx({ dismissed: p.spans }))
    expect(r).toMatchObject({ title: 'Plan p1 trip', priority: null, projectId: 'p-travel' })
  })
})

describe('parse: precedence and passthrough', () => {
  it('no match passes the line through, whitespace collapsed', () => {
    const r = parse('  Buy   oat milk  ', ctx())
    expect(r).toEqual({ title: 'Buy oat milk', due: null, deadline: null, start: null, evening: false, projectId: null, labels: [], priority: null, estimateMinutes: null, spentMinutes: null, recurrence: null, reminders: [], chips: [], unmatched: [] })
  })

  it('first match of each attribute wins; later ones stay in the title', () => {
    expect(parse('Call p1 p2', ctx())).toMatchObject({ title: 'Call p2', priority: 1 })
    expect(parse('Send tomorrow friday', ctx())).toMatchObject({ title: 'Send friday', due: { date: '2026-10-10' } })
    expect(parse('Gym #work #home', ctx())).toMatchObject({ title: 'Gym #home', projectId: 'p-work' })
    expect(parse('Read +30m +1h', ctx())).toMatchObject({ title: 'Read +1h', estimateMinutes: 30 })
  })

  it('keeps every @label, as typed, in order', () => {
    expect(parse('Ask @Call @waiting-for Bob', ctx())).toMatchObject({ title: 'Ask Bob', labels: ['Call', 'waiting-for'] })
  })

  it('does not treat email addresses or words containing tokens as attributes', () => {
    expect(parse('Mail bob@example.com about p1x', ctx())).toMatchObject({ title: 'Mail bob@example.com about p1x', labels: [], priority: null })
  })

  it('swallows a leading preposition only together with a date', () => {
    expect(parse('Pay bill by Friday', ctx()).title).toBe('Pay bill')
    expect(parse('Stand by me', ctx()).title).toBe('Stand by me')
  })
})

describe('parse: determinism', () => {
  it('same input twice yields deep-equal output', () => {
    const line = 'Meeting with Sarah next Wed at 3pm #work @call p1 +30m'
    expect(parse(line, ctx())).toEqual(parse(line, ctx()))
  })

  it('a shuffled project list yields the same result', () => {
    const line = 'Plan trip next Monday #trav @x p3 +1h30'
    const base = parse(line, ctx())
    for (const order of [[5, 4, 3, 2, 1, 0], [2, 0, 5, 1, 4, 3], [3, 1, 0, 2, 5, 4]]) {
      expect(parse(line, ctx({ projects: order.map((k) => PROJECTS[k]) }))).toEqual(base)
    }
    // Two projects with the same name resolve to the same one regardless of order.
    const dupes = [{ id: 'b', name: 'Work' }, { id: 'a', name: 'work' }]
    expect(parse('x #work', ctx({ projects: dupes })).projectId).toBe('a')
    expect(parse('x #work', ctx({ projects: [...dupes].reverse() })).projectId).toBe('a')
  })

  it('the language order changes nothing for unambiguous phrases', () => {
    const line = 'Zahnarzt morgen um 9 Uhr'
    expect(parse(line, ctx({ languages: ['de', 'fr'] }))).toEqual(parse(line, ctx({ languages: ['fr', 'de'] })))
  })
})

describe('rebaseDismissed', () => {
  const d = [{ start: 7, end: 10, text: 'may' }]

  it('keeps spans before an edit at the end', () => {
    expect(rebaseDismissed('Review may', 'Review may report', d)).toEqual(d)
  })

  it('shifts spans after an edit before them', () => {
    expect(rebaseDismissed('Review may', 'Please Review may', d)).toEqual([{ start: 14, end: 17, text: 'may' }])
  })

  it('drops spans the edit touches', () => {
    expect(rebaseDismissed('Review may', 'Review mayo', d)).toEqual([])
    expect(rebaseDismissed('Review may', 'Review ma', d)).toEqual([])
  })

  it('handles deletions before a span', () => {
    expect(rebaseDismissed('Do Review may', 'Review may', [{ start: 10, end: 13, text: 'may' }])).toEqual(d)
  })
})

describe('deadline phrases (OpenSpec deadlines 7.1)', () => {
  // Wednesday 2026-10-14 in these scenarios.
  const at = (line: string, over: Partial<ParseContext> = {}) => parse(line, ctx({ today: '2026-10-14', ...over }))

  it('deadline only', () => {
    const r = at('Send report deadline friday')
    expect(r).toMatchObject({ title: 'Send report', due: null, deadline: '2026-10-16' })
    expect(r.chips.map((c) => c.kind)).toEqual(['deadline'])
  })

  it('plan and deadline', () => {
    const r = at('Send report tomorrow deadline friday')
    expect(r).toMatchObject({ title: 'Send report', due: { date: '2026-10-15' }, deadline: '2026-10-16' })
  })

  it('German phrase', () => {
    expect(at('Bericht Frist 3. November', { languages: ['de'] })).toMatchObject({ title: 'Bericht', deadline: '2026-11-03' })
  })

  it('other languages, accents optional', () => {
    expect(at('Rapport échéance vendredi', { languages: ['fr'] }).deadline).toBe('2026-10-16')
    expect(at('Rapport echeance vendredi', { languages: ['fr'] }).deadline).toBe('2026-10-16')
    expect(at('Informe fecha límite viernes', { languages: ['es'] })).toMatchObject({ title: 'Informe', deadline: '2026-10-16' })
    expect(at('Relazione scadenza venerdì', { languages: ['it'] }).deadline).toBe('2026-10-16')
    expect(at('Relatório prazo sexta', { languages: ['pt'] }).deadline).toBe('2026-10-16')
  })

  it('without a date after it, the word stays in the title', () => {
    expect(at('Review deadline policy tomorrow')).toMatchObject({ title: 'Review deadline policy', due: { date: '2026-10-15' }, deadline: null })
  })

  it('a time after the deadline stays in the title', () => {
    expect(at('Call deadline friday 15:00')).toMatchObject({ title: 'Call 15:00', deadline: '2026-10-16', due: null })
  })

  it('only the first deadline phrase counts', () => {
    const r = at('Plan deadline friday deadline monday')
    expect(r.deadline).toBe('2026-10-16')
    expect(r.title).toContain('deadline')
  })

  it('a dismissed deadline chip keeps the words as text', () => {
    const first = at('Send report deadline friday')
    const dismissed = first.chips.find((c) => c.kind === 'deadline')!.spans
    expect(at('Send report deadline friday', { dismissed })).toMatchObject({ title: 'Send report deadline friday', deadline: null, due: null })
  })

  it('by and due keep setting the due date', () => {
    expect(at('Pay rent by friday')).toMatchObject({ title: 'Pay rent', due: { date: '2026-10-16' }, deadline: null })
    expect(at('Pay rent due friday')).toMatchObject({ due: { date: '2026-10-16' }, deadline: null })
  })
})

describe('someday and evening phrases (OpenSpec someday-and-evening 5.1)', () => {
  const at = (line: string, over: Partial<ParseContext> = {}) => parse(line, ctx({ today: '2026-10-14', ...over }))

  it('park from quick add', () => {
    const r = at('Learn to sail someday @hobby')
    expect(r).toMatchObject({ title: 'Learn to sail', start: 'someday', due: null, labels: ['hobby'] })
    expect(r.chips.map((c) => c.kind)).toContain('someday')
  })

  it('someday with a date stays literal', () => {
    expect(at('Plan someday trip friday')).toMatchObject({ title: 'Plan someday trip', start: null, due: { date: '2026-10-16' } })
  })

  it('tonight with a time', () => {
    const r = at('Call Ana tonight at 8pm')
    expect(r).toMatchObject({ title: 'Call Ana', due: { date: '2026-10-14', time: '20:00' }, evening: true })
    expect(r.chips.map((c) => c.kind)).toEqual(expect.arrayContaining(['due', 'evening']))
  })

  it('tonight alone still resolves to today, and this evening works too', () => {
    expect(at('Cook tonight')).toMatchObject({ title: 'Cook', due: { date: '2026-10-14' }, evening: true })
    expect(at('Cook this evening')).toMatchObject({ title: 'Cook', due: { date: '2026-10-14' }, evening: true })
  })

  it('Italian evening and the other languages', () => {
    expect(at('Chiama Ana stasera', { languages: ['it'] })).toMatchObject({ title: 'Chiama Ana', due: { date: '2026-10-14' }, evening: true })
    expect(at('Segeln lernen irgendwann', { languages: ['de'] })).toMatchObject({ title: 'Segeln lernen', start: 'someday' })
    expect(at('Aprender a navegar algun dia', { languages: ['es'] })).toMatchObject({ title: 'Aprender a navegar', start: 'someday' })
  })

  it('a dismissed someday chip keeps the word', () => {
    const first = at('Learn to sail someday')
    const dismissed = first.chips.find((c) => c.kind === 'someday')!.spans
    expect(at('Learn to sail someday', { dismissed })).toMatchObject({ title: 'Learn to sail someday', start: null })
  })
})

describe('ordinal weekdays (OpenSpec quick-add-nth-weekday 2.4)', () => {
  it('a dismissed ordinal weekday keeps its text in the title and does not come back', () => {
    const line = 'Review notes from last Friday'
    const first = parse(line, ctx())
    expect(first).toMatchObject({ title: 'Review notes from', due: { date: '2026-10-30' } })
    const due = first.chips.find((c) => c.kind === 'due')!
    expect(due.spans.map((s) => s.text)).toEqual(['last Friday'])
    const r = parse(line, ctx({ dismissed: due.spans }))
    expect(r.title).toBe(line)
    expect(r.due).toBeNull()
    expect(r.chips).toEqual([])
    // Further typing keeps the dismissal while that text is unchanged.
    const longer = `${line} with Ana`
    expect(parse(longer, ctx({ dismissed: rebaseDismissed(line, longer, due.spans) })).due).toBeNull()
  })

  it('a count before a weekday is a literal match: no chip, the line as typed', () => {
    const r = parse('Board every 2 Mondays', ctx())
    expect(r.chips).toEqual([])
    expect(r).toMatchObject({ title: 'Board every 2 Mondays', due: null, recurrence: null })
    expect(parse('Reunión cada 2 lunes', ctx({ languages: ['es'] })).chips).toEqual([])
    expect(parse('Treffen alle 2 Montage', ctx({ languages: ['de', 'it'] })).chips).toEqual([])
  })

  it('resolves against the reference date it is given, which callers set to the logical today', () => {
    // Tuesday 13 October 2026 at 02:00 with a 04:00 day start is still Monday the 12th.
    const today = logicalToday(240, new Date(2026, 9, 13, 2, 0).getTime())
    expect(today).toBe('2026-10-12')
    expect(parse('Dentist second Monday', ctx({ today })).due).toEqual({ date: '2026-10-12' })
    expect(parse('Dentist second Monday', ctx({ today: '2026-10-13' })).due).toEqual({ date: '2026-11-09' })
  })

  it('Portuguese weekday ordinals are listed only where they are weekday names', () => {
    for (const v of Object.values(VOCABULARIES)) {
      for (const word of Object.keys(v.ordinalsBeforeWeekday)) {
        expect(v.weekdays.flat().map(normalize), v.code).toContain(normalize(word))
      }
      for (const p of [...v.ordinalArticles, ...v.ordinalOf, ...v.ofMonthWords]) expect(p.trim(), v.code).not.toBe('')
    }
  })
})

// Smart title tokens (OpenSpec change smart-title-tokens, design D2 and D4).
describe('project paths and unmatched tokens', () => {
  const projects = [
    { id: 'p-work', name: 'Work' }, { id: 'p-home', name: 'Home' }, { id: 'p-homework', name: 'Homework' },
    { id: 'p-work-docs', name: 'Docs', parent_id: 'p-work' }, { id: 'p-home-docs', name: 'Docs', parent_id: 'p-home' },
    { id: 'p-reno', name: 'Home renovation' },
  ]
  const at = (line: string) => parse(line, { today: '2026-10-09', languages: ['en'], projects })

  it('#Parent/Child picks the child under that parent; a wrong parent matches nothing', () => {
    expect(at('Write #Home/Docs').projectId).toBe('p-home-docs')
    expect(at('Write #work/docs').projectId).toBe('p-work-docs')
    expect(at('Write #Garden/Docs')).toMatchObject({ projectId: null, title: 'Write #Garden/Docs' })
  })

  it('a name with spaces is matched by the token a suggestion inserts', () => {
    expect(at('Paint #HomeRenovation').projectId).toBe('p-reno')
  })

  it('explains a #token that names no project, or several', () => {
    expect(at('Rake leaves #gardn').unmatched).toEqual([{ span: { start: 12, end: 18, text: '#gardn' }, reason: 'none' }])
    expect(at('Fix sink #hom').unmatched).toEqual([expect.objectContaining({ reason: 'ambiguous', count: 3 })])
    expect(at('Fix sink #home').unmatched).toEqual([])
  })
})
