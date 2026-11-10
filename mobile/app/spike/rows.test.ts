// Builds the perfseed account's local rows: every pulled page through the shared
// applyOps on an in-memory IndexedDB, as a first sync would, then each table as JSON.
// SPIKE_OPS=<host.mjs dump output> SPIKE_ROWS=<out> npx jest -c spike/jest.config.js rows
import { readFileSync, writeFileSync } from 'node:fs'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { useDatabase as databaseNamed } from '@shared/db'
import { applyOps } from '@shared/ops'
import type { Op } from '@shared/types'

const OPS = process.env.SPIKE_OPS
const run = OPS ? it : it.skip

run('builds the rows', async () => {
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  const db = databaseNamed('opentodo-rows')
  await db.open()
  const dump = JSON.parse(readFileSync(OPS!, 'utf8')) as { pages: { ops: Op[]; memberships: Record<string, unknown>[] }[] }
  const t0 = Date.now()
  for (const [i, page] of dump.pages.entries()) {
    await applyOps(page.ops)
    if (i % 10 === 9) process.stderr.write(`rows: page ${i + 1} of ${dump.pages.length}, ${Date.now() - t0} ms\n`)
  }
  const last = dump.pages.at(-1)
  if (last?.memberships.length) await db.table('memberships').bulkPut(last.memberships)
  const rows: Record<string, unknown[]> = {}
  for (const t of db.tables) if (t.name !== 'outbox') rows[t.name] = await t.toArray()
  writeFileSync(process.env.SPIKE_ROWS ?? 'rows.json', JSON.stringify(rows))
  const counts = Object.fromEntries(Object.entries(rows).filter(([, l]) => l.length).map(([k, l]) => [k, l.length]))
  console.log(`rows: applied in ${Date.now() - t0} ms`, JSON.stringify(counts))
  expect(rows.tasks.length).toBeGreaterThanOrEqual(10_000)
})
