import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkCatalogs, loadFormatter, shippedLanguages } from './i18n-check.mjs'

const formatter = await loadFormatter()
const messages = { 'Hello {name}': ['a.tsx:1'], 'Save': ['a.tsx:2'], '{n, plural, one {# task} other {# tasks}}': ['a.tsx:3'], 'Open|verb': ['a.tsx:4'] }

test('a complete shipped catalog passes', () => {
  const de = { 'Hello {name}': 'Hallo {name}', 'Save': 'Speichern', '{n, plural, one {# task} other {# tasks}}': '{n, plural, one {# Aufgabe} other {# Aufgaben}}', 'Open|verb': 'Öffnen' }
  const { problems, summary } = checkCatalogs({ messages, catalogs: { de }, shipped: ['de'], formatter })
  assert.deepEqual(problems, [])
  assert.deepEqual(summary, ['de: 4 of 4'])
})

test('a dropped placeholder, a missing and an unused key fail', () => {
  const de = { 'Hello {name}': 'Hallo', 'Save': 'Speichern', 'Open|verb': 'Öffnen', 'Gone': 'Weg' }
  const { problems } = checkCatalogs({ messages, catalogs: { de }, shipped: ['de'], formatter })
  assert.ok(problems.some((p) => p.includes('placeholders')))
  assert.ok(problems.some((p) => p.includes('missing') && p.includes('plural')))
  assert.ok(problems.some((p) => p.includes('unused "Gone"')))
})

test('an incomplete unlisted catalog only reports', () => {
  const { problems, summary } = checkCatalogs({ messages, catalogs: { pl: { 'Save': 'Zapisz' } }, shipped: ['de'], formatter })
  assert.deepEqual(problems, [])
  assert.deepEqual(summary, ['pl: 1 of 4 (work in progress, not offered)'])
})

test('a translation that does not parse fails', () => {
  const de = { 'Hello {name}': 'Hallo {name', 'Save': 'Speichern', '{n, plural, one {# task} other {# tasks}}': '{n, plural, one {# Aufgabe} other {# Aufgaben}}', 'Open|verb': 'Öffnen' }
  const { problems } = checkCatalogs({ messages, catalogs: { de }, shipped: ['de'], formatter })
  assert.ok(problems.some((p) => p.includes('does not parse')))
})

test('reads the shipped list', () => {
  assert.deepEqual(shippedLanguages("export const SHIPPED_LANGUAGES: readonly string[] = ['de', 'fr']"), ['de', 'fr'])
  assert.deepEqual(shippedLanguages('export const SHIPPED_LANGUAGES: readonly string[] = []'), [])
})
