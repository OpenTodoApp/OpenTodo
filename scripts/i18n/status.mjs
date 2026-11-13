// How far every language is on every surface (OpenSpec change more-languages,
// design D5), for `make i18n-status`. Read-only, standard library only, never part
// of `make check`: it prints a table of language × surface with translated / total
// and the first missing keys, and always exits 0.
//
//   node scripts/i18n/status.mjs [--root <dir>] [--json]
//
// The surfaces, each counted against its English source:
//   web          web/src/locales/<code>.json against messages.json
//   notifications the service worker's table in web/public/push-sw.js
//   extension    extension/_locales/<code>/messages.json (a "TODO translate" description is untranslated)
//   android      mobile/android/app/src/main/res/values-<code>/strings.xml
//   ios          the iOS shell's String Catalog, mobile/ios/Shared/Localizable.xcstrings
//   emails       internal/mail/templates/*.<code>.txt (a "# TODO translate" first line is untranslated)
//   channels     the language's row in internal/channels/messages.go
//   vocabulary   web/src/lib/nlp/vocab/<code>.ts: the fields that hold a word
//   obsidian     obsidian/locales/<code>.json (optional)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'

export const repo = fileURLToPath(new URL('../..', import.meta.url))

export const SURFACES = ['web', 'notifications', 'extension', 'android', 'ios', 'emails', 'channels', 'vocabulary', 'obsidian']

const read = (root, rel) => readFileSync(join(root, rel), 'utf8')
const json = (root, rel) => JSON.parse(read(root, rel))
const has = (root, rel) => existsSync(join(root, rel))
const CODE = /^[a-z]{2,3}$/

/** SHIPPED in web/src/locales/index.ts: every listed code and whether it is a community language. */
export function shippedLanguages(root = repo) {
  if (!has(root, 'web/src/locales/index.ts')) return []
  return [...read(root, 'web/src/locales/index.ts').matchAll(/\{ code: '([a-z]{2,3})', name: '([^']*)'[^}]*\}/g)]
    .map((m) => ({ code: m[1], name: m[2], community: m[0].includes('community: true') }))
}

/** A surface's state for one language: { total, translated, missing[] }, or null when the language has none. */
const tally = (keys, done) => {
  const missing = keys.filter((k) => !done(k))
  return { total: keys.length, translated: keys.length - missing.length, missing }
}

export function webSurface(root, code) {
  if (!has(root, `web/src/locales/${code}.json`)) return null
  const keys = Object.keys(json(root, 'web/src/locales/messages.json'))
  const catalog = json(root, `web/src/locales/${code}.json`)
  return tally(keys, (k) => typeof catalog[k] === 'string' && catalog[k].trim() !== '')
}

/** The service worker's own texts per language (the table it exposes as self.__opentodoText). */
export function workerTexts(root = repo) {
  if (!has(root, 'web/public/push-sw.js')) return {}
  const self = { addEventListener() {}, navigator: { languages: [] } }
  runInNewContext(read(root, 'web/public/push-sw.js'), { self, fetch() {}, indexedDB: undefined, Intl, console })
  return self.__opentodoText ?? {}
}

export function notificationsSurface(root, code, texts = workerTexts(root)) {
  if (!texts[code]) return null
  return tally(Object.keys(texts.en ?? {}), (k) => typeof texts[code][k] === 'string' && texts[code][k] !== '')
}

export function extensionSurface(root, code) {
  if (!has(root, `extension/_locales/${code}/messages.json`)) return null
  const en = json(root, 'extension/_locales/en/messages.json')
  const msgs = json(root, `extension/_locales/${code}/messages.json`)
  return tally(Object.keys(en), (k) => msgs[k]?.message?.trim() && !String(msgs[k].description ?? '').startsWith('TODO translate'))
}

const RES = 'mobile/android/app/src/main/res'
/** The translatable string names of an Android strings.xml. */
export const androidNames = (xml) => [...xml.matchAll(/<string name="([^"]+)"([^>]*)>/g)].filter((m) => !/translatable="false"/.test(m[2])).map((m) => m[1])

export function androidSurface(root, code) {
  if (!has(root, `${RES}/values-${code}/strings.xml`)) return null
  const own = new Set(androidNames(read(root, `${RES}/values-${code}/strings.xml`)))
  return tally(androidNames(read(root, `${RES}/values/strings.xml`)), (k) => own.has(k))
}

const XCSTRINGS = 'mobile/ios/Shared/Localizable.xcstrings'
export function iosSurface(root, code) {
  if (!has(root, XCSTRINGS)) return null
  const strings = json(root, XCSTRINGS).strings ?? {}
  if (!Object.values(strings).some((e) => e.localizations?.[code])) return null
  return tally(Object.keys(strings), (k) => strings[k].localizations?.[code]?.stringUnit?.state === 'translated')
}

const TEMPLATES = 'internal/mail/templates'
export function emailsSurface(root, code) {
  if (!has(root, TEMPLATES)) return null
  const files = readdirSync(join(root, TEMPLATES))
  const kinds = files.filter((f) => f.endsWith('.en.txt')).map((f) => f.slice(0, -'.en.txt'.length)).sort()
  if (!files.some((f) => f.endsWith(`.${code}.txt`))) return null
  return tally(kinds, (k) => files.includes(`${k}.${code}.txt`) && !read(root, `${TEMPLATES}/${k}.${code}.txt`).startsWith('# TODO translate'))
}

/** The rows of the channel message table: code → the keys it sets. */
export function channelRows(root = repo) {
  if (!has(root, 'internal/channels/messages.go')) return {}
  const src = read(root, 'internal/channels/messages.go')
  const table = /var texts = map\[string\]map\[string\]string\{([\s\S]*?)\n\}/.exec(src)?.[1] ?? ''
  const rows = {}
  for (const m of table.matchAll(/\n\t"([a-z]{2,3})": \{([\s\S]*?)\n\t\},/g)) {
    rows[m[1]] = [...m[2].matchAll(/(txt\w+):\s*"((?:[^"\\]|\\.)*)"/g)].filter((k) => k[2] !== '').map((k) => k[1])
  }
  return rows
}

export function channelsSurface(root, code, rows = channelRows(root)) {
  if (!rows[code]) return null
  const own = new Set(rows[code])
  return tally(rows.en ?? [], (k) => own.has(k))
}

const VOCAB = 'web/src/lib/nlp/vocab'
/**
 * The top-level fields of a vocabulary file that hold words, and whether each one
 * holds any. Flags and numbers (`hourSuffixH: false`, `dayMonthOrder: 'DM'`) are not
 * words and are left out.
 */
export function vocabularyFields(text) {
  const body = /: Vocabulary = \{([\s\S]*)\n\}/.exec(text)?.[1] ?? ''
  const fields = {}
  let depth = 0, name = null
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '')
    const m = depth === 0 ? /^ {2}(\w+):\s?(.*)$/.exec(line) : null
    if (m) fields[name = m[1]] = m[2]
    else if (name) fields[name] += `\n${line}`
    for (const ch of line.replace(/'(?:[^'\\]|\\.)*'/g, "''")) {
      if ('{[('.includes(ch)) depth++
      else if ('}])'.includes(ch)) depth--
    }
  }
  delete fields.code
  const out = {}
  for (const [k, v] of Object.entries(fields)) {
    const flat = v.replace(/\s+/g, '').replace(/,$/, '')
    if (/^(true|false|-?\d+|'[A-Z]{2}')$/.test(flat)) continue
    // Group names (`units: { day: [] }`) are not words; a word map's keys are (`{ today: 0 }`).
    out[k] = !/^[[\]{},]*$/.test(flat.replace(/('[^']*'|\w+):(?=[[{])/g, ''))
  }
  return out
}

/** The quick-add languages the Go parser bundles (internal/quickadd/vocab.go). */
export function bundledVocabularies(root = repo) {
  if (!has(root, 'internal/quickadd/vocab.go')) return []
  const list = /var Bundled = \[\]string\{([^}]*)\}/.exec(read(root, 'internal/quickadd/vocab.go'))?.[1] ?? ''
  return [...list.matchAll(/"([a-z]{2,3})"/g)].map((m) => m[1])
}

/**
 * A vocabulary's fields that hold words, against English's. A bundled vocabulary is
 * complete: the shared vectors pin it, and a field it leaves empty is empty on purpose
 * (German has no "next" word after a weekday). A stub counts its filled fields.
 */
export function vocabularySurface(root, code, bundled = bundledVocabularies(root)) {
  if (!has(root, `${VOCAB}/${code}.ts`)) return null
  const en = Object.entries(vocabularyFields(read(root, `${VOCAB}/en.ts`))).filter(([, words]) => words).map(([k]) => k)
  if (bundled.includes(code)) return tally(en, () => true)
  const own = vocabularyFields(read(root, `${VOCAB}/${code}.ts`))
  return tally(en, (k) => own[k] === true)
}

export function obsidianSurface(root, code) {
  if (!has(root, `obsidian/locales/${code}.json`) || !has(root, 'obsidian/locales/en.json')) return null
  const catalog = json(root, `obsidian/locales/${code}.json`)
  return tally(Object.keys(json(root, 'obsidian/locales/en.json')), (k) => typeof catalog[k] === 'string' && catalog[k].trim() !== '')
}

/** Every language other than English found on any surface. */
export function languagesOnDisk(root = repo, texts = workerTexts(root), rows = channelRows(root)) {
  const codes = new Set(shippedLanguages(root).map((l) => l.code))
  const add = (list) => list.filter((c) => CODE.test(c)).forEach((c) => codes.add(c))
  const ls = (rel) => (has(root, rel) ? readdirSync(join(root, rel)) : [])
  add(ls('web/src/locales').filter((f) => f.endsWith('.json') && f !== 'messages.json').map((f) => f.slice(0, -5)))
  add(ls('extension/_locales'))
  add(ls(RES).filter((d) => d.startsWith('values-')).map((d) => d.slice('values-'.length)))
  add(ls(TEMPLATES).map((f) => f.split('.')[1] ?? ''))
  add(ls(VOCAB).filter((f) => f.endsWith('.ts')).map((f) => f.slice(0, -3)))
  add(Object.keys(texts))
  add(Object.keys(rows))
  codes.delete('en')
  return [...codes].sort()
}

/** The status of every language: { code, tier, surfaces: { web: {total, translated, missing} | null, … } }. */
export function status(root = repo) {
  const texts = workerTexts(root)
  const rows = channelRows(root)
  const shipped = shippedLanguages(root)
  return languagesOnDisk(root, texts, rows).map((code) => {
    const listed = shipped.find((l) => l.code === code)
    return {
      code,
      tier: !listed ? 'work in progress' : listed.community ? 'community' : 'maintained',
      surfaces: {
        web: webSurface(root, code),
        notifications: notificationsSurface(root, code, texts),
        extension: extensionSurface(root, code),
        android: androidSurface(root, code),
        ios: iosSurface(root, code),
        emails: emailsSurface(root, code),
        channels: channelsSurface(root, code, rows),
        vocabulary: vocabularySurface(root, code),
        obsidian: obsidianSurface(root, code),
      },
    }
  })
}

const cell = (s) => (s ? `${s.translated}/${s.total}` : '—')

/** The report as text: the table, then the first missing keys of each incomplete surface. */
export function format(rows, { firstMissing = 3 } = {}) {
  const head = ['language', 'tier', ...SURFACES]
  const body = rows.map((r) => [r.code, r.tier, ...SURFACES.map((s) => cell(r.surfaces[s]))])
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)))
  const line = (cols) => cols.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd()
  const out = [line(head), line(widths.map((w) => '-'.repeat(w))), ...body.map(line)]
  const details = []
  for (const r of rows) {
    for (const s of SURFACES) {
      const st = r.surfaces[s]
      if (!st || st.missing.length === 0) continue
      const more = st.missing.length > firstMissing ? `, and ${st.missing.length - firstMissing} more` : ''
      details.push(`${r.code} ${s}: ${st.missing.slice(0, firstMissing).map((k) => JSON.stringify(k)).join(', ')}${more}`)
    }
  }
  if (details.length) out.push('', 'Missing:', ...details.map((d) => `  ${d}`))
  out.push('', '— means the language has no file on that surface; it shows English there.')
  return out.join('\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--root')
  const root = i > 0 ? process.argv[i + 1] : repo
  const rows = status(root)
  console.log(process.argv.includes('--json') ? JSON.stringify(rows, null, 2) : format(rows))
}
