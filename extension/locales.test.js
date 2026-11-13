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

// The web app's maintained languages (web/src/locales/index.ts, entries without
// `community: true`) each have a folder (more-languages D6). Another folder is a
// community or work-in-progress language, which the build leaves out while it is
// marked "TODO translate" (scripts/i18n/new-language.mjs).
const index = readFileSync(new URL('../web/src/locales/index.ts', import.meta.url), 'utf8')
const maintained = [...index.matchAll(/\{ code: '([a-z]{2,3})'[^}]*\}/g)].filter((m) => !m[0].includes('community: true')).map((m) => m[1])

test('every maintained language is there', () => {
  assert.ok(maintained.length >= 7, maintained.join())
  for (const code of maintained) assert.ok(langs.includes(code), `extension/_locales/${code} is missing`)
})

test('a maintained language is translated, not a scaffold', () => {
  for (const code of maintained.filter((c) => c !== 'en')) {
    const todo = Object.entries(read(code)).filter(([, e]) => String(e.description ?? '').startsWith('TODO translate'))
    assert.deepEqual(todo.map(([k]) => k), [], `${code} still has TODO translate entries`)
  }
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

// The Chrome Web Store refuses a package whose manifest name is over 75
// characters or whose description is over 132, in any locale.
for (const lang of langs) {
  test(`${lang} name and description fit the store limits`, () => {
    const msgs = read(lang)
    assert.ok([...msgs.extName.message].length <= 75, `${lang}.extName is ${[...msgs.extName.message].length} characters, over 75`)
    assert.ok([...msgs.extDescription.message].length <= 132, `${lang}.extDescription is ${[...msgs.extDescription.message].length} characters, over 132`)
  })
}
