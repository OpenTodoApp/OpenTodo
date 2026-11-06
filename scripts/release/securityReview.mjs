// External security reviews (OpenSpec change external-security-review, design D3 and D4).
//
// docs/security/review-scope.md lists the review's scope items, one table row each, with the
// threat model section that covers it. A review file docs/security/reviews/<yyyy-mm>-<reviewer>.md
// has a "## Record" table (reviewer, commit, delivered, published, scope) and a "## Findings"
// table (ID, Title, Severity, Status, Fix, Regression test, Advisory).
//
//   reviewProblems(root)          the repo check: every file well formed (scripts/security-review.test.mjs)
//   checkSecurityReviews(...)     the release gate for 1.0.0 and later (prepare.mjs, make release-prepare)
//
// No review file is a valid state: the review is optional for 1.0 (owner, 2026-10-30), and the gate
// passes without one.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const SCOPE_PATH = 'docs/security/review-scope.md'
export const THREAT_MODEL_PATH = 'docs/security/threat-model.md'
export const REVIEWS_DIR = 'docs/security/reviews'
export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Info']
export const STATUSES = ['Fixed (retested)', 'Fixed', 'Accepted', 'Open', "Won't fix"]
export const FINDING_COLUMNS = ['ID', 'Title', 'Severity', 'Status', 'Fix', 'Regression test', 'Advisory']
export const RECORD_FIELDS = ['Reviewer', 'Commit', 'Delivered', 'Published', 'Scope']
/** Releases from this major on run the gate. */
export const FIRST_GATED_MAJOR = 1
/** A review is due again this many months after the newest one was delivered (design D7). */
export const MAX_AGE_MONTHS = 24

const REVIEW_FILE = /^\d{4}-\d{2}-[a-z0-9-]+\.md$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const VERSION = /\b(\d+\.\d+\.\d+)\b/

/** GitHub-style heading id, as the docs site makes it (web/scripts/docs/lib.mjs createSlugger, first use). */
export function headingId(text) {
  return text.toLowerCase().trim().replace(/[`*_]/g, '').replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-')
}

/** The heading ids of a Markdown page, ignoring fenced code. */
export function headingIds(markdown) {
  const ids = new Set()
  let fence = false
  for (const line of markdown.split('\n')) {
    if (/^```/.test(line)) fence = !fence
    if (fence) continue
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (m) ids.add(headingId(m[1]))
  }
  return ids
}

/** The rows of the first table under the heading `## <title>`: arrays of trimmed cells, header first. */
export function tableUnder(markdown, title) {
  const lines = markdown.split('\n')
  const start = lines.findIndex((l) => l.trim() === `## ${title}`)
  if (start < 0) return null
  const rows = []
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]
    if (/^## /.test(l)) break
    if (!/^\|/.test(l.trim())) { if (rows.length) break; continue }
    const cells = l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue
    rows.push(cells)
  }
  return rows
}

/** The scope items of review-scope.md: [{ id, area, anchor }]. */
export function parseScope(markdown) {
  const rows = tableUnder(markdown, 'Scope') ?? []
  return rows.slice(1).flatMap((cells) => {
    const id = /^`([a-z0-9-]+)`$/.exec(cells[0] ?? '')?.[1]
    if (!id) return []
    const anchor = /\]\(threat-model\.md#([^)]+)\)/.exec(cells[2] ?? '')?.[1] ?? ''
    return [{ id, area: cells[1] ?? '', anchor }]
  })
}

/** Problems with the scope list against the threat model: each item names an existing section. */
export function scopeProblems(scopeText, threatModelText) {
  const out = []
  const items = parseScope(scopeText)
  if (items.length === 0) out.push(`${SCOPE_PATH}: no scope items under "## Scope"`)
  const ids = headingIds(threatModelText)
  const seen = new Set()
  for (const it of items) {
    if (seen.has(it.id)) out.push(`${SCOPE_PATH}: scope item ${it.id} is listed twice`)
    seen.add(it.id)
    if (!it.anchor) out.push(`${SCOPE_PATH}: scope item ${it.id} links no threat model section`)
    else if (!ids.has(it.anchor)) out.push(`${SCOPE_PATH}: scope item ${it.id} names threat model section #${it.anchor}, which does not exist`)
  }
  return out
}

/** A review file: { record: {Reviewer, Commit, …}, scope: [ids], findings: [{ID, …}], errors: [] }. */
export function parseReview(markdown) {
  const errors = []
  const record = {}
  const recordRows = tableUnder(markdown, 'Record')
  if (!recordRows) errors.push('no "## Record" table')
  else for (const [k, v] of recordRows.slice(1)) record[k] = v ?? ''
  for (const f of RECORD_FIELDS) if (recordRows && !(f in record)) errors.push(`Record has no ${f}`)
  if (record.Commit !== undefined && !/^[0-9a-f]{40}$/.test(record.Commit.replace(/`/g, ''))) errors.push('Record: Commit must be a full 40-character commit hash')
  if (record.Delivered !== undefined && !DATE.test(record.Delivered)) errors.push('Record: Delivered must be YYYY-MM-DD')
  if (record.Published !== undefined && record.Published !== '' && record.Published !== 'Not yet' && !DATE.test(record.Published)) errors.push('Record: Published must be YYYY-MM-DD or "Not yet"')
  const scope = [...(record.Scope ?? '').matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1])

  const findings = []
  const rows = tableUnder(markdown, 'Findings')
  if (!rows) errors.push('no "## Findings" table')
  else {
    const header = rows[0] ?? []
    if (header.join('|') !== FINDING_COLUMNS.join('|')) errors.push(`Findings: the columns must be ${FINDING_COLUMNS.join(', ')}`)
    else for (const cells of rows.slice(1)) {
      const f = Object.fromEntries(FINDING_COLUMNS.map((c, i) => [c, cells[i] ?? '']))
      findings.push(f)
      if (!f.ID) errors.push('Findings: a row has no ID')
      if (!SEVERITIES.includes(f.Severity)) errors.push(`${f.ID}: severity must be one of ${SEVERITIES.join(', ')}`)
      if (!STATUSES.includes(f.Status)) errors.push(`${f.ID}: status must be one of ${STATUSES.join(', ')}`)
    }
  }
  return { record, scope, findings, errors }
}

/** The file paths a Regression test cell names in backticks (`internal/x/y_test.go`). */
export function testPaths(cell) {
  return [...cell.matchAll(/`([^`\s]+\/[^`\s]+\.[a-z]+)`/g)].map((m) => m[1])
}

const issueLink = (cell) => /(^|[^\w])#\d+\b|\/issues\/\d+/.test(cell)
const fixedStatus = (s) => s === 'Fixed' || s === 'Fixed (retested)'

/** Problems with one parsed review against the scope list and the repository (the repo check). */
export function reviewFileProblems(rel, review, scopeIds, exists) {
  const out = review.errors.map((e) => `${rel}: ${e}`)
  for (const id of scopeIds) if (!review.scope.includes(id)) out.push(`${rel}: Scope does not list ${id}`)
  for (const id of review.scope) if (!scopeIds.includes(id)) out.push(`${rel}: Scope lists ${id}, which is not a scope item of ${SCOPE_PATH}`)
  for (const f of review.findings) {
    if (['Critical', 'High', 'Medium'].includes(f.Severity) && fixedStatus(f.Status)) {
      const paths = testPaths(f['Regression test'])
      if (paths.length === 0) out.push(`${rel}: ${f.ID} is fixed but names no regression test file`)
      for (const p of paths) if (!exists(p)) out.push(`${rel}: ${f.ID} names regression test ${p}, which does not exist`)
    }
  }
  return out
}

/** The review files: [{ rel, text }], newest name last. */
export function reviewFiles(root) {
  const dir = join(root, REVIEWS_DIR)
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((n) => n.endsWith('.md') && n !== 'README.md').sort()
    .map((n) => ({ rel: `${REVIEWS_DIR}/${n}`, name: n, text: readFileSync(join(dir, n), 'utf8') }))
}

/** The repo check: scope list, threat model sections and every review file. */
export function reviewProblems(root) {
  const read = (rel) => readFileSync(join(root, rel), 'utf8')
  const out = []
  for (const rel of [SCOPE_PATH, THREAT_MODEL_PATH]) if (!existsSync(join(root, rel))) out.push(`${rel} is missing`)
  if (out.length) return out
  out.push(...scopeProblems(read(SCOPE_PATH), read(THREAT_MODEL_PATH)))
  const scopeIds = parseScope(read(SCOPE_PATH)).map((s) => s.id)
  for (const f of reviewFiles(root)) {
    if (!REVIEW_FILE.test(f.name)) out.push(`${f.rel}: the name must be <yyyy-mm>-<reviewer>.md`)
    out.push(...reviewFileProblems(f.rel, parseReview(f.text), scopeIds, (p) => existsSync(join(root, p))))
  }
  return out
}

/** Whole months from date a to date b (YYYY-MM-DD), counting a month only once its day is reached. */
export function monthsBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am) - (bd < ad ? 1 : 0)
}

const cmp = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  return 0
}

/** Why one finding blocks releasing `version`, or '' when it does not. */
export function blockingReason(f, version) {
  switch (f.Severity) {
    case 'Critical':
    case 'High':
      return f.Status === 'Fixed (retested)' ? '' : `${f.ID} (${f.Severity}) is ${f.Status}; it must be Fixed (retested) by the reviewer`
    case 'Medium': {
      if (fixedStatus(f.Status)) return ''
      if (f.Status === 'Accepted') {
        const target = VERSION.exec(f.Fix)?.[1]
        const reason = f.Fix.replace(VERSION, '').replace(/\b(target|by|in)\b/gi, '').replace(/[\s.,;:()-]/g, '')
        if (!target || !reason) return `${f.ID} (Medium) is Accepted without a reason and a target version in its Fix column`
        if (cmp(target, version) < 0) return `${f.ID} (Medium) was accepted until ${target}; ${version} is past its target, so fix it first`
        return ''
      }
      return `${f.ID} (Medium) is ${f.Status}; fix it, or accept it with a reason and a target version`
    }
    default:
      if (fixedStatus(f.Status) || issueLink(f.Fix)) return ''
      if (f.Status === "Won't fix" && f.Fix.trim()) return ''
      return `${f.ID} (${f.Severity}) needs an issue link, or Won't fix with a reason`
  }
}

/**
 * The release gate (design D4). Throws, naming each blocking finding, when `version` (>= 1.0.0)
 * may not ship: the newest review is more than 24 months old, a new major has no review since the
 * previous major's last release (`fromDate`), or a finding breaks the fix rule. No review file passes.
 */
export function checkSecurityReviews(root, version, from, date, fromDate = '') {
  const major = Number(version.split('.')[0])
  if (major < FIRST_GATED_MAJOR) return
  const files = reviewFiles(root)
  if (files.length === 0) return
  const reviews = files.map((f) => ({ ...f, review: parseReview(f.text) }))
  const broken = reviews.filter((r) => r.review.errors.length)
  if (broken.length) throw new Error(`security review files are malformed (node --test scripts/security-review.test.mjs): ${broken.map((r) => r.rel).join(', ')}`)
  const newest = reviews.map((r) => r.review.record.Delivered).sort().at(-1)
  const problems = []
  if (monthsBetween(newest, date) >= MAX_AGE_MONTHS) problems.push(`the newest external review was delivered on ${newest}, more than ${MAX_AGE_MONTHS} months ago: a new external review is due`)
  const newMajor = /^\d+\.0\.0$/.test(version) && Number(from.split('.')[0]) < major
  if (newMajor && major > FIRST_GATED_MAJOR && fromDate && newest <= fromDate) problems.push(`${version} is a new major version and no external review was delivered after ${from} (${fromDate}): a new external review is due`)
  for (const r of reviews) for (const f of r.review.findings) {
    const why = blockingReason(f, version)
    if (why) problems.push(`${r.rel}: ${why}`)
  }
  if (problems.length) throw new Error(`the security review gate refuses ${version}:\n  - ${problems.join('\n  - ')}`)
}
