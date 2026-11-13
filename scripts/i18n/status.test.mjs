// node --test scripts/i18n/status.test.mjs (run by `make i18n-check`)
// The language × surface report (OpenSpec change more-languages, design D5),
// against a small fixture tree written for each test.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { format, shippedLanguages, status } from './status.mjs'

const FILES = {
  'web/src/locales/index.ts': `export const SHIPPED = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pl', name: 'Polski', community: true },
] as const`,
  'web/src/locales/messages.json': JSON.stringify({ Inbox: [], Today: [], Upcoming: [], Someday: [] }),
  'web/src/locales/de.json': JSON.stringify({ Inbox: 'Eingang', Today: 'Heute', Upcoming: 'Demnächst', Someday: 'Irgendwann' }),
  'web/src/locales/pl.json': JSON.stringify({ Inbox: 'Skrzynka', Today: 'Dziś', Upcoming: 'Wkrótce' }),
  'web/src/locales/sv.json': '{}',
  'web/public/push-sw.js': `(() => {
  const OWN_TEXT = {
    en: { reminder: 'Reminder', dismiss: 'Dismiss' },
    de: { reminder: 'Erinnerung', dismiss: 'Verwerfen' },
    sv: {},
  }
  self.__opentodoText = OWN_TEXT
})()`,
  'extension/_locales/en/messages.json': JSON.stringify({ a: { message: 'A', description: 'd' }, b: { message: 'B' } }),
  'extension/_locales/de/messages.json': JSON.stringify({ a: { message: 'Ä' }, b: { message: 'Bä' } }),
  'extension/_locales/sv/messages.json': JSON.stringify({ a: { message: 'A', description: 'TODO translate. d' }, b: { message: 'B', description: 'TODO translate.' } }),
  'mobile/android/app/src/main/res/values/strings.xml': '<resources>\n<string name="app_name" translatable="false">OpenTodo</string>\n<string name="retry">Retry</string>\n<string name="done">Done</string>\n</resources>',
  'mobile/android/app/src/main/res/values-de/strings.xml': '<resources>\n<string name="retry">Erneut</string>\n</resources>',
  'internal/mail/templates/test.en.txt': 'Test\n',
  'internal/mail/templates/digest.en.txt': 'Digest\n',
  'internal/mail/templates/test.de.txt': 'Test\n',
  'internal/mail/templates/digest.de.txt': 'Übersicht\n',
  'internal/mail/templates/test.sv.txt': '# TODO translate\nTest\n',
  'internal/channels/messages.go': `package channels

var texts = map[string]map[string]string{
	"en": {
		txtReminder: "A reminder is due", txtGuest: "A guest",
	},
	"de": {
		txtReminder: "Eine Erinnerung ist fällig",
	},
}
`,
  'web/src/lib/nlp/vocab/en.ts': `import type { Vocabulary } from './types'

export const en: Vocabulary = {
  code: 'en',
  dayMonthOrder: 'MD',
  dayWords: { today: 0, tomorrow: 1 },
  weekdays: [
    ['monday', 'mon'],
    ['tuesday'],
  ],
  nextAfter: [],
  units: { day: ['day', 'days'], week: ['week'] },
  hourSuffixH: true,
}
`,
  'web/src/lib/nlp/vocab/de.ts': `export const de: Vocabulary = {
  code: 'de',
  dayWords: { heute: 0 },
  weekdays: [['montag'], ['dienstag']],
  nextAfter: [],
  units: { day: ['tag'], week: ['woche'] },
}
`,
  'web/src/lib/nlp/vocab/sv.ts': `export const sv: Vocabulary = {
  code: 'sv',
  dayWords: { idag: 0 },
  weekdays: [[], []],
  nextAfter: [],
  units: { day: [], week: [] },
}
`,
  'internal/quickadd/vocab.go': 'package quickadd\n\nvar Bundled = []string{"en", "de"}\n',
}

function tree() {
  const root = mkdtempSync(join(tmpdir(), 'opentodo-i18n-status-'))
  for (const [rel, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  return root
}

test('SHIPPED entries carry their tier', () => {
  const root = tree()
  try {
    assert.deepEqual(shippedLanguages(root), [
      { code: 'en', name: 'English', community: false },
      { code: 'de', name: 'Deutsch', community: false },
      { code: 'pl', name: 'Polski', community: true },
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('every language on disk, with translated / total per surface and the missing keys', () => {
  const root = tree()
  try {
    const rows = status(root)
    assert.deepEqual(rows.map((r) => [r.code, r.tier]), [['de', 'maintained'], ['pl', 'community'], ['sv', 'work in progress']])
    const [de, pl, sv] = rows
    const count = (s) => (s ? `${s.translated}/${s.total}` : null)
    assert.deepEqual(Object.fromEntries(Object.entries(de.surfaces).map(([k, s]) => [k, count(s)])), {
      web: '4/4', notifications: '2/2', extension: '2/2', android: '1/2', ios: null, emails: '2/2', channels: '1/2', vocabulary: '3/3', obsidian: null,
    })
    assert.deepEqual(de.surfaces.android.missing, ['done'])
    assert.deepEqual(de.surfaces.channels.missing, ['txtGuest'])
    assert.equal(count(pl.surfaces.web), '3/4')
    assert.deepEqual(pl.surfaces.web.missing, ['Someday'])
    assert.equal(pl.surfaces.extension, null, 'no folder: English')
    // A scaffold is at zero: its "TODO translate" copies and empty lists do not count.
    assert.equal(count(sv.surfaces.web), '0/4')
    assert.equal(count(sv.surfaces.notifications), '0/2')
    assert.equal(count(sv.surfaces.extension), '0/2')
    assert.equal(count(sv.surfaces.emails), '0/2')
    assert.deepEqual(sv.surfaces.emails.missing, ['digest', 'test'])
    assert.equal(count(sv.surfaces.vocabulary), '1/3', 'only dayWords holds a word')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the report is a table, then the first missing keys', () => {
  const root = tree()
  try {
    const text = format(status(root), { firstMissing: 1 })
    const [head, , de] = text.split('\n')
    assert.match(head, /^language\s+tier\s+web\s+notifications\s+extension\s+android\s+ios\s+emails\s+channels\s+vocabulary\s+obsidian$/)
    assert.match(de, /^de\s+maintained\s+4\/4\s+2\/2\s+2\/2\s+1\/2\s+—/)
    assert.ok(text.includes('pl web: "Someday"'), text)
    assert.ok(text.includes('sv web: "Inbox", and 3 more'), text)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
