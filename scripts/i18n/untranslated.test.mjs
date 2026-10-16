// node --test scripts/i18n/untranslated.test.mjs (run by `make i18n-check`)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { untranslated, untranslatedProblems } from './untranslated.mjs'

const file = 'web/src/app/Fixture.tsx'

test('a planted literal fails with file:line', () => {
  const problems = untranslatedProblems(file, "export const X = () => (\n  <div>\n    <button>Save</button>\n  </div>\n)\n")
  assert.deepEqual(problems, [`${file}:3: Save`])
})

test('string props people read or hear fail, other props pass', () => {
  const src = `export const X = () => <input aria-label="Search" placeholder={'Find…'} className="ui-input" type="search" />`
  assert.deepEqual(untranslatedProblems(file, src).map((p) => p.split(': ')[1]), ['Search', 'Find…'])
})

test('SettingRow labels and conditional children are checked', () => {
  const src = `export const X = ({ on }) => <SettingRow label="Status" status={<b>{on ? 'Running' : 'Stopped'}</b>} />`
  assert.deepEqual(untranslatedProblems(file, src).map((p) => p.split(': ')[1]), ['Status', 'Running', 'Stopped'])
})

test('t(), t.rich() and <T> pass', () => {
  const src = `export const X = () => <div title={t('Save')}>{t('Save')}{t.rich('Read the <a>guide</a>', { a: (c) => <a>{c}</a>, code: <code>extension/</code> })}<T>{'Hi'}</T></div>`
  assert.deepEqual(untranslatedProblems(file, src), [])
})

test('an allow-listed literal passes', () => {
  const allow = new Set([`${file}\u0000OpenTodo`, `*\u0000Enter`])
  assert.deepEqual(untranslatedProblems(file, 'export const X = () => <p>OpenTodo<kbd>Enter</kbd></p>', allow), [])
})

test('the app and shared UI are clean', () => {
  assert.deepEqual(untranslated(), [])
})
