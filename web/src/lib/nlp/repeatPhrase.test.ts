import { describe, expect, it } from 'vitest'
import { ruleFromText } from './repeatPhrase'

const at = (languages: string[]) => ({ languages, today: '2026-11-18' })

describe('ruleFromText (repeat-field-language)', () => {
  it('reads the stored grammar in every language, in its canonical form', () => {
    for (const languages of [['en'], ['nl'], ['de', 'fr'], ['ja']]) {
      expect(ruleFromText('every friday', at(languages))).toBe('every friday')
      expect(ruleFromText('Every first weekday', at(languages))).toBe('every 1st weekday')
      expect(ruleFromText('  every week on tue  ', at(languages))).toBe('every tuesday')
    }
  })

  it('reads the phrases quick add reads in the active languages', () => {
    const cases: [string, string, string][] = [
      ['nl', 'elke vrijdag', 'every friday'],
      ['nl', 'elke 3 dagen na voltooiing', 'every 3 days after completion'],
      ['de', 'jeden Montag', 'every monday'],
      ['de', 'jeden zweiten Dienstag im Monat', 'every 2nd tuesday'],
      ['fr', 'tous les 3 jours après achèvement', 'every 3 days after completion'],
      ['it', 'ogni lunedì e giovedì', 'every monday, thursday'],
      ['es', 'cada 2 semanas', 'every 2 weeks'],
      ['pt', 'toda sexta-feira', 'every friday'],
      ['pl', 'co tydzień', 'every week'],
      ['tr', 'her gün', 'every day'],
      ['en', 'daily', 'every day'],
      ['en', 'every other week', 'every 2 weeks'],
    ]
    for (const [language, text, rule] of cases) expect(ruleFromText(text, at([language])), `${language}: ${text}`).toBe(rule)
  })

  it('reads an end date and a count', () => {
    expect(ruleFromText('jede Woche bis 31.12.2026', at(['de']))).toBe('every week until 2026-12-31')
    expect(ruleFromText('elke week 10 keer', at(['nl']))).toBe('every week for 10 times')
  })

  it('takes only a text that is a rule and nothing else', () => {
    expect(ruleFromText('', at(['nl']))).toBeNull()
    expect(ruleFromText('elke blursdag', at(['nl']))).toBeNull()
    expect(ruleFromText('Filter vervangen elke vrijdag', at(['nl']))).toBeNull()
    expect(ruleFromText('elke vrijdag filter', at(['nl']))).toBeNull()
    // A start date belongs to the due date, not to the rule.
    expect(ruleFromText('every day from monday', at(['en']))).toBeNull()
    // A language that is not active is not read.
    expect(ruleFromText('elke vrijdag', at(['de']))).toBeNull()
    // A phrase the grammar cannot express stays text.
    expect(ruleFromText('every 2 mondays', at(['en']))).toBeNull()
  })
})
