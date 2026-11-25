// node --test scripts/i18n/shell.test.mjs (run by `make i18n-check`)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkShellCatalog, placeholders, readAppShortcutsCatalog, specifiers } from './shell.mjs'

const langs = ['de', 'es']
const unit = (value) => ({ stringUnit: { state: 'translated', value } })
const catalog = (strings) => ({ sourceLanguage: 'en', version: '1.0', strings })

test('a complete catalog passes', () => {
  const de = catalog({
    'Server address': { localizations: { de: unit('Serveradresse'), es: unit('Dirección del servidor') } },
    '%lld today': { localizations: { de: unit('%lld heute'), es: unit('%lld hoy') } },
  })
  assert.deepEqual(checkShellCatalog(de, langs), [])
})

test('a missing translation, an untranslated one and an empty one are named', () => {
  const de = catalog({
    'Connect': { localizations: { de: unit('Verbinden') } },
    'Try again': { localizations: { de: { stringUnit: { state: 'needs_review', value: 'Erneut versuchen' } }, es: unit('Reintentar') } },
    'Today': { localizations: { de: unit('  '), es: unit('Hoy') } },
  })
  assert.deepEqual(checkShellCatalog(de, langs), [
    'shell es: missing "Connect"',
    'shell de: "Try again" is needs_review, not translated',
    'shell de: "Today" is empty',
  ])
})

test('a dropped or altered format specifier is a problem', () => {
  const de = catalog({
    '%lld today': { localizations: { de: unit('heute'), es: unit('%lld hoy') } },
    '%@ · %@': { localizations: { de: unit('%@'), es: unit('%@ · %@') } },
  })
  assert.deepEqual(checkShellCatalog(de, langs), [
    'shell de: "%lld today" uses no specifier, the source uses %lld',
    'shell de: "%@ · %@" uses %@, the source uses %@ %@',
  ])
})

test('a language the web app does not ship is a problem', () => {
  const de = catalog({ Connect: { localizations: { de: unit('Verbinden'), es: unit('Conectar'), pl: unit('Połącz') } } })
  assert.deepEqual(checkShellCatalog(de, langs), ['shell pl: "Connect" is translated into a language the web app does not ship'])
})

test('specifiers keeps counts and order but drops the escaped percent', () => {
  assert.deepEqual(specifiers('100%% of %lld at %1$@'), ['%1$@', '%lld'])
  assert.deepEqual(specifiers('no format here'), [])
})

// apple-shortcuts D4: the Siri phrases' catalog, where a language may give several phrases.
const phrases = (localizations) => catalog({ 'Open Today in ${applicationName}': { localizations } })
const set = (...values) => ({ stringSet: { state: 'translated', values } })
const siri = { label: 'shortcuts', appName: true }

test('Siri phrases: several per language, each naming the app', () => {
  const c = phrases({ de: set('Öffne Heute in ${applicationName}', 'Heute in ${applicationName}'), es: set('Abre Hoy en ${applicationName}') })
  assert.deepEqual(checkShellCatalog(c, langs, [], siri), [])
})

test('Siri phrases: a phrase without the app, an empty set and a source without the app are named', () => {
  assert.deepEqual(checkShellCatalog(phrases({ de: set('Öffne Heute'), es: set() }), langs, [], siri), [
    'shortcuts de: "Öffne Heute" uses no placeholder, the source uses ${applicationName}',
    'shortcuts es: "Open Today in ${applicationName}" is empty',
  ])
  const bare = catalog({ 'Open Today': { localizations: { de: set('Heute'), es: set('Hoy') } } })
  assert.deepEqual(checkShellCatalog(bare, langs, [], siri), ['shortcuts: "Open Today" does not name the app with ${applicationName}'])
})

test('placeholders finds the App Shortcut parameters', () => {
  assert.deepEqual(placeholders('Add ${text} in ${applicationName}'), ['${applicationName}', '${text}'])
  assert.deepEqual(placeholders('100% of %@'), [])
})

test('every phrase of the iOS app names the app', () => {
  const c = readAppShortcutsCatalog()
  assert.ok(Object.keys(c.strings).length > 0)
  for (const [key, entry] of Object.entries(c.strings)) {
    assert.ok(key.includes('${applicationName}'), key)
    for (const [lang, l] of Object.entries(entry.localizations)) {
      for (const v of l.stringSet.values) assert.ok(v.includes('${applicationName}'), `${lang}: ${v}`)
    }
  }
})
