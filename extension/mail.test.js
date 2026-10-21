// Run with: node --test extension/mail.test.js  (or `make extension`)
// Mail message recognition (OpenSpec change extension-v2, design D5) over the
// fixtures in testdata/mail: a fixture that no longer matches is the signal to
// update the title patterns or the selector table in mail.js.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { HEADER_SELECTORS, MAIL_CLIENTS, mailClientOf, readMailHeader, recognizeMail, senderLine } from './mail.js'

const dir = new URL('./testdata/mail/', import.meta.url)
const fixtures = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, ...JSON.parse(readFileSync(new URL(f, dir), 'utf8')) }))

test('the fixtures cover both clients, a list view, a draft and an unreadable header', () => {
  const names = fixtures.map((f) => f.file)
  for (const n of ['gmail-en-conversation.json', 'gmail-de-label.json', 'gmail-list.json', 'gmail-draft.json', 'gmail-header-unreadable.json', 'outlook-office-message.json', 'outlook-live-message.json', 'outlook-list.json']) {
    assert.ok(names.includes(n), `missing fixture ${n}`)
  }
})

for (const f of fixtures) {
  test(`fixture ${f.file}`, () => {
    assert.deepEqual(recognizeMail({ url: f.url, title: f.title, header: f.header }), f.expect)
  })
}

test('the fixtures hold no real address', () => {
  for (const f of fixtures) {
    const text = readFileSync(new URL(f.file, dir), 'utf8')
    for (const [address] of text.matchAll(/[\w.+-]+@([\w-]+\.)+[\w-]+/g)) {
      assert.match(address, /(\.example|@example\.(com|org|net))$/, `${f.file}: ${address} is not on an example domain`)
    }
  }
})

test('other pages are not mail', () => {
  assert.equal(recognizeMail({ url: 'https://example.com/#inbox/abc', title: 'x - y - Gmail' }), null)
  assert.equal(recognizeMail({ url: 'not a url', title: '' }), null)
  assert.equal(recognizeMail(), null)
  assert.equal(mailClientOf('https://MAIL.google.com/mail/u/0/'), MAIL_CLIENTS[0])
  assert.equal(mailClientOf('https://mail.google.com.evil.example/'), null)
})

test('a title without the client suffix gives no subject', () => {
  assert.equal(recognizeMail({ url: 'https://mail.google.com/mail/u/0/#inbox/FMfcgz', title: 'Gmail' }), null)
})

test('long ids and subjects are cut to the origin limits', () => {
  const r = recognizeMail({ url: `https://outlook.office.com/mail/id/${'A'.repeat(600)}`, title: `${'s'.repeat(600)} - Outlook` })
  assert.equal(r.origin.id.length, 512)
  assert.equal(r.origin.title.length, 500)
})

test('the From line', () => {
  assert.equal(senderLine({ name: 'Acme', email: 'a@acme.example' }), 'Acme <a@acme.example>')
  assert.equal(senderLine({ name: 'a@acme.example', email: 'a@acme.example' }), 'a@acme.example')
  assert.equal(senderLine({ name: ' ', email: '' }), '')
  assert.equal(senderLine(null), '')
})

/** A tiny stand-in for the mail page's document. */
function fakeDocument(map) {
  const el = (attrs, text = '') => ({ getAttribute: (k) => attrs[k] ?? null, textContent: text })
  return { querySelectorAll: (sel) => (map[sel] ?? []).map(([attrs, text]) => el(attrs, text)) }
}

test('readMailHeader reads Gmail attributes of the last open message', () => {
  globalThis.document = fakeDocument({ 'span.gD[email]': [[{ name: 'Old', email: 'old@x.example' }], [{ name: 'Acme Heating', email: 'quotes@acme.example' }]] })
  try {
    assert.deepEqual(readMailHeader(HEADER_SELECTORS.gmail), { name: 'Acme Heating', email: 'quotes@acme.example' })
  } finally {
    delete globalThis.document
  }
})

test('readMailHeader reads the Outlook sender title', () => {
  globalThis.document = fakeDocument({ '[role="main"] span[title*="@"]': [[{ title: 'Billing Team <billing@supplier.example>' }, ' Billing Team ']] })
  try {
    assert.deepEqual(readMailHeader(HEADER_SELECTORS.outlook), { name: 'Billing Team', email: 'billing@supplier.example' })
  } finally {
    delete globalThis.document
  }
})

test('readMailHeader gives null when the page changed', () => {
  globalThis.document = fakeDocument({})
  try {
    assert.equal(readMailHeader(HEADER_SELECTORS.gmail), null)
    globalThis.document = { querySelectorAll: () => { throw new Error('bad selector') } }
    assert.equal(readMailHeader(HEADER_SELECTORS.outlook), null)
  } finally {
    delete globalThis.document
  }
})
