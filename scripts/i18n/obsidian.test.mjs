// node --test scripts/i18n/obsidian.test.mjs (run by `make i18n-check`)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadFormat } from '../i18n-check.mjs'
import { checkObsidianCatalogs, OBSIDIAN_LANGS, trMessagesIn } from './obsidian.mjs'

const fmt = await loadFormat()
const all = (entries) => Object.fromEntries(OBSIDIAN_LANGS.map((l) => [l, { ...entries }]))

test('tr() messages are found, conditionals included', () => {
  const src = `tr('Send line to OpenTodo'); tr(n > 1 ? 'These lines' : 'This line', { n }); t('not mine')`
  assert.deepEqual(trMessagesIn('x.ts', src), ['Send line to OpenTodo', 'These lines', 'This line'])
})

test('complete catalogs pass', () => {
  const msgs = ['Send', '{n} waiting']
  assert.deepEqual(checkObsidianCatalogs(msgs, all({ Send: 'Send', '{n} waiting': '{n} waiting' }), fmt), [])
})

test('a missing German entry, a stale one and a dropped placeholder are named', () => {
  const msgs = ['Send', '{n} waiting']
  const catalogs = all({ Send: 'Send', '{n} waiting': '{n} waiting' })
  delete catalogs.de.Send
  catalogs.fr.Old = 'Vieux'
  catalogs.it['{n} waiting'] = 'in attesa'
  assert.deepEqual(checkObsidianCatalogs(msgs, catalogs, fmt), [
    'obsidian de: missing "Send"',
    'obsidian fr: unused "Old"',
    'obsidian it: placeholders of "{n} waiting" are {}, the source has {n}',
  ])
})
