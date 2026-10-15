import { describe, expect, it } from 'vitest'
import { preferredLanguages, resolveLanguage, resolveLocale } from './locale'

describe('locale resolution (app-localization D4, D5)', () => {
  it('keeps the browser region for the chosen language', () => {
    expect(resolveLocale('de', ['de-CH', 'en'])).toBe('de-CH')
    expect(resolveLocale('de', ['en-US'])).toBe('de')
    expect(resolveLocale('system', ['en-US'])).toBe('en-US')
  })

  it('system with an unsupported browser language falls back to English', () => {
    expect(resolveLanguage('system', ['de', 'fr'], ['ja-JP', 'ko'])).toBe('en')
    expect(resolveLanguage('system', ['de', 'fr'], ['ja', 'fr-CA'])).toBe('fr')
    expect(resolveLanguage('system', [], ['de-DE'])).toBe('en')
    expect(resolveLanguage('it', ['de'], ['en'])).toBe('it')
  })

  it('puts the chosen language first for quick add and voice', () => {
    expect(preferredLanguages('es', ['en-US', 'es-MX'])).toEqual(['es-MX', 'en-US'])
    expect(preferredLanguages('es', ['en-US'])).toEqual(['es', 'en-US'])
    expect(preferredLanguages('system', ['en-US', 'de'])).toEqual(['en-US', 'de'])
  })
})
