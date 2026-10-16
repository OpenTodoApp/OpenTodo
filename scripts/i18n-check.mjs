// Catalog check (OpenSpec change app-localization, design D8), run by
// `make i18n-check` inside `make check`. For every catalog in web/src/locales/:
//   - every source message has an entry (missing) and no entry is stale (unused),
//   - every source message and translation parses (malformed),
//   - a translation has the same placeholders, tags and plural/select arguments as
//     its source, and only plural categories its language has,
//   - "Settings → …" paths use the translated section names.
// A catalog that index.ts does not list is work in progress: it gets a summary line
// ("pl: 412 of 1480") and never fails the check.
//
//   node scripts/i18n-check.mjs            (exit 1 with one line per problem)
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extract } from './i18n/extract.mjs'
import { repo, ts } from './i18n/source.mjs'

/** The shipped language codes, read from web/src/locales/index.ts. */
export function shippedCodes(root = repo) {
  const text = readFileSync(join(root, 'web/src/locales/index.ts'), 'utf8')
  return [...text.matchAll(/\{ code: '([a-z]{2,3})'/g)].map((m) => m[1])
}

/** The formatter's parser, compiled from web/src/lib/i18n/format.ts with the TypeScript API. */
export async function loadFormat(root = repo) {
  const src = readFileSync(join(root, 'web/src/lib/i18n/format.ts'), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

const SETTINGS_PATH = /Settings → ([A-Z][\w-]*(?: [\w-]+)*)/g

/**
 * Problems of one catalog against the source messages.
 * `sections` maps English section names to their translations in this catalog.
 */
export function checkCatalog(lang, catalog, messages, fmt) {
  const problems = []
  const ids = new Set(messages)
  const plural = new Set([...new Intl.PluralRules(lang).resolvedOptions().pluralCategories, 'other'])
  const base = (id) => id.replace(/\|[\w-]+$/, '')
  for (const id of messages) if (!(id in catalog)) problems.push(`${lang}: missing "${id}"`)
  for (const [id, value] of Object.entries(catalog)) {
    if (!ids.has(id)) { problems.push(`${lang}: unused "${id}"`); continue }
    if (typeof value !== 'string' || !value.trim()) { problems.push(`${lang}: empty "${id}"`); continue }
    let src, tr
    try { src = fmt.messageShape(base(id)) } catch (err) { problems.push(`source: malformed "${id}": ${err.message}`); continue }
    try { tr = fmt.messageShape(value) } catch (err) { problems.push(`${lang}: malformed "${id}": ${err.message}`); continue }
    if (src.args.join() !== tr.args.join()) problems.push(`${lang}: placeholders of "${id}" are {${tr.args.join('}, {')}}, the source has {${src.args.join('}, {')}}`)
    if (src.tags.join() !== tr.tags.join()) problems.push(`${lang}: tags of "${id}" are <${tr.tags.join('>, <')}>, the source has <${src.tags.join('>, <')}>`)
    for (const [arg, cats] of Object.entries(tr.plurals)) {
      const bad = cats.filter((c) => !c.startsWith('=') && !plural.has(c))
      if (bad.length) problems.push(`${lang}: plural "${arg}" of "${id}" uses ${bad.join(', ')}, which ${lang} does not have`)
      if (!cats.includes('other')) problems.push(`${lang}: plural "${arg}" of "${id}" has no "other"`)
    }
  }
  // "Settings → Security → …": the section and panel names must be the catalog's own.
  const settings = catalog.Settings
  for (const id of messages) {
    const value = catalog[id]
    if (typeof value !== 'string') continue
    for (const m of id.matchAll(SETTINGS_PATH)) {
      const first = m[1].split(' → ')[0]
      const section = catalog[first]
      if (settings && !value.includes(settings)) problems.push(`${lang}: "${id}" names Settings, but its translation does not say "${settings}"`)
      else if (section && !value.includes(section)) problems.push(`${lang}: "${id}" names the section ${first}, but its translation does not say "${section}"`)
    }
  }
  return problems
}

/** Every problem across the catalogs, plus summary lines for work-in-progress ones. */
export async function check(root = repo) {
  const fmt = await loadFormat(root)
  const messages = [...extract(root).keys()]
  const problems = []
  for (const id of messages) {
    try { fmt.parseMessage(id.replace(/\|[\w-]+$/, '')) } catch (err) { problems.push(`source: malformed "${id}": ${err.message}`) }
  }
  const shipped = shippedCodes(root)
  const summary = []
  const dir = join(root, 'web/src/locales')
  for (const file of readdirSync(dir).filter((f) => /^[a-z]{2,3}\.json$/.test(f))) {
    const lang = file.slice(0, -5)
    const catalog = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    const found = checkCatalog(lang, catalog, messages, fmt)
    if (shipped.includes(lang)) problems.push(...found)
    else summary.push(`${lang}: ${messages.filter((m) => m in catalog).length} of ${messages.length} (work in progress, not offered)`)
  }
  for (const lang of shipped) {
    if (lang !== 'en' && !readdirSync(dir).includes(`${lang}.json`)) problems.push(`${lang}: listed in index.ts but web/src/locales/${lang}.json is missing`)
  }
  return { problems, summary, count: messages.length }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { problems, summary, count } = await check()
  for (const line of summary) console.log(`i18n-check: ${line}`)
  if (problems.length) {
    console.error(`i18n-check: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    process.exit(1)
  }
  console.log(`i18n-check: ok (${count} messages, every shipped catalog complete)`)
}

