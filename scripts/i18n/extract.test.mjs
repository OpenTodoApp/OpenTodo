// node --test scripts/i18n/extract.test.mjs (run by `make i18n-check`)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { messagesIn, methodMessages, shortcutMessages, workerMessages } from './extract.mjs'

const ids = (list) => list.map((m) => m.id)

test('collects plain, context, rich, plural, msg() and conditional messages', () => {
  const src = `
    import { t, msg, T } from '../lib/i18n'
    const LABEL = msg('Inbox')
    export function X({ n, ok }) {
      return <div title={t('Open', { context: 'verb' })}>
        {t('Save')}
        {t.rich('Read the <a>guide</a>', { a: (c) => <a>{c}</a> })}
        {t('{n, plural, one {# task} other {# tasks}}', { n })}
        {t(ok ? 'Yes' : 'No')}
        <T>{'Press <b>Save</b>'}</T>
        {t(LABEL)}
      </div>
    }`
  assert.deepEqual(ids(messagesIn('fixture.tsx', src)).sort(), [
    'Inbox', 'No', 'Open|verb', 'Press <b>Save</b>', 'Read the <a>guide</a>', 'Save', 'Yes', '{n, plural, one {# task} other {# tasks}}',
  ].sort())
})

test('reports the line of each message', () => {
  const found = messagesIn('fixture.ts', "const a = 1\nconst b = t('Hello')\n")
  assert.deepEqual(found.map((m) => [m.id, m.line]), [['Hello', 2]])
})

test('the shortcut registry contributes descriptions, titles, states and quick-add rows', () => {
  const src = `
    export const SHORTCUT_SECTIONS = [{ id: 'go', title: 'Go to a view' }]
    export const SHORTCUTS = [{ id: 'a', keys: ['q'], description: 'Quick add a task', when: 'board', section: 'go' }]
    export const QUICK_ADD_SYNTAX = [['#project', 'Project, label']]`
  assert.deepEqual(ids(shortcutMessages('shortcuts.ts', src)).sort(), ['Go to a view', 'Project, label', 'Quick add a task', 'board'])
})

test('the service worker contributes its English texts only', () => {
  const src = "const TEXT = { en: { snooze: 'Snooze 10 min' }, de: { snooze: '10 Min. später' } }"
  assert.deepEqual(ids(workerMessages('push-sw.js', src)), ['Snooze 10 min'])
})

test('collects the Open Loops vocabulary, names in the method context, but not the method name', () => {
  const src = JSON.stringify({ name: 'Open Loops', tagline: 'A home for everything.', moves: [{ id: 'catch', name: 'Catch', description: 'Get it out.' }], places: [{ id: 'inbox', name: 'Inbox', description: 'Caught.' }] })
  assert.deepEqual(ids(methodMessages('vocabulary.json', src)), ['A home for everything.', 'Catch|method', 'Get it out.', 'Inbox|method', 'Caught.'])
})
