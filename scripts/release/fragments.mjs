// Changelog fragments: the entries of the next release, one file per change, so pull requests
// in parallel never edit the same lines of CHANGELOG.md (see changelog.d/README.md).
//
//   changelog.d/<Section>/<name>.md
//
// <Section> is one of SECTIONS, <name> the OpenSpec change name or a short slug (lowercase
// letters, digits and dashes), the content the entry's bullet as CHANGELOG.md writes it:
// `- **What changed.** What a person notices.` (the leading "- " may be left out; several
// bullets in one file are allowed). `make release-prepare` assembles them into the new release's
// section, sections in SECTIONS order and entries by file name, and deletes them.
// scripts/repo-checks.test.mjs checks the paths and contents, and that nothing is written under
// `## [Unreleased]` in CHANGELOG.md itself.

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const FRAGMENT_DIR = 'changelog.d'
/** The sections a fragment can be in, in the order the release lists them. */
export const SECTIONS = ['Security', 'Added', 'Changed', 'Removed', 'Fixed']
/** Files in changelog.d/ that are not fragments. */
const OTHER = new Set(['README.md'])
const NAME = /^[a-z0-9][a-z0-9-]*\.md$/

/** A fragment's text as CHANGELOG.md list items: trimmed, a bullet, continuation lines indented. */
export function fragmentItems(text) {
  const body = text.replace(/\r\n/g, '\n').trim()
  if (body.startsWith('- ')) return body
  return '- ' + body.split('\n').map((l, i) => (i && l.trim() ? '  ' + l.trim() : l.trim())).join('\n')
}

/** Problems with the text of one fragment ('' when it is fine). */
function textProblem(text) {
  const body = text.trim()
  if (!body) return 'is empty'
  if (/^#/m.test(body)) return 'has a heading; a fragment is only the entry, its section is its folder'
  if (/^## \[/m.test(body) || /^\[[^\]]+\]: /m.test(body)) return 'has a release heading or link'
  return ''
}

/**
 * Every fragment under root/changelog.d, sorted (SECTIONS order, then file name):
 * [{ section, name, rel, text }]. Problems (a file in the wrong place, an unknown section,
 * a bad name or content) are returned, never thrown, so the repository check can list them all.
 */
export function readFragments(root) {
  const dir = join(root, FRAGMENT_DIR)
  const fragments = []
  const problems = []
  if (!existsSync(dir)) return { fragments, problems }
  for (const entry of readdirSync(dir).sort()) {
    const rel = `${FRAGMENT_DIR}/${entry}`
    if (!statSync(join(dir, entry)).isDirectory()) {
      if (!OTHER.has(entry)) problems.push(`${rel}: a fragment goes in a section folder, ${FRAGMENT_DIR}/<${SECTIONS.join('|')}>/<name>.md`)
      continue
    }
    if (!SECTIONS.includes(entry)) {
      problems.push(`${rel}/: unknown section; use one of ${SECTIONS.join(', ')}`)
      continue
    }
    for (const file of readdirSync(join(dir, entry)).sort()) {
      const frel = `${rel}/${file}`
      if (file === '.gitkeep') continue
      if (statSync(join(dir, entry, file)).isDirectory()) { problems.push(`${frel}/: no folders inside a section`); continue }
      if (!NAME.test(file)) { problems.push(`${frel}: the name must be the change name or a slug (a-z, 0-9, -) ending in .md`); continue }
      const text = readFileSync(join(dir, entry, file), 'utf8')
      const problem = textProblem(text)
      if (problem) { problems.push(`${frel}: ${problem}`); continue }
      fragments.push({ section: entry, name: file.slice(0, -3), rel: frel, text })
    }
  }
  fragments.sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return { fragments, problems }
}

/** The fragments as a release's sections: "### Added\n\n- …\n- …\n\n### Fixed\n\n- …\n" ('' for none). */
export function fragmentsMarkdown(fragments) {
  const out = []
  for (const section of SECTIONS) {
    const items = fragments.filter((f) => f.section === section).map((f) => fragmentItems(f.text))
    if (items.length) out.push(`### ${section}\n\n${items.join('\n')}\n`)
  }
  return out.join('\n')
}

/** Deletes the fragments' files. */
export function removeFragments(root, fragments) {
  for (const f of fragments) rmSync(join(root, f.rel))
}

/** The body of `## [Unreleased]` in CHANGELOG.md, up to the next release heading or the links. */
export function unreleasedBody(changelog) {
  const m = /^## \[Unreleased\][^\n]*\n([\s\S]*?)(?=^## |^\[[^\]]+\]: |(?![\s\S]))/m.exec(changelog)
  return m ? m[1] : null
}

/** Problems: entries written under `## [Unreleased]` in CHANGELOG.md instead of a fragment. */
export function unreleasedProblems(changelog) {
  const body = unreleasedBody(changelog)
  if (body === null) return ['CHANGELOG.md has no "## [Unreleased]" heading']
  const entries = body.split('\n').filter((l) => /^\s*[-*] |^#{3,} /.test(l))
  return entries.length
    ? [`CHANGELOG.md: ${entries.length} line(s) under "## [Unreleased]" (${JSON.stringify(entries[0].slice(0, 60))}); put each entry in ${FRAGMENT_DIR}/<Section>/<name>.md instead (${FRAGMENT_DIR}/README.md)`]
    : []
}
