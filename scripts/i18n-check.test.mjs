// node --test scripts/i18n-check.test.mjs (run by `make i18n-check`)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkCatalog, loadFormat } from './i18n-check.mjs'

const fmt = await loadFormat()
const messages = ['Delete {name}?', '{n, plural, one {# task} other {# tasks}}', 'Read the <a>guide</a>', 'Settings', 'Security', 'Open Settings → Security']
const de = {
  'Delete {name}?': '{name} löschen?',
  '{n, plural, one {# task} other {# tasks}}': '{n, plural, one {# Aufgabe} other {# Aufgaben}}',
  'Read the <a>guide</a>': 'Lies die <a>Anleitung</a>',
  Settings: 'Einstellungen',
  Security: 'Sicherheit',
  'Open Settings → Security': 'Öffne Einstellungen → Sicherheit',
}

test('a complete catalog passes', () => {
  assert.deepEqual(checkCatalog('de', de, messages, fmt), [])
})

test('a missing and an unused entry are named with the language', () => {
  const { 'Delete {name}?': _gone, ...rest } = de
  const problems = checkCatalog('de', { ...rest, Old: 'Alt' }, messages, fmt)
  assert.deepEqual(problems, ['de: missing "Delete {name}?"', 'de: unused "Old"'])
})

test('a dropped placeholder fails and names the entry', () => {
  const problems = checkCatalog('fr', { ...de, 'Delete {name}?': 'Supprimer ?' }, messages, fmt)
  assert.ok(problems.some((p) => p.startsWith('fr: placeholders of "Delete {name}?"')), problems.join('\n'))
})

test('malformed messages, lost tags and foreign plural categories fail', () => {
  const problems = checkCatalog('de', {
    ...de,
    'Read the <a>guide</a>': 'Lies die Anleitung',
    '{n, plural, one {# task} other {# tasks}}': '{n, plural, one {# Aufgabe} few {# Aufgaben} other {# Aufgaben}}',
    'Delete {name}?': '{name löschen?',
  }, messages, fmt)
  assert.ok(problems.some((p) => p.includes('tags of "Read the <a>guide</a>"')))
  assert.ok(problems.some((p) => p.includes('uses few')))
  assert.ok(problems.some((p) => p.startsWith('de: malformed "Delete {name}?"')))
})

test('a Settings path must use the catalog’s own section names', () => {
  const problems = checkCatalog('de', { ...de, 'Open Settings → Security': 'Öffne Einstellungen → Security' }, messages, fmt)
  assert.deepEqual(problems, ['de: "Open Settings → Security" names the section Security, but its translation does not say "Sicherheit"'])
})
