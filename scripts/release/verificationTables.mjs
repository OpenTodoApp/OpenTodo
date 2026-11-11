// The real-client verification tables (OpenSpec change caldav-verified, design
// D3): docs/caldav.md has one row per CalDAV client and docs/calendar-sync.md
// one per calendar server, one column per behaviour of the scripted scenario in
// docs/caldav-verification.md. A cell says `works` with notes, `not supported
// by <client>` with the reason, `defect #<issue>` or `not verified (<date>)`.
//
// tableProblems is the shape every tree must have; gateProblems is the release
// gate: from 1.0 on, no `not verified` cell outside the exempt rows (Mitra, a
// small third-party client). scripts/repo-checks.test.mjs runs both.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const FIRST_GATED_MAJOR = 1

/** The tables: the file, the first header cell, and the rows the gate exempts. */
export const VERIFICATION_TABLES = [
  { path: 'docs/caldav.md', first: 'Client', exempt: [/^Mitra\b/] },
  { path: 'docs/calendar-sync.md', first: 'Server', exempt: [] },
]

const DATE = /\b\d{4}-\d{2}-\d{2}\b/
const VERSION = /\b\d+(?:\.\d+)*\b/
const NOT_VERIFIED = /^not verified\b/i

const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

/** The table whose header starts with `| <first> |`: { header, rows: [{ label, cells, line }] }, or null. */
export function parseVerificationTable(text, first) {
  const lines = text.split('\n')
  const start = lines.findIndex((l, i) => l.startsWith(`| ${first} |`) && /^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(lines[i + 1] ?? ''))
  if (start < 0) return null
  const header = splitRow(lines[start])
  const rows = []
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const cells = splitRow(lines[i])
    rows.push({ label: cells[0], cells: cells.slice(1), line: i + 1 })
  }
  return { header, rows }
}

/** Everything wrong with the table's shape, whatever the version: [] when it is whole. */
export function tableProblems(text, { path, first }) {
  const table = parseVerificationTable(text, first)
  if (!table) return [`${path}: no verification table (a "| ${first} | …" table)`]
  const out = []
  const columns = table.header.slice(1)
  if (table.rows.length === 0) out.push(`${path}: the verification table has no rows`)
  for (const r of table.rows) {
    const where = `${path}:${r.line} row "${r.label}"`
    if (r.cells.length !== columns.length) out.push(`${where}: ${r.cells.length} cells, the header has ${columns.length} columns`)
    r.cells.forEach((c, i) => {
      if (c === '') out.push(`${where}, column "${columns[i]}": blank cell`)
      else if (NOT_VERIFIED.test(c) && !DATE.test(c)) out.push(`${where}, column "${columns[i]}": "not verified" needs the date of the last attempt`)
    })
    // A row with a result names what was run: the client version or the date.
    const ran = r.cells.some((c) => c !== '' && !NOT_VERIFIED.test(c))
    if (ran && !VERSION.test(r.label) && !DATE.test(r.label)) out.push(`${where}: names no client version or date`)
  }
  return out
}

/** Whether a release of `version` (x.y.z) is held to the gate. */
export function gated(version) {
  return Number(String(version).replace(/^v/, '').split('.')[0]) >= FIRST_GATED_MAJOR
}

/** The `not verified` cells a release of `version` refuses: [] before 1.0 or when every gated row is done. */
export function gateProblems(text, { path, first, exempt }, version) {
  if (!gated(version)) return []
  const table = parseVerificationTable(text, first)
  if (!table) return []
  const columns = table.header.slice(1)
  const out = []
  for (const r of table.rows) {
    if (exempt.some((re) => re.test(r.label))) continue
    r.cells.forEach((c, i) => {
      if (NOT_VERIFIED.test(c)) out.push(`${path}: row "${r.label}", column "${columns[i]}": not verified (a ${version} release needs a result)`)
    })
  }
  return out
}

/** The latest release in CHANGELOG.md (x.y.z), or '0.0.0'. */
export function latestRelease(root) {
  const m = /^## \[(\d+\.\d+\.\d+)\]/m.exec(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'))
  return m ? m[1] : '0.0.0'
}

/** Both checks over the repository's tables: { shape, gate }. */
export function verificationProblems(root, version) {
  const shape = []
  const gate = []
  for (const spec of VERIFICATION_TABLES) {
    const file = join(root, spec.path)
    if (!existsSync(file)) { shape.push(`${spec.path}: missing`); continue }
    const text = readFileSync(file, 'utf8')
    shape.push(...tableProblems(text, spec))
    gate.push(...gateProblems(text, spec, version))
  }
  return { shape, gate }
}
