// The conformance statement and the manual audit record (OpenSpec accessibility
// "Published conformance statement" and "Recorded manual audit", change accessibility-aa
// D4 and D5), in make repo-check: the statement's generated parts are current, every core
// screen has a complete row in the latest audit record, and every failure there is a
// listed exception. Run: node --test scripts/accessibility.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PASSES, cellKind, claim, exceptionIssues, load, parseAudit, render } from './accessibility-statement.mjs'

const { statement, entries, audit } = load()

test('the statement names the standard, a version and date, and how to report a barrier', () => {
  assert.match(statement, /WCAG 2\.2 Level AA/)
  assert.match(statement, /<!-- accessibility:claim -->\*\*(Fully|Partially) conforms\*\*<!-- \/accessibility:claim -->/)
  assert.match(statement, /10 business days/)
  assert.match(statement, /^## Known exceptions$/m)
})

test('the generated claim and results table are up to date (node scripts/accessibility-statement.mjs)', () => {
  assert.equal(render(statement, entries, audit), statement)
})

test('every inventory entry has a row in the results table', () => {
  const missing = entries.filter((e) => !statement.includes(`| \`${e.id}\` |`)).map((e) => e.id)
  assert.deepEqual(missing, [])
})

test('the latest audit record has a dated, complete row for every core screen', () => {
  assert.ok(audit, 'no docs/accessibility/audit-<version>.md')
  assert.ok(audit.date, `${audit.file}: no "Date: YYYY-MM-DD" line`)
  const problems = []
  for (const e of entries.filter((x) => x.core)) {
    const cells = audit.rows.get(e.id)
    if (!cells) { problems.push(`${e.id}: no row`); continue }
    if (cells.length !== PASSES.length) problems.push(`${e.id}: ${cells.length} results for ${PASSES.length} passes`)
    cells.forEach((c, i) => { if (cellKind(c).kind === 'invalid') problems.push(`${e.id}, ${PASSES[i]}: "${c}" is not pass, fail #<issue>, n/a <reason> or pending`) })
  }
  assert.deepEqual(problems, [])
})

test('every failure in the audit record is a known exception of the statement', () => {
  const listed = exceptionIssues(statement)
  const unlisted = []
  for (const [id, cells] of audit.rows) {
    cells.forEach((c, i) => { const k = cellKind(c); if (k.kind === 'fail' && !listed.has(k.issue)) unlisted.push(`${id}, ${PASSES[i]}: #${k.issue}`) })
  }
  assert.deepEqual(unlisted, [])
})

test('parsing and the claim rule', () => {
  const a = parseAudit('Date: 2026-11-03\n\n| `inbox` | pass | fail #812 | n/a desktop only | pending | pass | pass |\n')
  assert.equal(a.date, '2026-11-03')
  assert.deepEqual(a.rows.get('inbox').map((c) => cellKind(c).kind), ['pass', 'fail', 'n/a', 'pending', 'pass', 'pass'])
  assert.equal(cellKind('n/a').kind, 'invalid')
  assert.equal(cellKind('').kind, 'invalid')
  const clean = parseAudit('Date: 2026-11-03\n\n| `inbox` | pass | pass | pass | pass | pass | pass |\n')
  assert.equal(claim('## Known exceptions\n\nNone.\n', clean), 'Fully conforms')
  assert.equal(claim('## Known exceptions\n\n| 2.5.7 | Board | menu | #812 | 1.1 |\n', clean), 'Partially conforms')
  assert.equal(claim('## Known exceptions\n\nNone.\n', a), 'Partially conforms')
})
