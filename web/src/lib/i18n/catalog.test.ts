// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __setLoaders, activeLanguage, loadLanguage, MIRROR_KEY, T, t } from './catalog'

const de = {
  'Save': 'Speichern',
  'Open|verb': 'Öffnen',
  'Hello {name}': 'Hallo {name}',
  '{n, plural, one {# task} other {# tasks}}': '{n, plural, one {# Aufgabe} other {# Aufgaben}}',
  'Press <b>Save</b> to keep it': 'Drücke <b>Speichern</b>, um es zu behalten',
}

beforeEach(async () => {
  __setLoaders({ de: async () => ({ default: de }), broken: async () => Promise.reject(new Error('offline')) })
  await loadLanguage('en')
})

describe('catalog (app-localization D2, D3)', () => {
  it('English passes through and a missing entry falls back to the source', async () => {
    expect(t('Save')).toBe('Save')
    await loadLanguage('de', 'de-CH')
    expect(t('Save')).toBe('Speichern')
    expect(t('Not translated yet')).toBe('Not translated yet')
    expect(t('Hello {name}', { name: 'Ada' })).toBe('Hallo Ada')
    expect(t('{n, plural, one {# task} other {# tasks}}', { n: 2 })).toBe('2 Aufgaben')
  })

  it('a context key disambiguates', async () => {
    await loadLanguage('de')
    expect(t('Open', { context: 'verb' })).toBe('Öffnen')
    expect(t('Open')).toBe('Open')
  })

  it('rich messages render tags as one unit', async () => {
    await loadLanguage('de')
    const html = renderToStaticMarkup(createElement(T, { b: (c: unknown) => createElement('strong', null, c as never), children: 'Press <b>Save</b> to keep it' }))
    expect(html).toBe('Drücke <strong>Speichern</strong>, um es zu behalten')
  })

  it('sets <html lang> and the mirror before the load resolves; a failed load keeps the language', async () => {
    const pending = loadLanguage('de', 'de-CH')
    await pending
    expect(document.documentElement.lang).toBe('de-CH')
    expect(JSON.parse(localStorage.getItem(MIRROR_KEY)!)).toEqual({ lang: 'de', locale: 'de-CH' })
    await expect(loadLanguage('broken')).rejects.toThrow('offline')
    expect(activeLanguage()).toBe('de')
    expect(t('Save')).toBe('Speichern')
  })
})
