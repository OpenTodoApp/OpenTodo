// The manual accessibility audit a release needs (OpenSpec accessibility "Recorded manual
// audit", change accessibility-aa D4): the latest docs/accessibility/audit-<version>.md is at
// most 12 months older than the release, and from 1.0.0 on every core screen's passes are
// done (no `pending`). Read by prepare.mjs (make release-prepare).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { auditFiles, cellKind, parseAudit, PASSES } from '../accessibility-statement.mjs'

export const MAX_AGE_MONTHS = 12
/** Releases from this major on need every core screen's manual passes done. */
export const FIRST_GATED_MAJOR = 1

/** The day `months` after `date` (YYYY-MM-DD), as YYYY-MM-DD. */
export function addMonths(date, months) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

/** The problems that keep a release of `version` on `date` back: [] when it may go. */
export function auditProblems(root, version, date) {
  const latest = auditFiles(root)[0]
  const gated = Number(version.split('.')[0]) >= FIRST_GATED_MAJOR
  if (!latest) return gated ? ['no manual accessibility audit (docs/accessibility/audit-<version>.md)'] : []
  const { date: done, rows } = parseAudit(readFileSync(join(root, latest.file), 'utf8'))
  if (!done) return [`${latest.file}: no "Date: YYYY-MM-DD" line`]
  const out = []
  if (date > addMonths(done, MAX_AGE_MONTHS)) out.push(`a manual accessibility audit is due: ${latest.file} is from ${done}, more than ${MAX_AGE_MONTHS} months before ${date} (steps in docs/accessibility.md)`)
  if (gated) {
    const entries = JSON.parse(readFileSync(join(root, 'scripts/ux-audit/screens.json'), 'utf8'))
    for (const e of entries.filter((x) => x.core)) {
      const cells = rows.get(e.id)
      if (!cells) { out.push(`${latest.file}: no row for the core screen ${e.id}`); continue }
      cells.forEach((c, i) => { if (cellKind(c).kind === 'pending') out.push(`${latest.file}: ${e.id}, ${PASSES[i]} is still pending`) })
    }
  }
  return out
}

/** Throws when the release may not go. */
export function checkAccessibilityAudit(root, version, date) {
  if (!existsSync(join(root, 'scripts/ux-audit/screens.json'))) return
  const problems = auditProblems(root, version, date)
  if (problems.length) throw new Error(`accessibility audit:\n  ${problems.slice(0, 20).join('\n  ')}${problems.length > 20 ? `\n  … and ${problems.length - 20} more` : ''}`)
}
