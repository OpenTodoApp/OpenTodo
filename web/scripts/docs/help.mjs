// The in-app help, web/src/generated/help.json (OpenSpec change `user-documentation`, D5): the
// user pages of docs/, rendered for the app, their screen ids and the search index. It is not
// committed (it changed with every docs edit and made parallel pull requests conflict), so the
// web app's scripts build it first: `npm run help`, the `pre` step of build, dev, test,
// typecheck and the Storybook scripts, and the image build.
//
//   node scripts/docs/help.mjs   (from web/)
//
// This module needs docs/ and CHANGELOG.md alone (no images, no other repository folder), so the
// image build's web stage can run it. build.mjs writes the same file in a full docs build.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPages, renderPage, repoRootFrom, sortPages, versionInfo } from './lib.mjs'

export const OUT_HELP = 'web/src/generated/help.json'
/** The longest section text the search index keeps. */
export const TEXT_CAP = 1500

// The app ships the guide's text only: screenshots stay on the website, so the
// binary and the precache grow by the text alone (about 2.4 MB of images saved).
export function withoutImages(html) {
  return html.replace(/<picture>[\s\S]*?<\/picture>/g, '').replace(/<img [^>]*>/g, '').replace(/<p>\s*<\/p>\n?/g, '')
}

/**
 * The in-app help (web/src/generated/help.json): the user pages, rendered for the app, with
 * their screen ids and the search index. `app(page)` is the page's app rendering.
 */
export function helpBundle(user, app, release) {
  const screens = {}
  for (const p of user) for (const s of p.fm.screens ?? []) {
    const [id, anchor = ''] = s.split('#')
    screens[id] = { page: p.slug, anchor }
  }
  const help = {
    version: release,
    pages: user.map((p) => {
      const r = app(p)
      return { slug: p.slug, title: p.fm.title, summary: p.fm.summary, section: p.fm.section ?? 'Guides', order: p.fm.order,
        toc: r.headings.filter((h) => h.depth === 2).map((h) => ({ id: h.id, text: h.text })), html: withoutImages(r.html) }
    }),
    screens: Object.fromEntries(Object.entries(screens).sort(([a], [b]) => a.localeCompare(b))),
    index: { pages: [], s: [] },
  }
  for (const p of user) {
    const at = help.index.pages.push({ t: p.fm.title, u: p.slug }) - 1
    for (const s of app(p).sections) help.index.s.push([at, s.heading, s.id, s.text.slice(0, TEXT_CAP)])
  }
  return help
}

/**
 * Only the in-app help, from docs/ and CHANGELOG.md alone: what `npm run build`, `npm test`,
 * `npm run dev` and the image build run first, because help.json is not committed (it changed
 * with every docs edit and made parallel pull requests conflict). The generated blocks of the
 * keyboard and roadmap guides are read as committed; `make docs-check` keeps them current, so
 * this is byte for byte the help.json of a full build.
 */
export function buildHelp(repoRoot) {
  const pages = loadPages(join(repoRoot, 'docs'))
  const sorted = sortPages(pages.filter((p) => !p.errors.length || p.fm.title))
  const audienceOf = (rel) => pages.find((p) => p.rel === rel)?.fm.audience
  const user = sorted.filter((p) => p.fm.audience === 'user')
  const app = new Map(user.map((p) => [p.rel, renderPage(p.body, { rel: p.rel, repoRoot, audienceOf }, 'app')]))
  return JSON.stringify(helpBundle(user, (p) => app.get(p.rel), versionInfo(repoRoot).release)) + '\n'
}

const here = fileURLToPath(import.meta.url)
if (process.argv[1] === here) {
  const repoRoot = repoRootFrom(here)
  const out = join(repoRoot, OUT_HELP)
  const text = buildHelp(repoRoot)
  if (!existsSync(out) || readFileSync(out, 'utf8') !== text) {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, text)
  }
}
