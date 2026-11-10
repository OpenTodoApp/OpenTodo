// The session on both candidates on a computer, over node:sqlite: a check that the
// harness works before it runs on the simulator, and a reference for its numbers.
// SPIKE_ROWS=<rows.json> npx jest -c spike/jest.config.js local
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resetModuleState } from '@shared/moduleState'
import { nodeSql } from './node/nodeSql'
import { measure, seed, type Candidate, type Rows } from './scenario'
import { installSql } from './sqlite'

const ROWS = process.env.SPIKE_ROWS
const run = ROWS ? it : it.skip
;(globalThis as { self?: unknown }).self ??= globalThis

const hooks = {
  draw: () => new Promise<void>((r) => setTimeout(r, 0)),
  frames: () => {
    let last = performance.now()
    let longest = 0
    const tick = setInterval(() => { const n = performance.now(); longest = Math.max(longest, n - last); last = n }, 16)
    return () => { clearInterval(tick); return Math.max(longest, performance.now() - last) }
  },
}

for (const candidate of (process.env.SPIKE_CANDIDATES ?? 'A,A0,B').split(',') as Candidate[]) {
  run(`candidate ${candidate}`, async () => {
    installSql(nodeSql(mkdtempSync(join(tmpdir(), `spike-${candidate}-`))))
    const rows = JSON.parse(readFileSync(ROWS!, 'utf8')) as Rows
    process.stderr.write(JSON.stringify(await seed(candidate, rows)) + "\n")
    for (let i = 0; i < 2; i++) {
      resetModuleState()
      const r = await measure(candidate, hooks, performance.now())
      process.stderr.write(JSON.stringify(r) + "\n")
      expect(r.pullApplied).toBe(true)
    }
  })
}
