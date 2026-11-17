// OpenSpec hygiene (a repo check): an open change whose tasks.md has every task ticked
// is finished and belongs in openspec/changes/archive/ (`/opsx:archive`), so the check
// fails on one. Changes untouched for a while are only reported: whether to finish,
// archive or drop them is a decision, not a mechanical fix.
// Used by scripts/repo-checks.test.mjs (`make repo-check`).
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const STALE_DAYS = 14

// The ticked and open checkboxes of a tasks.md.
export function taskCounts(md) {
  const done = md.match(/^\s*- \[[xX]\]/gm)?.length ?? 0
  const open = md.match(/^\s*- \[ \]/gm)?.length ?? 0
  return { done, open }
}

// Every change outside archive/ that has a tasks.md, with its counts.
export function openChanges(changesDir) {
  return readdirSync(changesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'archive')
    .map((d) => d.name)
    .filter((name) => existsSync(path.join(changesDir, name, 'tasks.md')))
    .sort()
    .map((name) => ({ name, ...taskCounts(readFileSync(path.join(changesDir, name, 'tasks.md'), 'utf8')) }))
}

// The failure lines: a change with at least one task and none open.
export function finishedProblems(changes) {
  return changes
    .filter((c) => c.done > 0 && c.open === 0)
    .map((c) => `openspec/changes/${c.name}: all ${c.done} tasks are ticked; archive it (/opsx:archive ${c.name})`)
}

// The warning lines: an unfinished change last committed more than `days` before `now`.
// `lastTouched(name)` gives a YYYY-MM-DD date, or '' when unknown (a shallow clone).
export function staleWarnings(changes, lastTouched, now = new Date(), days = STALE_DAYS) {
  const out = []
  for (const c of changes) {
    if (c.open === 0) continue
    const date = lastTouched(c.name)
    if (!date) continue
    const age = Math.floor((now - new Date(`${date}T00:00:00Z`)) / 86_400_000)
    if (age > days) out.push(`openspec/changes/${c.name}: ${c.done}/${c.done + c.open} tasks, untouched since ${date} (${age} days)`)
  }
  return out
}

// The last commit date of a change folder, from git ('' when git has none).
export function gitLastTouched(root) {
  return (name) => {
    try {
      return execFileSync('git', ['log', '-1', '--format=%cs', '--', `openspec/changes/${name}`], { cwd: root, encoding: 'utf8' }).trim()
    } catch {
      return ''
    }
  }
}
