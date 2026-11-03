// The failures of the benchmark's reports, one per line ("first sync, desktop, 41 s,
// budget 30 s"), for the nightly alert. A report that is missing (its half of the
// benchmark did not finish) is named too.
//
//   node scripts/perf/failures.mjs perf-report/server.json perf-report/web.json
import { existsSync, readFileSync } from 'node:fs'

for (const path of process.argv.slice(2)) {
  if (!existsSync(path)) {
    console.log(`${path}: no report (the benchmark stopped before it)`)
    continue
  }
  const data = JSON.parse(readFileSync(path, 'utf8'))
  for (const report of Array.isArray(data) ? data : [data]) {
    for (const m of report.metrics ?? []) if (!m.ok) console.log(m.failure)
  }
}
