// The plugin's strings follow Obsidian's language (obsidian-plugin task 6.1);
// completeness of the catalogues is checked by `make i18n-check`.
import { afterEach, describe, expect, it } from 'vitest'
import { pickLanguage, setLanguage, tr } from '../src/strings'

afterEach(() => setLanguage('en'))

describe('strings', () => {
  it('picks a shipped language from Obsidian’s code, else English', () => {
    expect(pickLanguage('de')).toBe('de')
    expect(pickLanguage('pt-BR')).toBe('pt')
    expect(pickLanguage('zh-TW')).toBe('en')
    expect(pickLanguage(undefined)).toBe('en')
  })

  it('translates, with plurals in the language', () => {
    setLanguage('de')
    expect(tr('Undo')).toBe('Rückgängig')
    expect(tr('{n, plural, one {# task sent to OpenTodo} other {# tasks sent to OpenTodo}}', { n: 2 })).toBe('2 Aufgaben an OpenTodo gesendet')
    setLanguage('fr')
    expect(tr('Send line to OpenTodo')).not.toBe('Send line to OpenTodo')
  })
})
