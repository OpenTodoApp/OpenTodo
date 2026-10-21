// Run with: node --test extension/locales.test.js  (or `make extension`)
// The extension's texts follow the browser's interface language through MV3
// _locales (OpenSpec app-localization D10): every locale has exactly the keys of
// English, with the same placeholders, and every __MSG_…__ and data-i18n key the
// extension uses exists.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const dir = new URL('./_locales/', import.meta.url)
const read = (lang) => JSON.parse(readFileSync(new URL(`${lang}/messages.json`, dir), 'utf8'))
const en = read('en')
const langs = readdirSync(dir)

test('the six shipped languages are there', () => {
  assert.deepEqual([...langs].sort(), ['de', 'en', 'es', 'fr', 'it', 'pt'])
})

for (const lang of langs) {
  test(`${lang} has every English key, no extra one, and the same placeholders`, () => {
    const msgs = read(lang)
    assert.deepEqual(Object.keys(msgs).sort(), Object.keys(en).sort())
    for (const [key, entry] of Object.entries(en)) {
      const holders = (s) => [...s.matchAll(/\$([A-Z_]+)\$/g)].map((m) => m[1]).sort()
      assert.ok(msgs[key].message.trim(), `${lang}.${key} is empty`)
      assert.deepEqual(holders(msgs[key].message), holders(entry.message), `${lang}.${key}`)
      assert.deepEqual(msgs[key].placeholders ?? null, entry.placeholders ?? null, `${lang}.${key} placeholders`)
    }
  })
}

test('every key the manifest, pages and scripts use exists', () => {
  const read2 = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')
  const keys = (f, re) => [...read2(f).matchAll(re)].map((m) => m[1])
  const used = [
    ...keys('./manifest.src.json', /__MSG_(\w+)__/g),
    ...['./options.html', './popup.html'].flatMap((f) => keys(f, /data-i18n="(\w+)"/g)),
    ...['./options.js', './popup.js'].flatMap((f) => keys(f, /msg\('(\w+)'/g)),
    ...['./popup-state.js', './settings.js'].flatMap((f) => keys(f, /(?:key|reason): '(\w+)'/g)),
    ...keys('./background.js', /getMessage\('(\w+)'/g),
  ]
  assert.ok(used.length > 40)
  for (const key of used) assert.ok(key in en, `missing message ${key}`)
  assert.equal(JSON.parse(read2('./manifest.src.json')).default_locale, 'en')
})

test('French names the context-menu entry in French', () => {
  assert.equal(read('fr').actionTitle.message, 'Ajouter à OpenTodo')
})
