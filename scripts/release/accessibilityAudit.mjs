// The manual accessibility audit a release needs (OpenSpec accessibility "Recorded manual
// audit", change accessibility-aa D4): the latest docs/accessibility/audit-<version>.md is at
// most 12 months older than the release, and from 1.0.0 on every core screen's passes are
// done (no `pending`); a release candidate may still have screen-reader passes pending
// (release-candidates). Read by prepare.mjs (make release-prepare).
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

/** The passes that need a screen reader; any release may have them pending (screen-reader-passes-optional). */
export const SCREEN_READER_PASSES = PASSES.filter((p) => /NVDA|VoiceOver|TalkBack/.test(p))

/**
 * What keeps a release of `version` on `date` back, in order: [{ text, screen, pass, file }], where
 * only a pending pass carries its screen id, pass name and audit file. [] when it may go.
 */
export function auditFindings(root, version, date) {
  const latest = auditFiles(root)[0]
  const gated = Number(version.split('.')[0]) >= FIRST_GATED_MAJOR
  if (!latest) return gated ? [{ text: 'no manual accessibility audit (docs/accessibility/audit-<version>.md)' }] : []
  const { date: done, rows } = parseAudit(readFileSync(join(root, latest.file), 'utf8'))
  if (!done) return [{ text: `${latest.file}: no "Date: YYYY-MM-DD" line` }]
  const out = []
  if (date > addMonths(done, MAX_AGE_MONTHS)) out.push({ text: `a manual accessibility audit is due: ${latest.file} is from ${done}, more than ${MAX_AGE_MONTHS} months before ${date} (steps in docs/accessibility.md)` })
  if (gated) {
    const entries = JSON.parse(readFileSync(join(root, 'scripts/ux-audit/screens.json'), 'utf8'))
    for (const e of entries.filter((x) => x.core)) {
      const cells = rows.get(e.id)
      if (!cells) { out.push({ text: `${latest.file}: no row for the core screen ${e.id}` }); continue }
      cells.forEach((c, i) => {
        const kind = cellKind(c).kind
        if (kind === 'pending') out.push({ text: `${latest.file}: ${e.id}, ${PASSES[i]} is still pending`, screen: e.id, pass: PASSES[i], file: latest.file })
        else if (kind === 'invalid') out.push({ text: `${latest.file}: ${e.id}, ${PASSES[i]} is "${c}", not pass, fail #<issue>, n/a <reason> or pending` })
      })
    }
  }
  return out
}

/** The problems that keep a release of `version` on `date` back: [] when it may go. */
export function auditProblems(root, version, date) {
  return auditFindings(root, version, date).map((f) => f.text)
}

/**
 * Throws when the release may not go; returns the warnings. Pending screen-reader passes are one
 * line naming how many are pending, for the release notes (screen-reader-passes-optional); every
 * other problem refuses the release, a candidate or not.
 */
export function checkAccessibilityAudit(root, version, date) {
  if (!existsSync(join(root, 'scripts/ux-audit/screens.json'))) return []
  const findings = auditFindings(root, version, date)
  const waived = findings.filter((f) => SCREEN_READER_PASSES.includes(f.pass))
  const problems = findings.filter((f) => !waived.includes(f)).map((f) => f.text)
  if (problems.length) throw new Error(`accessibility audit:\n  ${problems.slice(0, 20).join('\n  ')}${problems.length > 20 ? `\n  … and ${problems.length - 20} more` : ''}`)
  if (!waived.length) return []
  const screens = new Set(waived.map((f) => f.screen))
  const passes = SCREEN_READER_PASSES.filter((p) => waived.some((f) => f.pass === p))
  return [`accessibility audit: ${waived.length} screen-reader passes pending on ${screens.size} core screens in ${waived[0].file} (${passes.join(', ')}), recorded when someone runs them (#9)`]
}
