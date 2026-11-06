// Builds the documentation (OpenSpec change `user-documentation`) from docs/**:
//   dist/docs-site/**          the docs website (pages, search.json, docs.css, docs.js, images), not committed
//   web/src/generated/help.json the user guide for the in-app Help view, not committed
//   docs/keyboard.md           its shortcut tables, regenerated from the app
//   docs/roadmap.md            its tables, from ROADMAP.md, openspec/ and CHANGELOG.md (docs-1-0 D6)
//
//   node scripts/docs/build.mjs [--site DIR]   (from web/; `make docs` from the root)
//   node scripts/docs/help.mjs                 only help.json (`npm run help`; run before build, dev, test)
//
// DIR is the docs website's output, repository-relative (default dist/docs-site).
// The site is not committed: the site bundle carries it to the website
// repository (OpenSpec site-bundle D6), and neither is the in-app help: the web
// app's scripts build it first (help.mjs). The keyboard and roadmap guides are.
//
// The output is deterministic: running it twice changes nothing.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { brandUrls, ENTRIES, entryTree, indexTree, loadPages, pageUrl, renderPage, repoRootFrom, sortPages, versionInfo } from './lib.mjs'
import { loadShortcuts, shortcutsMarkdown, withShortcuts } from './shortcuts.mjs'
import { roadmapMarkdown, withRoadmap } from './roadmap.mjs'
import { landingHtml, pageHtml, sectionHtml } from './site.mjs'
import { tokensCss } from '../../../scripts/tokens.mjs'
import { helpBundle, OUT_HELP, TEXT_CAP } from './help.mjs'

export { buildHelp, OUT_HELP, withoutImages } from './help.mjs'

const here = fileURLToPath(import.meta.url)
const ASSETS = join(dirname(here), 'assets')
/** Where the docs website is written unless a caller says otherwise. */
export const OUT_SITE = 'dist/docs-site'
/** The app's screen ids (docs-1-0 D1), written from web/src/app/screens.ts for the docs check. */
export const OUT_SCREENS = 'web/src/generated/screen-ids.json'

/**
 * Builds everything in memory. Returns { files, pages, rendered, problems } where
 * files maps repository-relative paths to their content (string or Buffer).
 */
export async function buildAll(repoRoot, { site = OUT_SITE } = {}) {
  const OUT_SITE = site
  const files = new Map()
  const problems = []
  const pages = loadPages(join(repoRoot, 'docs'))
  for (const p of pages) for (const err of p.errors) problems.push(`docs/${p.rel}: ${err}`)

  // The keyboard guide's tables come from the app's shortcut rows.
  const kb = pages.find((p) => p.rel === 'keyboard.md')
  if (kb) {
    const src = readFileSync(join(repoRoot, 'docs/keyboard.md'), 'utf8')
    const block = shortcutsMarkdown(await loadShortcuts(repoRoot))
    const next = withShortcuts(src, block)
    if (next === null) problems.push('docs/keyboard.md: the shortcut markers are missing')
    else {
      files.set('docs/keyboard.md', next)
      kb.body = withShortcuts(kb.body, block)
    }
  }

  // The roadmap page's tables come from ROADMAP.md and the OpenSpec folders (docs-1-0 D6).
  const rm = pages.find((p) => p.rel === 'roadmap.md')
  if (rm) {
    const src = readFileSync(join(repoRoot, 'docs/roadmap.md'), 'utf8')
    const block = roadmapMarkdown(repoRoot)
    const next = withRoadmap(src, block)
    if (next === null) problems.push('docs/roadmap.md: the roadmap markers are missing')
    else {
      files.set('docs/roadmap.md', next)
      rm.body = withRoadmap(rm.body, block)
    }
  }

  const index = pages.find((p) => p.fm.layout === 'index')
  const sorted = sortPages(pages.filter((p) => !p.errors.length || p.fm.title))
  const audienceOf = (rel) => pages.find((p) => p.rel === rel)?.fm.audience
  // The mark's URLs carry a hash of the mark, as on the rest of the website (lib.mjs brandUrls).
  const version = { ...versionInfo(repoRoot), brand: brandUrls(repoRoot) }
  const rendered = new Map()
  for (const page of pages) {
    const ctx = { rel: page.rel, repoRoot, audienceOf }
    rendered.set(page.rel, { site: renderPage(page.body, ctx, 'site'), app: page.fm.audience === 'user' ? renderPage(page.body, ctx, 'app') : null })
  }

  // Pages, grouped by entry point with the nesting of the docs index (docs-landing-restyle D1, D2).
  const entries = entryTree(sorted, indexTree(index?.body ?? ''))
  for (const page of sorted) {
    const r = rendered.get(page.rel).site
    files.set(`${OUT_SITE}/${page.slug}/index.html`, pageHtml({ page, html: r.html, headings: r.headings, entries, version }))
  }
  for (const { key } of ENTRIES) files.set(`${OUT_SITE}/${key}/index.html`, sectionHtml({ key, entries, version }))
  if (index) files.set(`${OUT_SITE}/index.html`, landingHtml({ index, entries, version }))

  // Search index: one entry per section (intro, h2, h3) with its text.
  const search = { pages: [], s: [] }
  for (const page of sorted) {
    const at = search.pages.push({ t: page.fm.title, u: pageUrl(page.slug) }) - 1
    for (const s of rendered.get(page.rel).site.sections) search.s.push([at, s.heading, s.id, s.text.slice(0, TEXT_CAP)])
  }
  files.set(`${OUT_SITE}/search.json`, JSON.stringify(search))

  // Static assets: stylesheet, script (search core included) and images.
  files.set(`${OUT_SITE}/docs.css`, docsCss(repoRoot, version.release))
  const core = readFileSync(join(dirname(here), 'search-core.mjs'), 'utf8').replace(/^export /gm, '')
  files.set(`${OUT_SITE}/docs.js`, readFileSync(join(ASSETS, 'docs.js'), 'utf8').replace('/* @search-core */', core.trim()))
  const imgDir = join(repoRoot, 'docs/images')
  if (existsSync(imgDir)) for (const name of readdirSync(imgDir).sort()) {
    if (/\.(webp|png|svg)$/.test(name)) files.set(`${OUT_SITE}/images/${name}`, readFileSync(join(imgDir, name)))
  }
  // Other files under docs/ that a page links (the theme format's JSON Schema): served
  // beside the pages at the same path, so the link written as /docs/<path> resolves.
  for (const page of sorted) for (const l of rendered.get(page.rel).site.links) {
    if (l.kind !== 'image' || l.path.startsWith('docs/images/')) continue
    const src = join(repoRoot, l.path)
    if (existsSync(src) && statSync(src).isFile()) files.set(`${OUT_SITE}/${l.path.slice('docs/'.length)}`, readFileSync(src))
  }

  // In-app help: user pages only, with the same index.
  const user = sorted.filter((p) => p.fm.audience === 'user')
  const help = helpBundle(user, (p) => rendered.get(p.rel).app, version.release)
  files.set(OUT_HELP, JSON.stringify(help) + '\n')
  const screenIds = await loadScreenIds(repoRoot)
  if (screenIds) files.set(OUT_SCREENS, JSON.stringify(screenIds, null, 2) + '\n')

  return { files, pages, sorted, rendered, problems, screenIds }
}

/**
 * The app's screen ids from web/src/app/screens.ts (imported directly; Node strips
 * the types, and the module has no runtime imports), or null when the file is absent.
 */
export async function loadScreenIds(repoRoot) {
  const file = join(repoRoot, 'web/src/app/screens.ts')
  if (!existsSync(file)) return null
  // The modification time in the URL defeats the module cache when the file changes (tests, watch).
  const m = await import(`${pathToFileURL(file).href}?v=${Math.floor(statSync(file).mtimeMs)}`)
  return [...m.SCREEN_IDS]
}

// The stylesheet: the app's colour tokens and the ratios they mix by, generated from
// web/src/index.css like the site bundle's tokens.css (docs-landing-restyle D4), then docs.css.
function docsCss(repoRoot, release) {
  const tokensFile = join(repoRoot, 'web/src/index.css')
  // Test fixtures carry no app stylesheet: the docs stylesheet alone then.
  if (!existsSync(tokensFile)) return readFileSync(join(ASSETS, 'docs.css'), 'utf8')
  const indexCss = readFileSync(tokensFile, 'utf8')
  const mixes = [...new Set(indexCss.match(/--ot-mix-[\w-]+:\s*[^;]+;/g) ?? [])]
  return `${tokensCss(indexCss, release)}:root {\n${mixes.map((m) => `  ${m}`).join('\n')}\n}\n\n${readFileSync(join(ASSETS, 'docs.css'), 'utf8')}`
}

/** Files currently under the generated website directory, repository-relative. */
export function existingSiteFiles(repoRoot, site = OUT_SITE) {
  const out = []
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else out.push(relative(repoRoot, p).split('\\').join('/'))
    }
  }
  walk(join(repoRoot, site))
  return out.sort()
}

/** Paths whose content on disk differs from the build, plus stale files. */
export function staleFiles(repoRoot, files, site = OUT_SITE) {
  const out = []
  for (const [path, content] of files) {
    const p = join(repoRoot, path)
    if (!existsSync(p)) { out.push(`${path} (missing)`); continue }
    const disk = readFileSync(p)
    if (!disk.equals(Buffer.isBuffer(content) ? content : Buffer.from(content))) out.push(path)
  }
  for (const path of existingSiteFiles(repoRoot, site)) if (!files.has(path)) out.push(`${path} (no longer generated)`)
  return out
}

export function writeAll(repoRoot, files, site = OUT_SITE) {
  for (const path of existingSiteFiles(repoRoot, site)) if (!files.has(path)) rmSync(join(repoRoot, path))
  let changed = 0
  for (const [path, content] of files) {
    const p = join(repoRoot, path)
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content)
    if (existsSync(p) && readFileSync(p).equals(buf)) continue
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, buf)
    changed++
  }
  // Remove directories left empty by deleted pages.
  const prune = (dir) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) prune(p) }
    if (!readdirSync(dir).length) rmSync(dir, { recursive: true })
  }
  prune(join(repoRoot, site))
  return changed
}

/** The value of `--site DIR` in argv, or the default. */
export function siteArg(argv) {
  const i = argv.indexOf('--site')
  return i >= 0 && argv[i + 1] ? argv[i + 1].replace(/\/+$/, '') : OUT_SITE
}

if (process.argv[1] === here) {
  const repoRoot = repoRootFrom(here)
  const site = siteArg(process.argv)
  const { files, problems, sorted } = await buildAll(repoRoot, { site })
  if (problems.length) {
    for (const p of problems) console.error('  ' + p)
    console.error(`docs: ${problems.length} problem(s); run \`npm run docs:check\` for details`)
    process.exit(1)
  }
  const changed = writeAll(repoRoot, files, site)
  console.log(`docs: ${sorted.length} pages, ${files.size} files, ${changed} changed`)
}
