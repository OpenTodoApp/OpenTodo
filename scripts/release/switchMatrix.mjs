// The migration matrix (OpenSpec change migration-everywhere, design D6):
// docs/switch/README.md lists every competitor with its import format, a
// switch guide with an "Export from …" section, a fixture from a real export
// with a golden preview, and the date of the last check. matrixProblems is run
// by scripts/repo-checks.test.mjs on every pull request; staleRows by
// prepare.mjs (make release-prepare) for 1.0 and later.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The apps of the 1.0 roadmap's competitor list, plus Linear, by guide name. */
export const MATRIX_APPS = ['todoist', 'ticktick', 'things', 'omnifocus', 'anydo', 'microsoft-todo', 'google-tasks', 'apple-reminders',
  'vikunja', 'trello', 'asana', 'notion', 'super-productivity', 'tududi', 'linear']

/** Releases from this major on refuse a row checked more than FRESH_DAYS before the release. */
export const FIRST_GATED_MAJOR = 1
export const FRESH_DAYS = 120

export const MATRIX_PATH = 'docs/switch/README.md'

/** The matrix rows: { guide, name, format, verified (YYYY-MM-DD or ''), line }. */
export function parseMatrix(text) {
  const rows = []
  text.split('\n').forEach((line, i) => {
    const m = /^\| \[([^\]]+)\]\(([a-z0-9-]+)\.md\) \| `([a-z0-9-]+)` \|(.*)\|\s*$/.exec(line)
    if (!m) return
    const cells = m[4].split('|').map((c) => c.trim())
    const verified = /^(\d{4}-\d{2}-\d{2})\b/.exec(cells[cells.length - 1] ?? '')?.[1] ?? ''
    rows.push({ name: m[1], guide: m[2], format: m[3], verified, line: i + 1, cells })
  })
  return rows
}

/** The import formats the server knows, read from the importer's Go source. */
export function importerFormats(root) {
  const dir = join(root, 'internal/importer')
  const out = new Set()
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.go') && !n.endsWith('_test.go'))) {
    const src = readFileSync(join(dir, f), 'utf8')
    for (const m of src.matchAll(/^(?:const |\t)[a-zA-Z]+Format\s*=\s*"([a-z0-9-]+)"/gm)) out.add(m[1])
  }
  return out
}

/** Everything wrong with the matrix: [] when every app has its row, format, guide and fixture. */
export function matrixProblems(root) {
  const out = []
  const rows = parseMatrix(readFileSync(join(root, MATRIX_PATH), 'utf8'))
  const formats = importerFormats(root)
  const byGuide = new Map(rows.map((r) => [r.guide, r]))
  for (const app of MATRIX_APPS) {
    const r = byGuide.get(app)
    if (!r) { out.push(`${app}: no row in ${MATRIX_PATH}`); continue }
    if (!formats.has(r.format)) out.push(`${r.name}: format ${r.format} is not a format of internal/importer`)
    const guide = join(root, 'docs/switch', `${app}.md`)
    if (!existsSync(guide)) out.push(`${r.name}: no guide docs/switch/${app}.md`)
    else if (!/^## Export from /m.test(readFileSync(guide, 'utf8'))) out.push(`${r.name}: docs/switch/${app}.md has no "## Export from …" section`)
    const fixtures = join(root, 'internal/importer/testdata', r.format)
    const goldens = existsSync(fixtures) ? readdirSync(fixtures).filter((f) => f.endsWith('.golden.json')) : []
    if (goldens.length === 0) out.push(`${r.name}: no fixture with a golden preview in internal/importer/testdata/${r.format}/`)
    if (!r.verified) out.push(`${r.name}: no last-verified date`)
  }
  for (const r of rows) if (!MATRIX_APPS.includes(r.guide)) out.push(`${r.name}: not an app of the matrix list (scripts/release/switchMatrix.mjs)`)
  return out
}

/** Whether a release of `version` checks the matrix dates. */
export function gated(version) {
  return Number(version.split('.')[0]) >= FIRST_GATED_MAJOR
}

/** Rows last verified more than FRESH_DAYS before `date` (YYYY-MM-DD). */
export function staleRows(text, date) {
  const limit = Date.parse(date) - FRESH_DAYS * 86_400_000
  return parseMatrix(text).filter((r) => !r.verified || Date.parse(r.verified) < limit)
}

/** Throws when a release of `version` on `date` carries a stale matrix row. */
export function checkMatrixFreshness(root, version, date) {
  if (!gated(version) || !existsSync(join(root, MATRIX_PATH))) return
  const stale = staleRows(readFileSync(join(root, MATRIX_PATH), 'utf8'), date)
  if (stale.length) {
    throw new Error(`${MATRIX_PATH}: re-check these imports against a real export (more than ${FRESH_DAYS} days before ${date}):\n  ` +
      stale.map((r) => `${r.name} (${r.verified || 'no date'})`).join('\n  '))
  }
}
