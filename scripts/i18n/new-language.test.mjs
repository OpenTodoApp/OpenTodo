// node --test scripts/i18n/new-language.test.mjs (run by `make i18n-check`)
// The language scaffold (OpenSpec change more-languages, design D5), run against a
// temporary copy of every file it reads or writes.
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { scaffold } from './new-language.mjs'
import { status } from './status.mjs'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const COPIED = [
  'web/src/locales', 'web/public/push-sw.js', 'extension/_locales', 'mobile/android/app/src/main/res/values',
  'mobile/android/app/src/main/res/values-de', 'internal/mail/templates', 'internal/mail/message.go',
  'internal/channels/messages.go', 'internal/quickadd/vocab.go', 'web/src/lib/nlp/vocab', 'web/src/lib/sectors.ts', 'docs/translating.md',
]

function copy() {
  const root = mkdtempSync(join(tmpdir(), 'opentodo-new-language-'))
  for (const rel of COPIED) cpSync(join(repo, rel), join(root, rel), { recursive: true })
  return root
}

/** Every file under root with its contents, to show that nothing changed. */
function snapshot(root, dir = root, out = {}) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) snapshot(root, p, out)
    else out[p.slice(root.length)] = readFileSync(p, 'utf8')
  }
  return out
}

test('scaffolding sv writes every surface, lists nothing, and the status shows Swedish at zero', () => {
  const root = copy()
  try {
    const before = snapshot(root)
    const written = scaffold(root, 'sv', 'Svenska')
    for (const rel of ['web/src/locales/sv.json', 'extension/_locales/sv/messages.json', 'mobile/android/app/src/main/res/values-sv/strings.xml', 'internal/mail/templates/digest.sv.txt', 'web/src/lib/nlp/vocab/sv.ts', 'web/public/push-sw.js', 'docs/translating.md']) {
      assert.ok(written.includes(rel), rel)
      assert.ok(existsSync(join(root, rel)), rel)
    }
    assert.equal(readFileSync(join(root, 'web/src/locales/sv.json'), 'utf8'), '{}\n')
    assert.match(readFileSync(join(root, 'internal/mail/templates/test.sv.txt'), 'utf8'), /^# TODO translate\n/)
    const ext = JSON.parse(readFileSync(join(root, 'extension/_locales/sv/messages.json'), 'utf8'))
    assert.ok(Object.values(ext).every((e) => e.description.startsWith('TODO translate')))
    assert.match(readFileSync(join(root, 'docs/translating.md'), 'utf8'), /<!-- \| Svenska \| `sv` \| community \|/)
    // Never listed: SHIPPED, mail.Languages, the channel table and Bundled are unchanged.
    for (const rel of ['/web/src/locales/index.ts', '/internal/mail/message.go', '/internal/channels/messages.go', '/internal/quickadd/vocab.go', '/web/src/lib/nlp/vocab/index.ts']) {
      assert.equal(readFileSync(join(root, rel), 'utf8'), before[rel], rel)
    }
    // No existing language's file changed; only push-sw.js and the guide gained a line.
    const after = snapshot(root)
    const changed = Object.keys(before).filter((k) => after[k] !== before[k]).sort()
    assert.deepEqual(changed, ['/docs/translating.md', '/web/public/push-sw.js'])
    // The status lists Swedish as work in progress at 0 on every surface it has.
    const sv = status(root).find((r) => r.code === 'sv')
    assert.equal(sv.tier, 'work in progress')
    for (const s of ['web', 'notifications', 'extension', 'android', 'emails', 'vocabulary']) {
      assert.ok(sv.surfaces[s], s)
      assert.equal(sv.surfaces[s].translated, 0, s)
      assert.ok(sv.surfaces[s].total > 0, s)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the vocabulary stub has every field of English, empty, and type-checks', () => {
  const root = copy()
  try {
    scaffold(root, 'sv', 'Svenska')
    const stub = readFileSync(join(root, 'web/src/lib/nlp/vocab/sv.ts'), 'utf8')
    assert.match(stub, /export const sv: Vocabulary = \{\n {2}code: 'sv',/)
    assert.match(stub, /\n {2}weekdays: \[\[\], \[\], \[\], \[\], \[\], \[\], \[\]\],\n/)
    assert.equal(stub.match(/\{ names: \[\], abbr: \[\] \}/g)?.length, 12)
    assert.match(stub, /\n {2}dayWords: \{\},\n/)
    assert.match(stub, /\n {2}units: \{ minute: \[\], hour: \[\]/)
    assert.doesNotMatch(stub, /'(today|tomorrow|monday|january)'/)
    const tsc = join(repo, 'web/node_modules/.bin/tsc')
    if (existsSync(tsc)) {
      const out = spawnSync(tsc, ['--noEmit', '--strict', '--skipLibCheck', join(root, 'web/src/lib/nlp/vocab/sv.ts')], { encoding: 'utf8' })
      assert.equal(out.status, 0, out.stdout + out.stderr)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an existing language is refused, naming what exists, and no file changes', () => {
  const root = copy()
  try {
    const before = snapshot(root)
    assert.throws(() => scaffold(root, 'de', 'Deutsch'), /de already exists: SHIPPED in web\/src\/locales\/index\.ts, web\/src\/locales\/de\.json/)
    assert.throws(() => scaffold(root, 'en', 'English'), /en already exists: English is the source language/)
    scaffold(root, 'sv', 'Svenska')
    const once = snapshot(root)
    assert.throws(() => scaffold(root, 'sv', 'Svenska'), /sv already exists: web\/src\/locales\/sv\.json/)
    assert.deepEqual(snapshot(root), once)
    assert.notDeepEqual(once, before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an invalid code or a missing name is refused before anything is written', () => {
  const root = copy()
  try {
    const before = snapshot(root)
    for (const code of ['SV', 'sv-SE', 's', 'swed', '', undefined, '../x']) {
      assert.throws(() => scaffold(root, code, 'Svenska'), /is not a language code/, String(code))
    }
    assert.throws(() => scaffold(root, 'sv', ' '), /name the language/)
    assert.deepEqual(snapshot(root), before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the command line prints what it wrote and exits 1 on a refusal', () => {
  const root = copy()
  try {
    const script = fileURLToPath(new URL('./new-language.mjs', import.meta.url))
    const ok = execFileSync(process.execPath, [script, 'sv', 'Svenska', '--root', root], { encoding: 'utf8' })
    assert.match(ok, /wrote web\/src\/locales\/sv\.json/)
    assert.match(ok, /Next, by hand:/)
    const refused = spawnSync(process.execPath, [script, 'de', 'Deutsch', '--root', root], { encoding: 'utf8' })
    assert.equal(refused.status, 1)
    assert.match(refused.stderr, /new-language: de already exists/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
