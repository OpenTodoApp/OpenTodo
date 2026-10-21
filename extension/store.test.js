// Run with: node --test extension/store.test.js  (or `make extension`)
// The store texts (OpenSpec change extension-v2, design D8): every permission
// the manifest declares is justified in store/privacy.md, and every listing has
// a name, a summary and a description.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')
const manifest = JSON.parse(read('./manifest.src.json'))

/** The permissions a privacy text does not name. */
export function unnamedPermissions(m, privacy) {
  return [...(m.permissions ?? []), ...(m.optional_permissions ?? []), ...(m.optional_host_permissions ?? [])].filter((p) => !privacy.includes(`\`${p}\``))
}

test('Listing matches the manifest: every permission is named in privacy.md', () => {
  const privacy = read('./store/privacy.md')
  assert.deepEqual(unnamedPermissions(manifest, privacy), [])
  assert.deepEqual(unnamedPermissions({ ...manifest, permissions: [...manifest.permissions, 'tabs'] }, privacy), ['tabs'], 'a missing one fails')
})

for (const lang of ['en', 'de', 'fr', 'es', 'it', 'pt']) {
  test(`listing.${lang}.md has a name, a summary and a description`, () => {
    const text = read(`./store/listing.${lang}.md`)
    const part = (h) => text.split(new RegExp(`^## ${h}\\n`, 'm'))[1]?.split(/^## /m)[0].trim() ?? ''
    assert.equal(part('Name'), 'OpenTodo Capture')
    const summary = part('Summary')
    assert.ok(summary && summary.length <= 132, `summary of ${summary.length} characters (the Chrome Web Store allows 132)`)
    assert.ok(part('Description').length > 300)
  })
}

test('the screenshot list exists', () => {
  assert.match(read('./store/screenshots.md'), /1280×800/)
})
