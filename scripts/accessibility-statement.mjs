// The accessibility conformance statement's generated parts (OpenSpec accessibility
// "Published conformance statement", change accessibility-aa D5): docs/accessibility.md
// is written by hand except the conformance claim and the per-screen results, which
// come from the screen inventory (scripts/ux-audit/screens.json) and the latest
// manual audit record (docs/accessibility/audit-<version>.md). The repository check
// (scripts/accessibility.test.mjs) fails when the committed parts differ from these.
//
//   node scripts/accessibility-statement.mjs           rewrite docs/accessibility.md
//   node scripts/accessibility-statement.mjs --check   exit 1 when it is out of date
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ROOT = fileURLToPath(new URL('..', import.meta.url))
export const STATEMENT = 'docs/accessibility.md'
export const AUDIT_DIR = 'docs/accessibility'

/** The manual passes, in the audit record's column order (design D4). */
export const PASSES = ['Keyboard only', 'NVDA + Firefox', 'VoiceOver + Safari (macOS)', 'VoiceOver (iOS shell)', 'TalkBack (Android shell)', '200% zoom, text size 20']

const VERSION = /^audit-(\d+)\.(\d+)\.(\d+)\.md$/

/** The audit records, newest version first: [{ file, version }]. */
export function auditFiles(root = ROOT) {
  const dir = join(root, AUDIT_DIR)
  if (!existsSync(dir)) return []
  return readdirSync(dir).map((f) => ({ f, m: VERSION.exec(f) })).filter((x) => x.m)
    .sort((a, b) => b.m[1] - a.m[1] || b.m[2] - a.m[2] || b.m[3] - a.m[3])
    .map((x) => ({ file: `${AUDIT_DIR}/${x.f}`, version: `${x.m[1]}.${x.m[2]}.${x.m[3]}` }))
}

/**
 * An audit record: its date (the "Date: YYYY-MM-DD" line) and one row per screen
 * (`| \`id\` | cell | … |`), each cell `pass`, `fail #<issue>`, `n/a <reason>` or `pending`.
 */
export function parseAudit(text) {
  const date = /^Date: (\d{4}-\d{2}-\d{2})\s*$/m.exec(text)?.[1] ?? null
  const rows = new Map()
  for (const line of text.split('\n')) {
    const m = /^\| `([a-z0-9-]+)` \|(.*)\|\s*$/.exec(line)
    if (m) rows.set(m[1], m[2].split('|').map((c) => c.trim()))
  }
  return { date, rows }
}

/** What a cell says: pass, fail (with its issue), n/a (with its reason), pending, or invalid. */
export function cellKind(cell) {
  if (cell === 'pass') return { kind: 'pass' }
  const fail = /^fail #(\d+)$/.exec(cell)
  if (fail) return { kind: 'fail', issue: Number(fail[1]) }
  if (/^n\/a \S/.test(cell)) return { kind: 'n/a' }
  if (cell === 'pending') return { kind: 'pending' }
  return { kind: 'invalid' }
}

/** The issues listed under "Known exceptions" (the `#n` in its table's issue column). */
export function exceptionIssues(statement) {
  const section = statement.split(/^## /m).find((s) => s.startsWith('Known exceptions')) ?? ''
  return new Set([...section.matchAll(/#(\d+)/g)].map((m) => Number(m[1])))
}

/** The claim (design D5): "Fully conforms" only with no exception and nothing pending. */
export function claim(statement, audit) {
  const exceptions = exceptionIssues(statement).size > 0
  const pending = [...(audit?.rows.values() ?? [])].some((cells) => cells.some((c) => cellKind(c).kind === 'pending' || cellKind(c).kind === 'fail'))
  return exceptions || pending || !audit ? 'Partially conforms' : 'Fully conforms'
}

const summarise = (cells) => {
  if (!cells) return '—'
  const kinds = cells.map(cellKind)
  const fails = kinds.filter((k) => k.kind === 'fail')
  if (fails.length) return `fail (${fails.map((k) => `#${k.issue}`).join(', ')})`
  const pending = kinds.filter((k) => k.kind === 'pending').length
  if (pending) return `${kinds.filter((k) => k.kind === 'pass' || k.kind === 'n/a').length} of ${kinds.length} passes done, ${pending} pending`
  return 'pass'
}

/** The generated parts of the statement for these inputs. */
export function generated(statement, entries, audit) {
  const rows = entries.map((e) => {
    const auto = e.tour === false ? 'not toured (see note)' : 'pass'
    const manual = e.core ? summarise(audit?.rows.get(e.id)) : 'not in the manual audit'
    return `| \`${e.id}\` | ${e.core ? 'core' : 'rare'} | ${auto} | ${manual} |`
  })
  const table = ['| Screen | Use | Automated gate | Manual audit |', '|---|---|---|---|', ...rows].join('\n')
  return { claim: claim(statement, audit), table }
}

const CLAIM = /(<!-- accessibility:claim -->)[^]*?(<!-- \/accessibility:claim -->)/
const TABLE = /(<!-- accessibility:results -->)[^]*?(<!-- \/accessibility:results -->)/

/** The statement with its generated parts replaced. */
export function render(statement, entries, audit) {
  const g = generated(statement, entries, audit)
  return statement.replace(CLAIM, `$1**${g.claim}**$2`).replace(TABLE, `$1\n${g.table}\n$2`)
}

export function load(root = ROOT) {
  const statement = readFileSync(join(root, STATEMENT), 'utf8')
  const entries = JSON.parse(readFileSync(join(root, 'scripts/ux-audit/screens.json'), 'utf8'))
  const latest = auditFiles(root)[0]
  const audit = latest ? { ...latest, ...parseAudit(readFileSync(join(root, latest.file), 'utf8')) } : null
  return { statement, entries, audit }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { statement, entries, audit } = load()
  const next = render(statement, entries, audit)
  if (process.argv.includes('--check')) {
    if (next !== statement) { console.error(`${STATEMENT} is out of date: run node scripts/accessibility-statement.mjs`); process.exit(1) }
    console.log(`${STATEMENT}: up to date`)
  } else {
    writeFileSync(join(ROOT, STATEMENT), next)
    console.log(`wrote ${STATEMENT}`)
  }
}
