// Catalog check for the interface translations (OpenSpec `app-localization`,
// design D8), run by `make i18n-check` inside `make check`:
//   - web/src/locales/messages.json matches the messages in the code,
//   - every source and translated message parses (the formatter's ICU subset),
//   - each shipped catalog (web/src/locales/index.ts) has every message and no
//     unused key, with the same placeholders, tags and select options,
//   - a catalog that is not shipped yet is work in progress: one summary line.
//
//   node scripts/i18n-check.mjs        (exit 1 with one line per problem)
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractAll, messagesPath, repo, ts } from './i18n/extract.mjs'

const localesDir = join(repo, 'web', 'src', 'locales')

/** Loads the TypeScript formatter (web/src/lib/i18n/format.ts) without a build step. */
export async function loadFormatter() {
  const src = readFileSync(join(repo, 'web', 'src', 'lib', 'i18n', 'format.ts'), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

/** The shipped language codes listed in web/src/locales/index.ts. */
export function shippedLanguages(text = readFileSync(join(localesDir, 'index.ts'), 'utf8')) {
  const m = /SHIPPED_LANGUAGES[^=]*=\s*\[([^\]]*)\]/.exec(text)
  return m ? [...m[1].matchAll(/['"]([\w-]+)['"]/g)].map((x) => x[1]) : []
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Problems and summary lines for the given messages and catalogs.
 * catalogs: { lang: { key: translation } }.
 */
export function checkCatalogs({ messages, catalogs, shipped, formatter }) {
  const problems = []
  const summary = []
  const sourceKeys = Object.keys(messages)
  const sig = {}
  for (const key of sourceKeys) {
    const source = key.includes('|') ? key.slice(0, key.lastIndexOf('|')) : key
    try {
      sig[key] = formatter.signature(source)
    } catch (e) {
      problems.push(`source message does not parse (${e.message}): ${JSON.stringify(source)} at ${messages[key][0] ?? '?'}`)
    }
  }
  for (const [lang, catalog] of Object.entries(catalogs).sort()) {
    const isShipped = shipped.includes(lang)
    const present = sourceKeys.filter((k) => typeof catalog[k] === 'string' && catalog[k] !== '')
    if (!isShipped) {
      summary.push(`${lang}: ${present.length} of ${sourceKeys.length} (work in progress, not offered)`)
      continue
    }
    for (const k of sourceKeys) if (!(typeof catalog[k] === 'string' && catalog[k] !== '')) problems.push(`${lang}.json: missing ${JSON.stringify(k)}`)
    for (const k of Object.keys(catalog)) if (!(k in messages)) problems.push(`${lang}.json: unused ${JSON.stringify(k)}`)
    for (const k of present) {
      let s
      try {
        s = formatter.signature(catalog[k])
      } catch (e) {
        problems.push(`${lang}.json: ${JSON.stringify(k)} does not parse (${e.message})`)
        continue
      }
      const want = sig[k]
      if (!want) continue
      if (!sameList(s.args, want.args)) problems.push(`${lang}.json: ${JSON.stringify(k)} has placeholders {${s.args.join(', ')}}, the source has {${want.args.join(', ')}}`)
      if (!sameList(s.tags, want.tags)) problems.push(`${lang}.json: ${JSON.stringify(k)} has tags <${s.tags.join('>, <')}>, the source has <${want.tags.join('>, <')}>`)
      for (const [name, cats] of Object.entries(want.categories)) {
        if (!sameList(s.categories[name] ?? [], cats)) problems.push(`${lang}.json: ${JSON.stringify(k)} select {${name}} options differ from the source`)
      }
    }
    summary.push(`${lang}: ${present.length} of ${sourceKeys.length}`)
  }
  return { problems, summary }
}

export function readCatalogs() {
  const out = {}
  for (const f of readdirSync(localesDir)) {
    if (!f.endsWith('.json') || f === 'messages.json') continue
    out[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(localesDir, f), 'utf8'))
  }
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const formatter = await loadFormatter()
  const messages = extractAll()
  const problems = []
  let stored = null
  try {
    stored = readFileSync(messagesPath, 'utf8')
  } catch {
    // reported below
  }
  if (stored !== JSON.stringify(messages, null, 2) + '\n') problems.push(`${relative(repo, messagesPath)} is out of date: run node scripts/i18n/extract.mjs --write`)
  const res = checkCatalogs({ messages, catalogs: readCatalogs(), shipped: shippedLanguages(), formatter })
  problems.push(...res.problems)
  for (const line of res.summary) console.log(`i18n: ${line}`)
  if (problems.length) {
    for (const p of problems) console.error(p)
    console.error(`i18n-check: ${problems.length} problem(s)`)
    process.exit(1)
  }
  console.log(`i18n-check: ok (${Object.keys(messages).length} messages)`)
}
