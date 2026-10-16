// @vitest-environment happy-dom
// The message layer, locale resolution, server errors and dates in a chosen
// language (OpenSpec change app-localization, designs D2–D6).
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../locales/messages.json'
import { SHIPPED } from '../../locales'
import { formatDate, formatTime, setDateLocale, setDateTime } from '../dates'
import { DEFAULT_QUICK_ADD_SETTINGS, resolveLanguages } from '../nlp/settings'
import { recognitionLanguage, recognitionTag } from '../voice/settings'
import {
  applyLanguagePreference, currentLanguage, currentLocale, errorMessage, formatList, intlLocale, mirroredPreference,
  preferredLanguages, resolveLanguage, t,
} from '.'
import { fetchCatalog } from './catalog'
import { ERROR_MESSAGES } from './errors'
import serverCodes from './server-error-codes.json'

afterEach(async () => {
  await applyLanguagePreference('en', ['en-US'])
  setDateLocale(undefined)
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  vi.restoreAllMocks()
})

describe('messages', () => {
  it('English needs no catalog: the source text is the message', () => {
    expect(currentLanguage()).toBe('en')
    expect(t('Inbox')).toBe('Inbox')
    expect(t('Delete {name}?', { name: 'Milk' })).toBe('Delete Milk?')
    expect(t('{n, plural, one {# task} other {# tasks}}', { n: 1 })).toBe('1 task')
  })

  it('a chosen language loads its catalog from a lazy chunk, without the network (offline)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await applyLanguagePreference('de', ['en-US'])
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(currentLanguage()).toBe('de')
    expect(document.documentElement.lang).toBe('de')
    expect(t('Inbox')).toBe('Eingang')
    expect(t('{n, plural, one {# task} other {# tasks}}', { n: 3 })).toBe('3 Aufgaben')
    expect(mirroredPreference()).toBe('de')
  })

  it('context keys, rich text, select and fallback to the English source', async () => {
    await applyLanguagePreference('fr', ['en-US'])
    expect(t('on', { context: 'comment' })).toBe('sur')
    expect(t('on')).toBe('activé')
    const html = renderToStaticMarkup(createElement('p', null, t.rich('Signed in as <b>{name}</b>.', { name: 'Ana', b: (s) => createElement('b', null, s) })))
    expect(html).toBe('<p>Connecté en tant que <b>Ana</b>.</p>')
    expect(t('{entity, select, task {a task} project {a project} label {a label} section {a section} comment {a comment} view {a view} field {a field} reminder {a reminder} other {an item}}', { entity: 'label' })).toBe('une étiquette')
    expect(t('A message no catalog has')).toBe('A message no catalog has')
  })

  it('lists use the language’s own pattern', async () => {
    expect(formatList(['a', 'b', 'c'])).toBe('a, b and c')
    await applyLanguagePreference('es', ['en-US'])
    expect(formatList(['a', 'b', 'c'])).toBe('a, b y c')
  })

  it('every shipped catalog has every source message', async () => {
    const ids = Object.keys(messages)
    for (const { code } of SHIPPED) {
      if (code === 'en') continue
      const catalog = await fetchCatalog(code)
      expect(ids.filter((id) => !(id in catalog)), code).toEqual([])
      expect(Object.keys(catalog).filter((id) => !(id in messages)), code).toEqual([])
    }
  })
})

describe('locale resolution (D4)', () => {
  it('system follows the first shipped browser language and keeps its region', () => {
    expect(resolveLanguage('system', ['de-CH', 'en'])).toBe('de')
    expect(intlLocale('system', ['de-CH', 'en'])).toBe('de-CH')
  })
  it('a chosen language takes the browser’s region only when it is the same language', () => {
    expect(intlLocale('de', ['en-US', 'de-AT'])).toBe('de-AT')
    expect(intlLocale('de', ['en-US'])).toBe('de')
    expect(resolveLanguage('de', ['en-US'])).toBe('de')
  })
  it('a browser language without a catalog falls back to English', () => {
    expect(resolveLanguage('system', ['ja'])).toBe('en')
    expect(resolveLanguage('xx', ['ja'])).toBe('en')
  })
})

describe('quick add and voice follow the interface language (D5)', () => {
  it('Spanish comes first for quick add even with an English browser', () => {
    const langs = resolveLanguages(DEFAULT_QUICK_ADD_SETTINGS, preferredLanguages('es', ['en-US']))
    expect(langs[0]).toBe('es')
    expect(langs).toContain('en')
  })
  it('a device’s own quick-add list still wins', () => {
    const langs = resolveLanguages({ ...DEFAULT_QUICK_ADD_SETTINGS, languages: ['it'] }, preferredLanguages('es', ['en-US']))
    expect(langs[0]).toBe('it')
  })
  it('dictation listens in Spanish', () => {
    const browser = preferredLanguages('es', ['en-US'])
    const langs = resolveLanguages(DEFAULT_QUICK_ADD_SETTINGS, browser)
    expect(recognitionTag(recognitionLanguage({ enabled: true, lang: null }, langs), browser)).toMatch(/^es/)
  })
  it('with system the browser order is unchanged', () => {
    expect(preferredLanguages('system', ['en-US', 'de'])).toEqual(['en-US', 'de'])
  })
})

describe('server errors by code (D6)', () => {
  it('every code the server sends has a message', () => {
    expect((serverCodes as string[]).filter((code) => !(code in ERROR_MESSAGES))).toEqual([])
  })
  it('English shows the server’s message as received', () => {
    expect(errorMessage('invalid_credentials', 'Wrong email or password.')).toBe('Wrong email or password.')
  })
  it('another language shows the translation, and the server’s text for an unknown code', async () => {
    await applyLanguagePreference('de', ['en-US'])
    expect(errorMessage('invalid_credentials', 'Wrong email or password.')).not.toBe('Wrong email or password.')
    expect(errorMessage('invalid_credentials', 'Wrong email or password.')).toMatch(/Passwort/)
    expect(errorMessage('a_code_from_a_newer_server', 'Something new.')).toBe('Something new.')
  })
})

describe('dates in the interface language (D4)', () => {
  it('German with an en-US browser: German order, 24-hour clock and German names', async () => {
    await applyLanguagePreference('de', ['en-US'])
    setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
    expect(currentLocale()).toBe('de')
    expect(formatDate('2026-10-14', 'numeric', undefined, '2026-01-01')).toBe('14.10.2026')
    expect(formatDate('2026-10-12', 'full', undefined, '2026-01-01')).toMatch(/^Montag/)
  })
  it('Swiss German keeps its region', async () => {
    await applyLanguagePreference('system', ['de-CH'])
    expect(currentLocale()).toBe('de-CH')
  })
  it('French writes its own short month, Spanish its own day period', async () => {
    await applyLanguagePreference('fr', ['en-US'])
    setDateTime({ date_format: 'day-month', time_format: 'system', week_start: 'system' })
    expect(formatDate('2026-11-03', 'compact', undefined, '2026-01-01')).toBe('3 nov.')
    expect(formatDate('2026-11-03', 'long', undefined, '2026-01-01')).toBe('mar. 3 nov.')
    await applyLanguagePreference('es', ['en-US'])
    setDateTime({ date_format: 'system', time_format: '12h', week_start: 'system' })
    expect(formatTime('15:00')).toMatch(/^3:00\sp\.\s?m\.$/)
  })
})
