// Catalog check (OpenSpec change app-localization, design D8), run by
// `make i18n-check` inside `make check`. For every catalog in web/src/locales/:
//   - every source message has an entry (missing) and no entry is stale (unused),
//   - every source message and translation parses (malformed),
//   - a translation has the same placeholders, tags and plural/select arguments as
//     its source, and only plural categories its language has,
//   - "Settings → …" paths use the translated section names.
// Also the iOS shell's String Catalog (scripts/i18n/shell.mjs) and the Obsidian
// plugin's catalogues (scripts/i18n/obsidian.mjs).
// A catalog that index.ts does not list is work in progress: it gets a summary line
// ("pl: 412 of 1480") and never fails the check. A community language
// (`community: true`, OpenSpec change more-languages D4) may miss messages while it
// is at least 90 % complete and has a maintainer in docs/translating.md; below that
// it fails. A maintained language is also complete outside the web app: the Android
// shell's strings, the iOS shell's catalog and mail.Languages.
//
//   node scripts/i18n-check.mjs            (exit 1 with one line per problem)
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { extract } from './i18n/extract.mjs'
import { checkShellCatalog, readShellCatalog, shellCatalogPath } from './i18n/shell.mjs'
import { checkObsidianCatalogs, checkObsidianSource, obsidianDir, obsidianMessages, readObsidianCatalogs } from './i18n/obsidian.mjs'
import { repo, ts } from './i18n/source.mjs'
import { androidSurface, shippedLanguages } from './i18n/status.mjs'

/** The share of the web catalog a community language needs (design D4). */
export const COMMUNITY_THRESHOLD = 0.9

/** The shipped language codes, read from web/src/locales/index.ts. */
export function shippedCodes(root = repo) {
  return shippedLanguages(root).map((l) => l.code)
}

/** The shipped codes marked `community: true`. */
export function communityCodes(root = repo) {
  return shippedLanguages(root).filter((l) => l.community).map((l) => l.code)
}

/** The codes in docs/translating.md's maintainer table (its uncommented rows). */
export function maintainedInGuide(root = repo) {
  const path = join(root, 'docs/translating.md')
  if (!existsSync(path)) return []
  const text = readFileSync(path, 'utf8')
  const section = text.slice(text.indexOf('## Maintainers')).split(/\n## /)[0]
  return [...section.matchAll(/^\|[^|\n]*\|([^|\n]*)\|/gm)].flatMap((m) => [...m[1].matchAll(/`([a-z]{2,3})`/g)].map((c) => c[1]))
}

/**
 * A community catalog's coverage against the threshold: a failing problem below it,
 * else summary lines naming the missing messages. `missing` are the ids it lacks.
 */
export function communityCoverage(lang, missing, total, { maintained = true, first = 5 } = {}) {
  const done = total - missing.length
  const pct = total ? (done / total) * 100 : 100
  const shown = `${pct.toFixed(1)} % (${done} of ${total})`
  const problems = []
  const summary = []
  if (done < COMMUNITY_THRESHOLD * total) problems.push(`${lang}: community catalog is ${shown} translated, below the ${COMMUNITY_THRESHOLD * 100} % a community language needs`)
  if (!maintained) problems.push(`${lang}: community language without a maintainer in docs/translating.md`)
  if (!problems.length) {
    const more = missing.length > first ? `, and ${missing.length - first} more` : ''
    summary.push(`${lang}: ${shown} (community)${missing.length ? `, missing ${missing.slice(0, first).map((m) => JSON.stringify(m)).join(', ')}${more}` : ''}`)
  }
  return { problems, summary }
}

/** The formatter's parser, compiled from web/src/lib/i18n/format.ts with the TypeScript API. */
export async function loadFormat(root = repo) {
  const src = readFileSync(join(root, 'web/src/lib/i18n/format.ts'), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

const SETTINGS_PATH = /Settings → ([A-Z][\w-]*(?: [\w-]+)*)/g
// Paths in an operating system's own settings ("On Android, check Settings → Apps …")
// use that system's wording in each language, not the app's section names.
const OS_SETTINGS = /\bOn (Android|Windows|iPhone|macOS)\b|\bSystem Settings\b/

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
    if (typeof value !== 'string' || OS_SETTINGS.test(id)) continue
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
  const community = communityCodes(root)
  const maintained = shipped.filter((c) => !community.includes(c))
  // The digest card offers the maintained languages, and the server validates the
  // digest's language against mail.Languages: every maintained language has its
  // email templates, and the server has none the web app does not list. A
  // community language may have them or not; without them its emails are English.
  const mailPath = join(root, 'internal/mail/message.go')
  if (existsSync(mailPath)) {
    const mailText = readFileSync(mailPath, 'utf8')
    const mail = [...(/var Languages = \[\]string\{([^}]*)\}/.exec(mailText)?.[1] ?? '').matchAll(/"([a-z-]+)"/g)].map((m) => m[1])
    for (const c of maintained) if (!mail.includes(c)) problems.push(`${c}: maintained in SHIPPED but missing from mail.Languages (${mail})`)
    for (const c of mail) if (!shipped.includes(c)) problems.push(`${c}: in mail.Languages but not in SHIPPED (${shipped})`)
  }
  const guide = maintainedInGuide(root)
  const summary = []
  const dir = join(root, 'web/src/locales')
  for (const file of readdirSync(dir).filter((f) => /^[a-z]{2,3}\.json$/.test(f))) {
    const lang = file.slice(0, -5)
    const catalog = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    const found = checkCatalog(lang, catalog, messages, fmt)
    if (community.includes(lang)) {
      // Missing messages are shown in English; every other problem still fails.
      problems.push(...found.filter((p) => !p.startsWith(`${lang}: missing "`)))
      const c = communityCoverage(lang, messages.filter((m) => !(m in catalog)), messages.length, { maintained: guide.includes(lang) })
      problems.push(...c.problems)
      summary.push(...c.summary)
    } else if (shipped.includes(lang)) problems.push(...found)
    else summary.push(`${lang}: ${messages.filter((m) => m in catalog).length} of ${messages.length} (work in progress, not offered)`)
  }
  for (const lang of shipped) {
    if (lang !== 'en' && !readdirSync(dir).includes(`${lang}.json`)) problems.push(`${lang}: listed in index.ts but web/src/locales/${lang}.json is missing`)
  }
  // The Android shell's own strings: every maintained language has all of them.
  if (existsSync(join(root, 'mobile/android/app/src/main/res/values/strings.xml'))) {
    for (const lang of maintained.filter((c) => c !== 'en')) {
      const a = androidSurface(root, lang)
      if (!a) problems.push(`android ${lang}: mobile/android/app/src/main/res/values-${lang}/strings.xml is missing`)
      else for (const k of a.missing) problems.push(`android ${lang}: missing "${k}"`)
    }
  }
  // The iOS shell's own screens (ios-shell): a String Catalog, not a web catalog.
  // Maintained languages are required; a community language may be partly there.
  if (existsSync(shellCatalogPath(root))) {
    problems.push(...checkShellCatalog(readShellCatalog(root), maintained.filter((c) => c !== 'en'), community))
  }
  // The Obsidian plugin's own strings (obsidian-plugin task 6.1): obsidian/locales/.
  if (existsSync(join(obsidianDir(root), 'src'))) {
    problems.push(...checkObsidianCatalogs(obsidianMessages(root), readObsidianCatalogs(root), fmt))
    problems.push(...checkObsidianSource(root))
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

