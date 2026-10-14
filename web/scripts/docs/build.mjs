// Builds the documentation (OpenSpec change `user-documentation`) from docs/**:
//   website/docs/**            the docs website (pages, search.json, docs.css, docs.js, images)
//   web/src/generated/help.json the user guide for the in-app Help view
//   docs/keyboard.md           its shortcut tables, regenerated from the app
//
//   node scripts/docs/build.mjs [--site DIR]   (from web/; `make docs` from the root)
//
// DIR is the docs website's output, repository-relative (default dist/docs-site).
// Until the website repository serves the site (OpenSpec site-bundle D6),
// `npm run docs:build` passes --site website/docs and the result is committed.
//
// The output is deterministic: running it twice changes nothing.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { imageSize, loadPages, pageUrl, renderPage, repoRootFrom, sortPages, versionInfo } from './lib.mjs'
import { loadShortcuts, shortcutsMarkdown, withShortcuts } from './shortcuts.mjs'
import { landingHtml, pageHtml } from './site.mjs'

const here = fileURLToPath(import.meta.url)
const ASSETS = join(dirname(here), 'assets')
/** Where the docs website is written unless a caller says otherwise. */
export const OUT_SITE = 'dist/docs-site'
/** The committed copy, checked by docs:check until the switch-over (site-bundle D6). */
export const COMMITTED_SITE = 'website/docs'
export const OUT_HELP = 'web/src/generated/help.json'
const TEXT_CAP = 1500

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

  const index = pages.find((p) => p.fm.layout === 'index')
  const sorted = sortPages(pages.filter((p) => !p.errors.length || p.fm.title))
  const audienceOf = (rel) => pages.find((p) => p.rel === rel)?.fm.audience
  const version = versionInfo(repoRoot)
  const rendered = new Map()
  for (const page of pages) {
    const ctx = { rel: page.rel, repoRoot, audienceOf }
    rendered.set(page.rel, { site: renderPage(page.body, ctx, 'site'), app: page.fm.audience === 'user' ? renderPage(page.body, ctx, 'app') : null })
  }

  // Pages
  for (const page of sorted) {
    const r = rendered.get(page.rel).site
    files.set(`${OUT_SITE}/${page.slug}/index.html`, pageHtml({ page, html: r.html, headings: r.headings, sorted, version }))
  }
  const cardImage = sorted.find((p) => p.fm.card)?.fm.card
  const cardSize = (cardImage && imageSize(join(repoRoot, `docs/images/card-${cardImage}-light.webp`))) || { width: 640, height: 400 }
  if (index) files.set(`${OUT_SITE}/index.html`, landingHtml({ index, sorted, version, cardSize }))

  // Search index: one entry per section (intro, h2, h3) with its text.
  const search = { pages: [], s: [] }
  for (const page of sorted) {
    const at = search.pages.push({ t: page.fm.title, u: pageUrl(page.slug) }) - 1
    for (const s of rendered.get(page.rel).site.sections) search.s.push([at, s.heading, s.id, s.text.slice(0, TEXT_CAP)])
  }
  files.set(`${OUT_SITE}/search.json`, JSON.stringify(search))

  // Static assets: stylesheet, script (search core included) and images.
  files.set(`${OUT_SITE}/docs.css`, readFileSync(join(ASSETS, 'docs.css'), 'utf8'))
  const core = readFileSync(join(dirname(here), 'search-core.mjs'), 'utf8').replace(/^export /gm, '')
  files.set(`${OUT_SITE}/docs.js`, readFileSync(join(ASSETS, 'docs.js'), 'utf8').replace('/* @search-core */', core.trim()))
  const imgDir = join(repoRoot, 'docs/images')
  if (existsSync(imgDir)) for (const name of readdirSync(imgDir).sort()) {
    if (/\.(webp|png|svg)$/.test(name)) files.set(`${OUT_SITE}/images/${name}`, readFileSync(join(imgDir, name)))
  }

  // In-app help: user pages only, with the same index.
  const user = sorted.filter((p) => p.fm.audience === 'user')
  const screens = {}
  for (const p of user) for (const s of p.fm.screens ?? []) {
    const [id, anchor = ''] = s.split('#')
    screens[id] = { page: p.slug, anchor }
  }
  const help = {
    version: version.release,
    pages: user.map((p) => {
      const r = rendered.get(p.rel).app
      return { slug: p.slug, title: p.fm.title, summary: p.fm.summary, section: p.fm.section ?? 'Guides', order: p.fm.order,
        toc: r.headings.filter((h) => h.depth === 2).map((h) => ({ id: h.id, text: h.text })), html: withoutImages(r.html) }
    }),
    screens: Object.fromEntries(Object.entries(screens).sort(([a], [b]) => a.localeCompare(b))),
    index: { pages: [], s: [] },
  }
  for (const p of user) {
    const at = help.index.pages.push({ t: p.fm.title, u: p.slug }) - 1
    for (const s of rendered.get(p.rel).app.sections) help.index.s.push([at, s.heading, s.id, s.text.slice(0, TEXT_CAP)])
  }
  files.set(OUT_HELP, JSON.stringify(help) + '\n')

  return { files, pages, sorted, rendered, problems }
}

// The app ships the guide's text only: screenshots stay on the website, so the
// binary and the precache grow by the text alone (about 2.4 MB of images saved).
export function withoutImages(html) {
  return html.replace(/<picture>[\s\S]*?<\/picture>/g, '').replace(/<img [^>]*>/g, '').replace(/<p>\s*<\/p>\n?/g, '')
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
