import { describe, expect, it } from 'vitest'
import { parse } from '../nlp'
import { normalizeSpoken, SPOKEN_TABLES } from './spoken'

const projects = [
  { id: 'home', name: 'Home' },
  { id: 'ho', name: 'Home Office' },
  { id: 'gone', name: 'Garden', archived: true },
]
const labels = [{ id: 'l1', name: 'Call', color: '#f00', position: 0, created_at: 0, deleted_at: null }]
const n = (text: string, langs: string[] = ['en']) => normalizeSpoken(text, langs, { projects, labels })

describe('normalizeSpoken (English)', () => {
  it.each([
    ['renew insurance hashtag home priority two', 'renew insurance #home p2'],
    ['standup at nine thirty am', 'standup at 9:30am'],
    ['call the dentist tomorrow at nine', 'call the dentist tomorrow at 9'],
    ['meeting at three pm', 'meeting at 3pm'],
    ['meeting three p.m.', 'meeting 3pm'],
    ['lunch at twelve fifteen', 'lunch at 12:15'],
    ['wake up at six oh five am', 'wake up at 6:05am'],
    ['dinner at seven o\'clock', 'dinner at 7 o\'clock'],
    ['report at 9 30 am', 'report at 9:30am'],
    ['report at 3 pm', 'report at 3pm'],
    ['write report thirty minutes', 'write report +30m'],
    ['write report for forty-five minutes', 'write report +45m'],
    ['deep work one hour', 'deep work +60m'],
    ['deep work an hour and thirty minutes', 'deep work +90m'],
    ['deep work for two hours fifteen minutes', 'deep work +135m'],
    ['ping Ana in two hours', 'ping Ana in 2 hours'],
    ['renew passport in three weeks', 'renew passport in 3 weeks'],
    ['label errands buy stamps', '@errands buy stamps'],
    ['phone mum label call', 'phone mum @Call'],
    ['phone mum at call', 'phone mum @Call'],
    ['set up printer hashtag home office', 'set up printer #homeoffice'],
    ['plan move project home office', 'plan move #homeoffice'],
    ['buy seeds project garden', 'buy seeds project garden'], // archived project: untouched
    ['hashtag fun quiz night', '#fun quiz night'],
    ['email Bob # work', 'email Bob #work'],
    ['Call the dentist tomorrow at nine.', 'Call the dentist tomorrow at 9'],
  ])('%s → %s', (spoken, typed) => {
    expect(n(spoken)).toBe(typed)
  })

  it.each([
    'buy two apples',
    'read chapter nine',
    'finish project report',
    'meet at the office',
    'priority seven review',
  ])('leaves %s unchanged', (text) => {
    expect(n(text)).toBe(text)
  })

  it('is deterministic and idempotent on typed text', () => {
    const typed = 'renew insurance #home p2 tomorrow at 9:30am +30m'
    expect(n(typed)).toBe(typed)
    expect(n('standup at nine thirty am')).toBe(n('standup at nine thirty am'))
  })
})

describe('normalizeSpoken (other languages)', () => {
  it.each([
    [['de'], 'Zahnarzt anrufen morgen um neun Uhr dreißig', 'Zahnarzt anrufen morgen um 9:30'],
    [['de'], 'Steuer machen hashtag home priorität eins', 'Steuer machen #home p1'],
    [['de'], 'Training einundzwanzig Uhr', 'Training 21 Uhr'],
    [['de'], 'lesen für zwanzig Minuten', 'lesen +20m'],
    [['fr'], 'appeler maman à neuf heures', 'appeler maman à 9 heures'],
    [['fr'], 'courir pendant vingt-cinq minutes', 'courir +25m'],
    [['fr'], 'payer loyer étiquette maison priorité trois', 'payer loyer @maison p3'],
    [['it'], 'chiamare Luca alle nove', 'chiamare Luca alle 9'],
    [['it'], 'palestra per quarantacinque minuti', 'palestra +45m'],
    [['it'], 'bollette hashtag casa priorità due', 'bollette #casa p2'],
    [['es'], 'llamar a Ana a las diez', 'llamar a Ana a las 10'],
    [['es'], 'leer durante veinticinco minutos', 'leer +25m'],
    [['es'], 'leer durante treinta y cinco minutos', 'leer +35m'],
    [['pt'], 'ligar para o João às onze', 'ligar para o João às 11'],
    [['pt'], 'caminhar durante trinta e cinco minutos', 'caminhar +35m'],
    [['pt'], 'pagar contas etiqueta casa prioridade quatro', 'pagar contas @casa p4'],
  ])('%s: %s → %s', (langs, spoken, typed) => {
    expect(n(spoken, langs)).toBe(typed)
  })

  it('applies English cues alongside another language, as the parser does', () => {
    expect(n('Steuer hashtag home priority two', ['de'])).toBe('Steuer #home p2')
  })
})

describe('spoken tables', () => {
  it('every language table defines the same keys', () => {
    const keys = (o: object) => Object.keys(o).sort()
    const reference = keys(SPOKEN_TABLES.en)
    for (const [code, table] of Object.entries(SPOKEN_TABLES)) {
      expect(keys(table), code).toEqual(reference)
      expect(table.code).toBe(code)
      for (const [k, v] of Object.entries(table)) if (Array.isArray(v)) expect(v.length > 0 || k === 'labelAt' || k === 'minuteZero', `${code}.${k}`).toBe(true)
    }
  })

  it('every table spells all numbers 0–59 exactly once per value at least', () => {
    for (const [code, table] of Object.entries(SPOKEN_TABLES)) {
      const values = new Set(Object.values(table.numbers))
      for (let i = 0; i <= 59; i++) expect(values.has(i), `${code} ${i}`).toBe(true)
    }
  })
})

describe('normalised transcripts parse like typed text', () => {
  const ctx = { today: '2026-10-10', now: '08:00', languages: ['en'], dayMonthOrder: 'MD' as const, projects }
  it('spoken project and priority', () => {
    const r = parse(n('renew insurance hashtag home priority two'), ctx)
    expect(r.title).toBe('renew insurance')
    expect(r.projectId).toBe('home')
    expect(r.priority).toBe(2)
  })
  it('spoken time', () => {
    const r = parse(n('standup at nine thirty am'), ctx)
    expect(r.title).toBe('standup')
    expect(r.due).toEqual({ date: '2026-10-10', time: '09:30' })
  })
  it('dictated scheduled task', () => {
    const r = parse(n('call the dentist tomorrow at nine'), ctx)
    expect(r.title).toBe('call the dentist')
    expect(r.due).toEqual({ date: '2026-10-11', time: '09:00' })
  })
  it('German date phrases', () => {
    const r = parse(n('Zahnarzt anrufen morgen um neun Uhr dreißig', ['de']), { ...ctx, languages: ['de', 'en'], dayMonthOrder: 'DM' })
    expect(r.title).toBe('Zahnarzt anrufen')
    expect(r.due).toEqual({ date: '2026-10-11', time: '09:30' })
  })
})
