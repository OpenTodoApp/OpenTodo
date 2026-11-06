// The reference-device record of a minor release (OpenSpec change performance-10k,
// design D5): docs/performance/results-<version>.md, with every value within its
// budget of scripts/perf/budgets.json or linking the issue that tracks it. Read by
// prepare.mjs (make release-prepare). The steps are in scripts/perf/device.md.
//
// The record is optional until real devices can be measured (owner decision 2026-11-07,
// #990): a release without one passes, and a record that exists is checked.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The record's columns and the budget setting each one is held to. */
export const COLUMNS = { Android: 'device-android', iPhone: 'device-ios', 'Raspberry Pi 4': 'pi4' }

/** Minor releases from this major on are checked against their record (the first is 1.0.0). */
export const FIRST_GATED_MAJOR = 1

export function recordPath(version) {
  return `docs/performance/results-${version}.md`
}

/** Whether a release of `version` after `from` is a minor whose record, if any, is checked. */
export function needsRecord(version, from) {
  const [maj, min, patch] = version.split('.').map(Number)
  const [fmaj, fmin] = from.split('.').map(Number)
  const minor = patch === 0 && (maj !== fmaj || min !== fmin)
  return minor && maj >= FIRST_GATED_MAJOR
}

/** The problems of a record's text against the budgets: [] when the release may go. */
export function recordProblems(text, budgets) {
  const out = []
  const limits = new Map(budgets.metrics.map((m) => [m.id, m]))
  let header = null
  let values = 0
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) { header = null; continue }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.every((c) => /^-+$/.test(c))) continue
    if (!header) { header = cells; continue }
    const id = /^`([a-z0-9-]+)`/.exec(cells[0])?.[1]
    if (!id) continue
    const m = limits.get(id)
    if (!m) { out.push(`${id}: not a metric of scripts/perf/budgets.json`); continue }
    header.forEach((col, i) => {
      const setting = COLUMNS[col]
      const cell = cells[i] ?? ''
      if (!setting || cell === '' || cell === '—') return
      const value = Number(/^[\d,.]+/.exec(cell)?.[0].replace(/,/g, ''))
      if (!Number.isFinite(value)) { out.push(`${id}, ${col}: "${cell}" is not a number`); return }
      values++
      const limit = m.limits[setting]
      const issue = /#\d+|github\.com\/[^\s)]+\/issues\/\d+/.test(cell)
      if (limit !== undefined && value > limit && !issue) out.push(`${id}, ${col}: ${value} ${m.unit} is over the budget of ${limit} ${m.unit} and links no issue`)
    })
  }
  if (values === 0) out.push('no measured value (see scripts/perf/device.md for the table)')
  return out
}

/**
 * Throws when the record of a minor release `version` after `from` exists and has a value that
 * is not a number or is over budget without an issue. A missing record passes (#990).
 */
export function checkDeviceRecord(root, version, from) {
  if (!needsRecord(version, from)) return
  const path = recordPath(version)
  if (!existsSync(join(root, path))) return
  const budgets = JSON.parse(readFileSync(join(root, 'scripts/perf/budgets.json'), 'utf8'))
  const problems = recordProblems(readFileSync(join(root, path), 'utf8'), budgets)
  if (problems.length) throw new Error(`${path}:\n  ${problems.join('\n  ')}`)
}
