import { afterEach, describe, expect, it } from 'vitest'
import { applyLanguagePreference } from './i18n'
import { parseRule } from './recurrence'
import { ruleWords } from './recurrenceWords'
import vectors from './recurrence.vectors.json'

afterEach(() => applyLanguagePreference('en', ['en-US']))

describe('ruleWords (repeat-rule-words)', () => {
  it('reads every kind of rule in English', () => {
    const cases: [string, string][] = [
      ['every day', 'Every day'],
      ['every 3 days', 'Every 3 days'],
      ['every week', 'Every week'],
      ['every 2 weeks', 'Every 2 weeks'],
      ['every month', 'Every month'],
      ['every 3 months', 'Every 3 months'],
      ['every year', 'Every year'],
      ['every 2 years', 'Every 2 years'],
      ['every weekday', 'Every weekday'],
      ['every thursday', 'Every week on Thursday'],
      ['every mon, wed, fri', 'Every week on Monday, Wednesday and Friday'],
      ['every 2 weeks on saturday', 'Every 2 weeks on Saturday'],
      ['every 15th', 'Every month on day 15'],
      ['every last day', 'Every month on the last day'],
      ['every first weekday', 'Every month on the first weekday'],
      ['every last weekday', 'Every month on the last weekday'],
      ['every 2nd tuesday', 'Every month on the second Tuesday'],
      ['every last sunday of march', 'Every year on the last Sunday of March'],
      ['every 3 days after completion', 'Every 3 days after completion'],
      ['every week for 10 times', 'Every week, 10 times'],
      ['every month for 1 time', 'Every month, 1 time'],
    ]
    for (const [rule, words] of cases) expect(ruleWords(rule), rule).toBe(words)
  })

  it('reads inline after other words, with a small first letter', async () => {
    expect(ruleWords('every 2nd tuesday', true)).toBe('every month on the second Tuesday')
    await applyLanguagePreference('de', ['de'])
    expect(ruleWords('every 2 weeks on saturday', true)).toBe('alle 2 Wochen am Samstag')
  })

  it('names the end date', () => {
    expect(ruleWords('every 1st weekday until 2027-03-31')).toMatch(/^Every month on the first weekday until .*31/)
  })

  it('reads in the interface language, with the ordinal agreeing with the weekday', async () => {
    const cases: Record<string, [string, string][]> = {
      nl: [['every 3 days after completion', 'Om de 3 dagen na voltooiing'], ['every friday', 'Elke week op vrijdag']],
      de: [['every 2 weeks on saturday', 'Alle 2 Wochen am Samstag'], ['every 2nd tuesday', 'Jeden Monat am zweiten Dienstag']],
      it: [['every last sunday', 'Ogni mese l’ultima domenica'], ['every 1st monday', 'Ogni mese il primo lunedì'], ['every mon, wed', 'Ogni settimana di lunedì e mercoledì']],
      pt: [['every 2nd friday', 'Todo mês na segunda sexta-feira'], ['every last saturday', 'Todo mês no último sábado']],
      pl: [['every 5 days', 'Co 5 dni'], ['every 2 weeks', 'Co 2 tygodnie'], ['every 3rd wednesday', 'Co miesiąc w trzecią środę'], ['every week for 5 times', 'Co tydzień, 5 razy']],
      ru: [['every 21 days', 'Каждый 21 день'], ['every 2nd tuesday', 'Каждый месяц во второй вторник'], ['every last sunday', 'Каждый месяц в последнее воскресенье']],
      tr: [['every 3 months', '3 ayda bir'], ['every last friday', 'Her ayın son cuması']],
      zh: [['every 3 days after completion', '完成后每 3 天'], ['every 2nd tuesday', '每月第二个星期二']],
    }
    for (const [language, rules] of Object.entries(cases)) {
      await applyLanguagePreference(language as 'nl', [language])
      for (const [rule, words] of rules) expect(ruleWords(rule), `${language}: ${rule}`).toBe(words)
    }
  })

  it('shows a rule it cannot read as stored', () => {
    expect(ruleWords('every blursday')).toBe('every blursday')
  })

  it('has words for every rule of the shared vectors', () => {
    const rules = new Set<string>()
    JSON.stringify(vectors, (_k, v: unknown) => { if (typeof v === 'string' && parseRule(v).ok) rules.add(v); return v })
    expect(rules.size).toBeGreaterThan(20)
    for (const rule of rules) {
      const words = ruleWords(rule)
      expect(words, rule).not.toBe('')
      expect(words, rule).not.toMatch(/[{}]|undefined/)
    }
  })
})
