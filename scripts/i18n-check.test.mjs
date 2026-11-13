// node --test scripts/i18n-check.test.mjs (run by `make i18n-check`)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkCatalog, communityCodes, communityCoverage, loadFormat, maintainedInGuide } from './i18n-check.mjs'
import { checkShellCatalog } from './i18n/shell.mjs'

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

test('a path in an operating system’s settings keeps that system’s wording', () => {
  const id = 'On Android, check Settings → Apps → your browser.'
  const problems = checkCatalog('de', { ...de, [id]: 'Prüfe unter Android Einstellungen → Apps → dein Browser.' }, [...messages, id], fmt)
  assert.deepEqual(problems, [])
})

// Community languages (OpenSpec change more-languages, design D4).
const ids = (n) => Array.from({ length: n }, (_, i) => `message ${i}`)

test('a community catalog at 85 % fails, naming the language and its coverage', () => {
  const { problems, summary } = communityCoverage('pl', ids(15), 100)
  assert.deepEqual(problems, ['pl: community catalog is 85.0 % (85 of 100) translated, below the 90 % a community language needs'])
  assert.deepEqual(summary, [])
})

test('a community catalog at 94 % passes and reports its missing messages', () => {
  const { problems, summary } = communityCoverage('pl', ids(6), 100)
  assert.deepEqual(problems, [])
  assert.deepEqual(summary, ['pl: 94.0 % (94 of 100) (community), missing "message 0", "message 1", "message 2", "message 3", "message 4", and 1 more'])
})

test('exactly 90 % passes; a community language without a maintainer fails', () => {
  assert.deepEqual(communityCoverage('pl', ids(10), 100).problems, [])
  assert.deepEqual(communityCoverage('pl', [], 100, { maintained: false }).problems, ['pl: community language without a maintainer in docs/translating.md'])
})

test('the tier and the maintainers are read from index.ts and the guide', () => {
  const root = mkdtempSync(join(tmpdir(), 'opentodo-i18n-check-'))
  try {
    mkdirSync(join(root, 'web/src/locales'), { recursive: true })
    mkdirSync(join(root, 'docs'))
    writeFileSync(join(root, 'web/src/locales/index.ts'), "[\n  { code: 'en', name: 'English' },\n  { code: 'pl', name: 'Polski', community: true },\n]")
    writeFileSync(join(root, 'docs/translating.md'), '## Maintainers\n\n| Language | Code | Tier | Reviewer |\n| --- | --- | --- | --- |\n| Polski | `pl` | community | someone |\n<!-- | Svenska | `sv` | community | your GitHub name | -->\n\n## Next\n\n| a | `xx` |\n')
    assert.deepEqual(communityCodes(root), ['pl'])
    assert.deepEqual(maintainedInGuide(root), ['pl'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the iOS catalog may hold part of a community language, never an unlisted one', () => {
  const catalog = { sourceLanguage: 'en', strings: { Done: { localizations: { de: { stringUnit: { state: 'translated', value: 'Erledigt' } }, pl: { stringUnit: { state: 'translated', value: 'Gotowe' } } } } } }
  assert.deepEqual(checkShellCatalog(catalog, ['de'], ['pl']), [])
  assert.deepEqual(checkShellCatalog(catalog, ['de']), ['shell pl: "Done" is translated into a language the web app does not ship'])
})
