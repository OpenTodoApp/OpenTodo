// Scaffold a new interface language on every surface (OpenSpec change
// more-languages, design D5). Standard library only, no network.
//
//   node scripts/i18n/new-language.mjs <code> "<Native name>" [--root <dir>]
//
// It refuses a code that is not two or three lowercase letters, and a language
// that already has a file on any surface, before writing anything. Then it writes:
//   - web/src/locales/<code>.json as {} (unlisted, so work in progress),
//   - an empty entry in the service worker's table (web/public/push-sw.js),
//   - extension/_locales/<code>/messages.json: the English values, each description
//     starting "TODO translate" (the store packages leave the folder out until then),
//   - mobile/android/app/src/main/res/values-<code>/strings.xml with no strings,
//   - internal/mail/templates/*.<code>.txt: English copies whose first line is
//     "# TODO translate" (the mail test refuses one for a listed language),
//   - web/src/lib/nlp/vocab/<code>.ts: an empty quick-add vocabulary, not bundled,
//   - a commented row in docs/translating.md's maintainer table.
// It never edits SHIPPED, mail.Languages, the channel message table or
// quickadd.Bundled: listing the language is the contributor's deliberate last step.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { channelRows, shippedLanguages, workerTexts } from './status.mjs'

export const repo = fileURLToPath(new URL('../..', import.meta.url))

const RES = 'mobile/android/app/src/main/res'
const TEMPLATES = 'internal/mail/templates'
const VOCAB = 'web/src/lib/nlp/vocab'
const DOC = 'docs/translating.md'

/** Why a code cannot be scaffolded, or null. */
export function refusal(root, code, name) {
  if (!/^[a-z]{2,3}$/.test(code ?? '')) return `"${code ?? ''}" is not a language code: use two or three lowercase letters (ISO 639), such as sv or fil`
  if (!name || !name.trim()) return 'name the language in the language itself, such as "Svenska"'
  const found = []
  const rel = (p) => existsSync(join(root, p)) && found.push(p)
  if (code === 'en') found.push('English is the source language')
  if (shippedLanguages(root).some((l) => l.code === code)) found.push('SHIPPED in web/src/locales/index.ts')
  rel(`web/src/locales/${code}.json`)
  rel(`extension/_locales/${code}`)
  rel(`${RES}/values-${code}`)
  rel(`${VOCAB}/${code}.ts`)
  if (existsSync(join(root, TEMPLATES))) {
    found.push(...readdirSync(join(root, TEMPLATES)).filter((f) => f.endsWith(`.${code}.txt`)).map((f) => `${TEMPLATES}/${f}`))
  }
  if (workerTexts(root)[code]) found.push(`the ${code} entry in web/public/push-sw.js`)
  if (channelRows(root)[code]) found.push(`the ${code} row in internal/channels/messages.go`)
  return found.length ? `${code} already exists: ${found.join(', ')}` : null
}

/** An empty value of the same shape: lists emptied, word maps emptied, fixed-key groups kept with empty lists. */
function emptied(v) {
  if (Array.isArray(v)) return v.every((x) => typeof x === 'string') ? [] : v.map(emptied)
  if (v && typeof v === 'object') {
    const values = Object.values(v)
    // { morning: [...] } keeps its keys; { today: 0 } and { noon: '12:00' } are word maps.
    if (values.length && values.every(Array.isArray)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, emptied(x)]))
    return {}
  }
  if (typeof v === 'boolean') return false
  return v
}

const quote = (s) => `'${String(s).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
const key = (k) => (/^[A-Za-z_]\w*$/.test(k) ? k : quote(k))
function print(v, indent) {
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    if (v.every((x) => Array.isArray(x) && x.length === 0)) return `[${v.map(() => '[]').join(', ')}]`
    return `[\n${v.map((x) => `${indent}  ${print(x, `${indent}  `)},`).join('\n')}\n${indent}]`
  }
  if (v && typeof v === 'object') {
    const entries = Object.entries(v)
    if (entries.length === 0) return '{}'
    return `{ ${entries.map(([k, x]) => `${key(k)}: ${print(x, indent)}`).join(', ')} }`
  }
  return typeof v === 'string' ? quote(v) : String(v)
}

/** The empty vocabulary file for a language, shaped like English's. */
export function vocabularyStub(root, code, name) {
  const src = readFileSync(join(root, VOCAB, 'en.ts'), 'utf8')
    .replace(/^import type .*$/m, '')
    .replace(/export const en: Vocabulary =/, 'result =')
  const ctx = { result: null }
  runInNewContext(src, ctx)
  const fields = Object.fromEntries(Object.entries(ctx.result).map(([k, v]) => [k, emptied(v)]))
  const vocab = { ...fields, code, dayMonthOrder: 'DM' }
  const lines = Object.entries(vocab).map(([k, v]) => `  ${key(k)}: ${print(v, '  ')},`)
  return [
    `// ${name} (${code}) quick-add vocabulary: an empty stub written by scripts/i18n/new-language.mjs.`,
    '// It is not bundled: fill each list with the words people type (lower case), then',
    '// follow "Writing a quick-add vocabulary" in docs/translating.md to bundle it.',
    "import type { Vocabulary } from './types'",
    '',
    `export const ${code}: Vocabulary = {`,
    ...lines,
    '}',
    '',
  ].join('\n')
}

/** The service worker with an empty entry for the language at the end of its table. */
export function workerWithEntry(text, code) {
  const end = /\n {2}\}\n {2}self\.__opentodoText = /.exec(text)
  if (!end) throw new Error('web/public/push-sw.js: the end of the OWN_TEXT table was not found')
  return `${text.slice(0, end.index)}\n    ${code}: {},${text.slice(end.index)}`
}

/** The extension's English messages with every description starting "TODO translate". */
export function extensionStub(en) {
  return Object.fromEntries(Object.entries(en).map(([k, e]) => [k, { ...e, description: `TODO translate. ${e.description ?? ''}`.trim() }]))
}

/** docs/translating.md with a commented row for the language under the maintainer table. */
export function docWithRow(text, code, name) {
  const at = text.indexOf('## Maintainers')
  if (at < 0) throw new Error(`${DOC}: no "## Maintainers" section`)
  const lines = text.slice(at).split('\n')
  let last = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('|')) last = i
    else if (last >= 0) break
  }
  if (last < 0) throw new Error(`${DOC}: the Maintainers section has no table`)
  lines.splice(last + 1, 0, `<!-- | ${name} | \`${code}\` | community | your GitHub name | — add this row when the catalog is listed -->`)
  return text.slice(0, at) + lines.join('\n')
}

/** Every file to write for the language: [relative path, contents]. Throws on a refusal. */
export function plan(root, code, name) {
  const why = refusal(root, code, name)
  if (why) throw new Error(why)
  const files = [[`web/src/locales/${code}.json`, '{}\n']]
  files.push(['web/public/push-sw.js', workerWithEntry(readFileSync(join(root, 'web/public/push-sw.js'), 'utf8'), code)])
  const en = JSON.parse(readFileSync(join(root, 'extension/_locales/en/messages.json'), 'utf8'))
  files.push([`extension/_locales/${code}/messages.json`, `${JSON.stringify(extensionStub(en), null, 2)}\n`])
  files.push([`${RES}/values-${code}/strings.xml`, [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<!-- ${name}: translate each string of values/strings.xml here (scripts/i18n/new-language.mjs). -->`,
    '<resources>',
    '</resources>',
    '',
  ].join('\n')])
  for (const f of readdirSync(join(root, TEMPLATES)).filter((f) => f.endsWith('.en.txt')).sort()) {
    const text = readFileSync(join(root, TEMPLATES, f), 'utf8')
    files.push([`${TEMPLATES}/${f.slice(0, -'.en.txt'.length)}.${code}.txt`, `# TODO translate\n${text}`])
  }
  files.push([`${VOCAB}/${code}.ts`, vocabularyStub(root, code, name)])
  files.push([DOC, docWithRow(readFileSync(join(root, DOC), 'utf8'), code, name)])
  return files
}

/** Scaffold the language under `root`; returns the paths written. Writes nothing on a refusal. */
export function scaffold(root, code, name) {
  const files = plan(root, code, name)
  for (const [rel, text] of files) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  return files.map(([rel]) => rel)
}

export const nextSteps = (code, name) => `
Next, by hand:
  1. Translate web/src/locales/${code}.json (every key of messages.json) and the files above;
     \`make i18n-status\` shows how far each surface is.
  2. The channel messages: a "${code}" row in internal/channels/messages.go.
  3. List the language: { code: '${code}', name: '${name}' } in SHIPPED (web/src/locales/index.ts),
     with community: true for a community language (90 % of the web catalog and a maintainer).
     A maintained language also goes into mail.Languages (internal/mail/message.go), with its
     plural units and role names, and every surface must be complete.
  4. Quick add, optional: fill web/src/lib/nlp/vocab/${code}.ts, add it to VOCABULARIES,
     run \`npm run nlp:vocab\`, add "${code}" to quickadd.Bundled and rows to quickadd.vectors.json.
  5. The iOS shell (mobile/ios/Shared/Localizable.xcstrings) and the Obsidian plugin
     (obsidian/locales/) are translated in their own catalogs.
  6. Uncomment your row in docs/translating.md and name the reviewer in the pull request.
`

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2)
  const i = args.indexOf('--root')
  const root = i >= 0 ? args.splice(i, 2)[1] : repo
  const [code, name] = args
  try {
    for (const rel of scaffold(root, code, name)) console.log(`  wrote ${rel}`)
    console.log(nextSteps(code, name))
  } catch (err) {
    console.error(`new-language: ${err.message}`)
    process.exit(1)
  }
}
