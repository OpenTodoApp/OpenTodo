// The Obsidian plugin's own strings (OpenSpec change obsidian-plugin, task 6.1):
// obsidian/src calls tr('English text'), and obsidian/locales/<lang>.json maps
// each message to its translation in the six shipped languages. Checked here,
// inside `make i18n-check`, like the iOS shell's catalog:
//   - every tr() message has an entry in every catalog, and no entry is stale,
//   - no entry is empty, and every message and translation parses,
//   - a translation has the same placeholders and plural arguments as its source.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { calleeName, literalsOf, parse, repo, ts, walk } from './source.mjs'

export const obsidianDir = (root = repo) => join(root, 'obsidian')

/** The plugin's languages, read from the catalogues it actually ships (English first). */
export function obsidianLanguages(root = repo) {
  const dir = join(obsidianDir(root), 'locales')
  const codes = existsSync(dir)
    ? readdirSync(dir).filter((f) => /^[a-z]{2}\.json$/.test(f)).map((f) => f.slice(0, -5))
    : []
  return ['en', ...codes.filter((c) => c !== 'en').sort()]
}

export const OBSIDIAN_LANGS = obsidianLanguages()

/** A catalogue on disk that the plugin's source never imports cannot be selected. */
export function checkObsidianSource(root = repo) {
  const text = readFileSync(join(obsidianDir(root), 'src/strings.ts'), 'utf8')
  const imported = [...text.matchAll(/from '\.\.\/locales\/([a-z]{2})\.json'/g)].map((m) => m[1])
  return obsidianLanguages(root)
    .filter((l) => !imported.includes(l))
    .map((l) => `obsidian ${l}: obsidian/locales/${l}.json is not imported by src/strings.ts`)
}

/** The tr() messages of one source text. */
export function trMessagesIn(file, text) {
  const sf = parse(file, text)
  const out = []
  const visit = (n) => {
    if (ts.isCallExpression(n) && calleeName(n) === 'tr') out.push(...literalsOf(n.arguments[0]))
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/** Every tr() message of the plugin's sources (tests and shims excluded). */
export function obsidianMessages(root = repo) {
  const src = join(obsidianDir(root), 'src')
  const files = walk(src).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.includes('/shims/'))
  return [...new Set(files.flatMap((f) => trMessagesIn(f, readFileSync(f, 'utf8'))))].sort()
}

/** Problems of the plugin's catalogs against its messages; `fmt` is the web formatter. */
export function checkObsidianCatalogs(messages, catalogs, fmt) {
  const problems = []
  for (const lang of OBSIDIAN_LANGS) {
    const catalog = catalogs[lang]
    if (!catalog) {
      problems.push(`obsidian ${lang}: obsidian/locales/${lang}.json is missing`)
      continue
    }
    for (const id of messages) if (!(id in catalog)) problems.push(`obsidian ${lang}: missing "${id}"`)
    for (const [id, value] of Object.entries(catalog)) {
      if (!messages.includes(id)) { problems.push(`obsidian ${lang}: unused "${id}"`); continue }
      if (typeof value !== 'string' || !value.trim()) { problems.push(`obsidian ${lang}: empty "${id}"`); continue }
      let src, tr
      try { src = fmt.messageShape(id) } catch (err) { problems.push(`obsidian source: malformed "${id}": ${err.message}`); continue }
      try { tr = fmt.messageShape(value) } catch (err) { problems.push(`obsidian ${lang}: malformed "${id}": ${err.message}`); continue }
      if (src.args.join() !== tr.args.join()) problems.push(`obsidian ${lang}: placeholders of "${id}" are {${tr.args.join('}, {')}}, the source has {${src.args.join('}, {')}}`)
      const plural = new Set([...new Intl.PluralRules(lang).resolvedOptions().pluralCategories, 'other'])
      for (const [arg, cats] of Object.entries(tr.plurals)) {
        const bad = cats.filter((c) => !c.startsWith('=') && !plural.has(c))
        if (bad.length) problems.push(`obsidian ${lang}: plural "${arg}" of "${id}" uses ${bad.join(', ')}, which ${lang} does not have`)
        if (!cats.includes('other')) problems.push(`obsidian ${lang}: plural "${arg}" of "${id}" has no "other"`)
      }
    }
  }
  return problems
}

export function readObsidianCatalogs(root = repo) {
  const out = {}
  for (const lang of obsidianLanguages(root)) {
    const p = join(obsidianDir(root), 'locales', `${lang}.json`)
    if (existsSync(p)) out[lang] = JSON.parse(readFileSync(p, 'utf8'))
  }
  return out
}
