// Checks the documentation (OpenSpec change `user-documentation`, design D6):
// front matter, headings, links and anchors, images and alt text, spec coverage,
// help screen ids, the keyboard guide and whether the generated files are current.
//
//   node scripts/docs/check.mjs          (from web/; `npm run docs:check`)
//
// External links are not fetched (no network in CI).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAll, staleFiles } from './build.mjs'
import { headingsOf, parseFrontMatter, repoRootFrom, specNames } from './lib.mjs'
import { END, START, loadShortcuts, shortcutsMarkdown } from './shortcuts.mjs'

/** Help screen ids the app links to: <HelpLink screen="id">, <HelpHeading screen="id">, <SettingsSection helpId="id">, data-help-screen="id" or helpScreen('id'). */
export function appScreenIds(repoRoot) {
  const ids = new Map()
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) { if (name !== 'generated') walk(p); continue }
      if (!/\.(tsx?|jsx?)$/.test(name) || /\.test\./.test(name)) continue
      const src = readFileSync(p, 'utf8')
      for (const m of src.matchAll(/(?:data-help-screen|helpScreen)\s*[=:(]\s*\{?\s*["'`]([^"'`]+)["'`]/g)) ids.set(m[1], p.slice(repoRoot.length + 1))
      for (const m of src.matchAll(/<Help(?:Link|Heading)\b[^>]*?\bscreen=["']([^"']+)["']/g)) ids.set(m[1], p.slice(repoRoot.length + 1))
      // Stories render panels with fixture data; only the app's own components count.
      if (!/\.stories\./.test(name)) for (const m of src.matchAll(/\bhelpId=["']([^"']+)["']/g)) ids.set(m[1], p.slice(repoRoot.length + 1))
    }
  }
  walk(join(repoRoot, 'web/src'))
  return ids
}

/** Runs every check; returns a list of problems (empty when all is well). */
export async function runChecks(repoRoot) {
  const { files, pages, rendered, problems } = await buildAll(repoRoot)
  const out = [...problems]
  const byRel = new Map(pages.map((p) => [p.rel, p]))
  const headings = new Map(pages.map((p) => [p.rel, rendered.get(p.rel).site.headings]))
  const repoHeadings = new Map()
  const anchorsOfRepoFile = (path) => {
    if (!repoHeadings.has(path)) repoHeadings.set(path, new Set(headingsOf(parseFrontMatter(readFileSync(join(repoRoot, path), 'utf8')).body).map((h) => h.id)))
    return repoHeadings.get(path)
  }

  for (const page of pages) {
    const where = `docs/${page.rel}`
    const r = rendered.get(page.rel).site
    // Headings: one h1, first; no skipped levels.
    const hs = r.headings
    const h1 = hs.filter((h) => h.depth === 1)
    if (h1.length !== 1) out.push(`${where}: has ${h1.length} top-level headings (#); exactly one is required`)
    else if (hs[0].depth !== 1) out.push(`${where}: the first heading must be the page title (#)`)
    for (let i = 1; i < hs.length; i++) {
      if (hs[i].depth > hs[i - 1].depth + 1) out.push(`${where}: heading "${hs[i].text}" skips a level (h${hs[i - 1].depth} to h${hs[i].depth})`)
    }
    // Links and anchors.
    const own = new Set(hs.map((h) => h.id))
    for (const l of r.links) {
      if (l.kind === 'anchor' && !own.has(l.anchor)) out.push(`${where}: link "${l.href}" points to a heading that does not exist`)
      if (l.kind === 'page') {
        const target = byRel.get(l.rel)
        if (!target) out.push(`${where}: link "${l.href}" points to a page that does not exist`)
        else if (l.anchor && !headings.get(l.rel).some((h) => h.id === l.anchor)) out.push(`${where}: link "${l.href}" points to a heading that does not exist in docs/${l.rel}`)
      }
      if (l.kind === 'image' && !existsSync(join(repoRoot, l.path))) out.push(`${where}: "${l.href}" does not exist`)
      if (l.kind === 'repo') {
        if (!existsSync(join(repoRoot, l.path))) out.push(`${where}: link "${l.href}" points to ${l.path}, which does not exist`)
        else if (l.anchor && l.path.endsWith('.md') && !anchorsOfRepoFile(l.path).has(l.anchor)) out.push(`${where}: link "${l.href}" points to a heading that does not exist in ${l.path}`)
      }
    }
    // Images: every <img> has alt text; every referenced file exists (including <source srcset>).
    for (const img of r.images) if (!img.alt.trim()) out.push(`${where}: image "${img.src}" has no alt text`)
    for (const m of r.html.matchAll(/(?:src|srcset)="(\/docs\/[^"\s]+)/g)) {
      if (!existsSync(join(repoRoot, m[1].slice(1)))) out.push(`${where}: image "${m[1]}" does not exist`)
    }
  }

  // Every capability is covered by a page, and every page names real capabilities.
  const specs = specNames(repoRoot)
  const covered = new Set(pages.flatMap((p) => p.fm.specs ?? []))
  for (const s of specs) if (!covered.has(s)) out.push(`openspec/specs/${s}: no page under docs/ lists it in "specs"`)
  for (const p of pages) for (const s of p.fm.specs ?? []) if (!specs.includes(s)) out.push(`docs/${p.rel}: specs names "${s}", which is not in openspec/specs/`)

  // Help screen ids: unique, their anchors exist, and they match the app's help links.
  const screens = new Map()
  for (const p of pages) for (const s of p.fm.screens ?? []) {
    const [id, anchor] = s.split('#')
    if (screens.has(id)) out.push(`docs/${p.rel}: screen "${id}" is also claimed by docs/${screens.get(id)}`)
    screens.set(id, p.rel)
    if (p.fm.audience !== 'user') out.push(`docs/${p.rel}: only user pages can name screens (the app ships user pages only)`)
    if (anchor && !headings.get(p.rel).some((h) => h.id === anchor)) out.push(`docs/${p.rel}: screen "${s}" names a heading that does not exist`)
  }
  const used = appScreenIds(repoRoot)
  for (const [id, file] of used) if (!screens.has(id)) out.push(`${file}: help screen "${id}" is not named by any page's "screens"`)
  // The reverse direction applies once the app has help links (task 4.2).
  if (used.size) for (const [id, rel] of screens) if (!used.has(id)) out.push(`docs/${rel}: screen "${id}" is not used by any help link in the app`)

  // The keyboard guide lists exactly the app's shortcuts.
  const kbPath = join(repoRoot, 'docs/keyboard.md')
  if (existsSync(kbPath)) {
    const src = readFileSync(kbPath, 'utf8')
    const a = src.indexOf('<!-- shortcuts:start')
    const b = src.indexOf(END)
    if (a >= 0 && b >= 0 && src.slice(a, b + END.length) !== shortcutsMarkdown(await loadShortcuts(repoRoot))) {
      out.push('docs/keyboard.md: the shortcut tables differ from the app\'s shortcut list; run `make docs`')
    }
  }

  // Generated files are up to date.
  const stale = staleFiles(repoRoot, files).filter((f) => f !== 'docs/keyboard.md')
  if (stale.length) out.push(`generated docs are out of date; run \`make docs\` (${stale.slice(0, 5).join(', ')}${stale.length > 5 ? `, and ${stale.length - 5} more` : ''})`)
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = await runChecks(repoRootFrom(fileURLToPath(import.meta.url)))
  if (problems.length) {
    for (const p of problems) console.error('  ' + p)
    console.error(`docs:check: ${problems.length} problem(s)`)
    process.exit(1)
  }
  console.log('docs:check: ok')
}
