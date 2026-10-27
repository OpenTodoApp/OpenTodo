// node --test scripts/i18n/shell.test.mjs (run by `make i18n-check`)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkShellCatalog, specifiers } from './shell.mjs'

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
