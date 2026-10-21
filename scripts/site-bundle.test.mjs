// site-bundle 2.1–2.3: the pieces of the bundle match their sources.
import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  buildManifest, iconSprite, METHOD_FEATURES, methodVocabulary, serverFacts, missingScreenshots, parseChangelog, repoRoot, SCREENSHOTS, SHOTS_DIR, templateLibraryFiles, TEMPLATES_SCHEMA, tokensCss, validateManifest,
} from './site-bundle.mjs'

const read = (p) => readFileSync(join(repoRoot, p), 'utf8')

// Every --ot-* declaration inside the block that starts at `selector`.
function decls(css, selector) {
  const at = css.indexOf(selector)
  assert.ok(at >= 0, `block ${selector}`)
  let depth = 0, i = css.indexOf('{', at), start = i
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) break
  }
  return Object.fromEntries([...css.slice(start, i).matchAll(/--ot-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().replace(/\s+/g, ' ')]))
}

test('tokens.css carries the same --ot-* values as index.css, light and both dark selectors', () => {
  const index = read('web/src/index.css')
  const out = tokensCss(index, 'v9.9.9')
  for (const sel of [':root, [data-theme="light"] {', '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"])', ':root[data-theme="dark"], [data-theme="dark"] {']) {
    const want = decls(index, sel)
    const got = decls(out, sel)
    assert.ok(Object.keys(want).length > 20, `${sel}: tokens found`)
    assert.deepEqual(got, want, sel)
  }
  assert.ok(!/@apply|@theme|tailwind/i.test(out), 'no Tailwind in tokens.css')
})

test('the icon sprite has one symbol per bundled icon', () => {
  const names = JSON.parse(read('web/src/ui/icons/names.json'))
  const sprite = iconSprite(read('web/src/ui/icons/lucide.ts'))
  for (const n of names) assert.ok(sprite.includes(`id="icon-${n}"`), n)
  assert.equal((sprite.match(/<symbol /g) ?? []).length, names.length)
})

test('the sprite adds the website-only icons once each (site-bundle-server-facts)', () => {
  const app = JSON.parse(read('web/src/ui/icons/names.json'))
  const site = JSON.parse(read('web/src/ui/icons/site-icons.json'))
  for (const n of Object.keys(site)) assert.ok(!app.includes(n), `${n} is already an app icon; drop it from site-icons.json`)
  const sprite = iconSprite(read('web/src/ui/icons/lucide.ts'), site)
  for (const n of [...app, ...Object.keys(site)]) assert.ok(sprite.includes(`id="icon-${n}"`), n)
  assert.equal((sprite.match(/<symbol /g) ?? []).length, app.length + Object.keys(site).length)
})

test('changelog.json: versions, dates and sections in order', () => {
  const c = parseChangelog(`# Changelog\n\nintro\n\n## [Unreleased]\n\n### Added\n\n- **One.** first\n  continued\n- Two\n\n## [0.3.0] - 2026-10-12\n\nAbout 0.3.\n\n### Fixed\n\n- Three\n`)
  assert.deepEqual(c, [
    { version: 'Unreleased', date: null, intro: '', sections: { Added: ['**One.** first\ncontinued', 'Two'] } },
    { version: '0.3.0', date: '2026-10-12', intro: 'About 0.3.', sections: { Fixed: ['Three'] } },
  ])
  const real = parseChangelog(read('CHANGELOG.md'))
  assert.ok(real.some((e) => /^\d+\.\d+\.\d+$/.test(e.version) && e.date && e.sections.Added?.length))
})

test('the manifest validates against schema 1', () => {
  const m = buildManifest({ version: 'v0.4.0', date: '2026-10-20', commit: 'abc', formats: ['opentodo', 'csv'], binBytes: 23 << 20, dockerMB: '31.5', docsPages: 40 })
  assert.deepEqual(validateManifest(m), [])
  assert.equal(m.facts.binaryMB, 23)
  assert.equal(m.facts.dockerImageMB, 31.5)
  assert.deepEqual(m.screenshots, SCREENSHOTS.map((n) => `shots/${n}.webp`))
  assert.ok(m.facts.quickAddLanguages.includes('en'))
  // A field of an unsupported type, a wrong schema and a missing list are reported.
  assert.ok(validateManifest({ ...m, schema: 2, importFormats: 'csv', facts: { x: { y: 1 } } }).length >= 3)
})

test('a missing screenshot is reported (the docs check uses this)', () => {
  const root = mkdtempSync(join(tmpdir(), 'ot-shots-'))
  mkdirSync(join(root, SHOTS_DIR), { recursive: true })
  for (const n of SCREENSHOTS.slice(1)) writeFileSync(join(root, SHOTS_DIR, `${n}.webp`), 'x')
  assert.deepEqual(missingScreenshots(root), [`${SHOTS_DIR}/${SCREENSHOTS[0]}.webp`])
  assert.deepEqual(missingScreenshots(), [])
})

test('CI path filters: docs-only changes skip the code jobs (site-bundle D7)', async () => {
  const { execFileSync } = await import('node:child_process')
  const run = (files) => Object.fromEntries(execFileSync(join(repoRoot, 'scripts/ci-changes.sh'), { input: files.join('\n') + '\n', encoding: 'utf8' })
    .trim().split('\n').map((l) => l.split('=')))
  assert.deepEqual(run(['docs/backups.md', 'web/src/generated/help.json', 'website/docs/backups/index.html']), { code: 'false', docs: 'true' })
  assert.deepEqual(run(['internal/backup/restore.go']), { code: 'true', docs: 'false' })
  assert.deepEqual(run(['web/src/app/App.tsx', 'web/src/generated/help.json']), { code: 'true', docs: 'true' })
  assert.deepEqual(run(['go.sum']), { code: 'true', docs: 'false' })
  assert.deepEqual(run(['.github/workflows/ci.yml']), { code: 'true', docs: 'false' })
})

test('server facts come from their sources (site-bundle-server-facts)', () => {
  assert.deepEqual(serverFacts(), {
    architectures: ['linux/amd64', 'linux/arm64'], port: 8080, dataDir: '/data', database: 'SQLite',
    license: 'AGPL-3.0', exportFormat: 'opentodo-export', exportFormatVersion: 1,
  })
  // A source that no longer states its fact fails the build, naming the file.
  const root = mkdtempSync(join(tmpdir(), 'facts-'))
  for (const f of ['.github/workflows/ci.yml', 'Dockerfile', 'go.mod', 'LICENSE']) {
    mkdirSync(join(root, f, '..'), { recursive: true })
    writeFileSync(join(root, f), read(f))
  }
  mkdirSync(join(root, 'internal/httpapi'), { recursive: true })
  writeFileSync(join(root, 'internal/httpapi/export.go'), 'package httpapi\n')
  assert.throws(() => serverFacts(root), /internal\/httpapi\/export\.go/)
})

test('method.json: the app\'s own words in every shipped language (open-loops-method D1)', () => {
  const m = methodVocabulary()
  assert.equal(m.schema, 1)
  assert.equal(m.name, 'Open Loops')
  assert.deepEqual(m.languages, ['en', 'de', 'fr', 'es', 'it', 'pt'])
  assert.deepEqual(m.moves.map((x) => x.id), ['catch', 'clarify', 'place', 'do', 'review'])
  const it = JSON.parse(read('web/src/locales/it.json'))
  const vocabulary = JSON.parse(read('web/src/lib/method/vocabulary.json'))
  for (const [i, move] of vocabulary.moves.entries()) {
    // Same words on the website: the Italian name is the catalog's entry in the method context.
    assert.equal(m.moves[i].name.it, it[`${move.name}|method`], move.id)
    assert.equal(m.moves[i].name.en, move.name)
    assert.equal(m.moves[i].description.it, it[move.description], move.id)
    assert.equal(m.moves[i].route, move.route)
  }
  for (const group of ['principles', 'places', 'rhythms', 'horizons']) {
    for (const term of m[group]) for (const lang of m.languages) assert.ok(term.name[lang] && term.description[lang], `${group}.${term.id}.${lang}`)
  }
})

test('the manifest names the Open Loops features as a fact the website can gate on', () => {
  const m = buildManifest({ version: 'v1.0.0', date: '2026-10-18', commit: 'abc', formats: ['opentodo-json'], docsPages: 10 })
  assert.deepEqual(m.facts.method, METHOD_FEATURES)
  assert.ok(m.facts.method.includes('monthly-look'))
  assert.deepEqual(validateManifest(m), [])
})


test('the template library is in the bundle: index.json, one file per template, the templates fact (template-library 5.1)', () => {
  const { index, files, slugs } = templateLibraryFiles()
  const compiled = JSON.parse(read('web/src/generated/templates.json'))
  assert.equal(index.schema, TEMPLATES_SCHEMA)
  assert.deepEqual(slugs, compiled.templates.map((t) => t.slug), 'the bundle ships exactly the library the app ships')
  const trip = index.templates.find((t) => t.slug === 'trip-planning')
  assert.equal(trip.title.en, 'Trip planning')
  assert.equal(trip.title.it, 'Organizzare un viaggio')
  assert.equal(trip.category, 'personal')
  const file = Object.fromEntries(files)['trip-planning.json']
  assert.equal(file.schema, TEMPLATES_SCHEMA)
  assert.equal(file.projects[0].sections[1].tasks[0].due, '+0d', 'offsets stay relative')
  assert.ok(file.text.description.en.length > 0)
  const m = buildManifest({ version: 'v0.10.0', date: '2026-10-21', commit: 'abc', formats: ['opentodo'], docsPages: 40 })
  assert.deepEqual(m.facts.templates, slugs)
  assert.deepEqual(validateManifest(m), [])
})

test('an invalid template fails the bundle and names the template', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-tpl-'))
  mkdirSync(join(dir, 'broken'))
  writeFileSync(join(dir, 'broken/template.yaml'), 'title: Broken\n')
  assert.throws(() => templateLibraryFiles(repoRoot, { dir, icons: new Set(['leaf']), sectionStyle: false, languages: [] }), /template library: broken\/template\.yaml: summary: is required/)
})
