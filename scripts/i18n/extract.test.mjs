import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractFrom } from './extract.mjs'

test('extracts plain, context, rich, plural, msg and <T> messages', () => {
  const src = `
    const a = t('Save')
    const b = t('Open', { context: 'verb' })
    const c = t.rich('Press <b>Save</b>', { b: (s) => s })
    const d = t('{n, plural, one {# task} other {# tasks}}', { n })
    const e = msg('Later')
    const f = <T b={(s) => s}>{'Keep <b>it</b>'}</T>
    const g = <T>Plain   words</T>
    const h = t(variable)
    const ERROR_MESSAGES = { not_found: 'Not found.' }
  `
  const keys = extractFrom('x.tsx', src).map((m) => m.key)
  assert.deepEqual(keys, ['Save', 'Open|verb', 'Press <b>Save</b>', '{n, plural, one {# task} other {# tasks}}', 'Later', 'Keep <b>it</b>', 'Plain words', 'Not found.'])
  assert.equal(extractFrom('x.tsx', src)[0].line, 2)
})
