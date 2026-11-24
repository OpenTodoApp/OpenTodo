// knip in production mode over web/ (config: web/knip.json), run by `npm run knip`
// and `npm run lint`. Unused files, unused or unlisted dependencies, unresolved
// imports and duplicate exports fail outright. Unused exports (exported, but read only
// by tests, stories or nothing) are a ratchet: the count may not differ from
// MAX_UNUSED_EXPORTS; when it falls, lower the number in the same change.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const MAX_UNUSED_EXPORTS = 97

// Every finding of a knip JSON report, as `kind: file: name` lines.
export function findings(report) {
  const out = []
  for (const file of report.files ?? []) out.push(`files: ${file}`)
  for (const issue of report.issues ?? []) {
    for (const [kind, list] of Object.entries(issue)) {
      if (kind === 'file' || kind === 'owners' || !list || typeof list !== 'object') continue
      // enumMembers and classMembers are { parent: [members] }.
      const items = Array.isArray(list) ? list : Object.values(list).flat()
      for (const item of items) {
        const name = Array.isArray(item) ? item.map((i) => i.name).join(' = ') : item.name
        out.push(`${kind}: ${issue.file}: ${name}`)
      }
    }
  }
  return out
}

// The failure lines: every finding but unused exports, and the export count off the ratchet.
export function problems(lines, max = MAX_UNUSED_EXPORTS) {
  const exports = lines.filter((l) => l.startsWith('exports: '))
  const out = lines.filter((l) => !l.startsWith('exports: '))
  if (exports.length > max) {
    out.push(...exports, `unused exports: ${exports.length}, more than ${max}; use them, or drop the export keyword or the code`)
  } else if (exports.length < max) {
    out.push(`unused exports: ${exports.length}, fewer than ${max}; lower MAX_UNUSED_EXPORTS in web/scripts/knip.mjs to ${exports.length}`)
  }
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const run = spawnSync('knip', ['--production', '--no-progress', '--reporter', 'json'], { cwd: web, encoding: 'utf8', maxBuffer: 64 << 20 })
  if (run.error || !run.stdout.trim()) {
    process.stderr.write(run.stderr || String(run.error))
    process.exit(2)
  }
  const out = problems(findings(JSON.parse(run.stdout)))
  if (out.length) {
    console.error(out.join('\n'))
    process.exit(1)
  }
  console.log(`knip: no unused files, dependencies or duplicate exports; ${MAX_UNUSED_EXPORTS} unused exports (the ratchet)`)
}
