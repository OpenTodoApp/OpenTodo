// Every extension locale has exactly the English keys and the same placeholders
// (OpenSpec `app-localization`, design D10), and the manifest only names keys
// that exist.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const dir = new URL('./_locales/', import.meta.url)
const read = (lang) => JSON.parse(readFileSync(new URL(`${lang}/messages.json`, dir), 'utf8'))
const en = read('en')

test('the six languages are present', () => {
  assert.deepEqual(readdirSync(dir).sort(), ['de', 'en', 'es', 'fr', 'it', 'pt'])
})

for (const lang of readdirSync(dir)) {
  test(`${lang} has every English key and no other`, () => {
    const m = read(lang)
    assert.deepEqual(Object.keys(m).sort(), Object.keys(en).sort())
    for (const [k, v] of Object.entries(m)) {
      assert.ok(v.message, `${lang}.${k} is empty`)
      const vars = (s) => [...s.matchAll(/\$([A-Z]+)\$/g)].map((x) => x[1]).sort()
      assert.deepEqual(vars(v.message), vars(en[k].message), `${lang}.${k} placeholders`)
    }
  })
}

test('the manifest and the pages use existing keys', () => {
  const used = new Set()
  for (const f of ['manifest.json', 'options.html', 'options.js', 'background.js']) {
    const text = readFileSync(new URL(f, import.meta.url), 'utf8')
    for (const m of text.matchAll(/__MSG_(\w+)__|data-i18n="(\w+)"|(?:getMessage|msg)\('(\w+)'/g)) used.add(m[1] ?? m[2] ?? m[3])
  }
  for (const k of used) assert.ok(k in en, `unknown key ${k}`)
})
