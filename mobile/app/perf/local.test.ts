/**
 * @jest-environment node
 */
// The performance run's computer half (perf/jest.config.js, by hand or by app-perf):
//
//   PERF_OPS=<host.mjs dump output> PERF_ROWS=<out> npx jest -c perf/jest.config.js rows
//     Builds the account's local rows: every pulled page through the shared applyOps on
//     the adapter, as a first sync would, then each table as JSON for the app to seed.
//   PERF_ROWS=<rows.json> npx jest -c perf/jest.config.js session
//     The measured session on this computer over node:sqlite: a check that the harness
//     works before it runs on the simulator, and a reference for its numbers.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { markLongPull, withDeferredActivity } from '@shared/activity'
import { db, useDatabase as openDatabaseNamed } from '@shared/db'
import { resetModuleState } from '@shared/moduleState'
import { applyOps } from '@shared/ops'
import { installPlatform, platform } from '@shared/platform'
import type { Op } from '@shared/types'
import { sqliteDatabase } from '../src/storage/adapter'
import { nodeSqlite } from '../test/storage/nodeSqlite'
import { measure, seed, verify, write, type Rows } from './scenario'

const OPS = process.env.PERF_OPS
const ROWS = process.env.PERF_ROWS

function onSqlite(dir = mkdtempSync(join(tmpdir(), 'app-perf-'))) {
  const sql = nodeSqlite(dir)
  installPlatform({ ...platform, database: (declared) => sqliteDatabase(declared, sql) })
}

;(OPS ? it : it.skip)('rows: builds the account rows', async () => {
  onSqlite()
  openDatabaseNamed('opentodo-rows')
  const dump = JSON.parse(readFileSync(OPS!, 'utf8')) as { pages: { ops: Op[]; memberships: Record<string, unknown>[] }[] }
  const t0 = Date.now()
  await withDeferredActivity(async () => {
    for (const [i, page] of dump.pages.entries()) {
      if (i < dump.pages.length - 1) markLongPull()
      await applyOps(page.ops)
    }
  })
  const last = dump.pages.at(-1)
  if (last?.memberships.length) await db.memberships.bulkPut(last.memberships as never)
  const rows: Record<string, unknown[]> = {}
  for (const t of db.tables) if (t.name !== 'outbox') rows[t.name] = await t.toArray()
  writeFileSync(ROWS ?? 'rows.json', JSON.stringify(rows))
  const counts = Object.fromEntries(Object.entries(rows).filter(([, l]) => l.length).map(([k, l]) => [k, l.length]))
  console.log(`rows: ${dump.pages.length} pages applied in ${Date.now() - t0} ms`, JSON.stringify(counts))
  expect(rows.tasks.length).toBeGreaterThanOrEqual(10_000)
})

const hooks = {
  draw: () => new Promise<void>((r) => setTimeout(r, 0)),
  frames: () => {
    let last = performance.now()
    let longest = 0
    const tick = setInterval(() => { const n = performance.now(); longest = Math.max(longest, n - last); last = n }, 4)
    return () => { clearInterval(tick); return Math.max(longest, performance.now() - last) }
  },
}

;(ROWS && !OPS ? it : it.skip)('session: seed, three cold runs, kill after write', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'app-perf-'))
  onSqlite(dir)
  const rows = JSON.parse(readFileSync(ROWS!, 'utf8')) as Rows
  console.log(JSON.stringify(await seed(rows)))
  for (let i = 0; i < 3; i++) {
    resetModuleState()
    onSqlite(dir)
    const r = await measure(hooks, performance.now())
    console.log(JSON.stringify(r))
    expect(r.pullApplied).toBe(true)
  }
  resetModuleState()
  onSqlite(dir)
  const { id } = await write()
  resetModuleState()
  onSqlite(dir)
  const v = await verify(id as string)
  console.log(JSON.stringify(v))
  expect(v.ok).toBe(true)
})
