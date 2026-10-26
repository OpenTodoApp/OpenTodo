// The encryption migration over a large account (large-list-performance): it reads
// each task a fixed few times, not the whole table per batch. 2,000 tasks, so it runs
// in the perf project (`npm run test:perf`), alone, not racing the unit suite.
import { describe, expect, it, vi } from 'vitest'
import type { KeyRecord } from './crypto'

const server = vi.hoisted(() => ({ record: null as KeyRecord | null }))

vi.mock('./api', () => ({
  ApiError: class extends Error {},
  api: {
    encryptionKeys: async () => ({ keys: structuredClone(server.record) }),
    putEncryptionKeys: async (r: KeyRecord) => {
      server.record = { ...r, createdAt: Date.now(), updatedAt: Date.now() }
      return { keys: structuredClone(server.record) }
    },
    listNotifications: async () => ({ notifications: [], unread: 0 }),
  },
}))

import { ITERATION_LIMITS } from './crypto'
import { db, useDatabase } from './db'
import { enableEncryption, loadEncryptionState } from './e2ee'
import { MIGRATION_BATCH, startMigration } from './e2eeSync'
import { applyOps, resetDeviceId } from './ops'
import type { Op } from './types'

ITERATION_LIMITS.min = 1000

describe('migration job (task 2.4)', () => {
  it('reads each task about once per run, not the whole table per batch (large-list-performance)', async () => {
    useDatabase('e2ee-migration-perf')
    resetDeviceId()
    await loadEncryptionState()
    const many = MIGRATION_BATCH * 10
    const ops: Op[] = []
    for (let i = 0; i < many; i++) ops.push({ id: `seed-${i}`, entity: 'task', entityId: `t${String(i).padStart(5, '0')}`, field: 'title', value: `Task ${i}`, ts: 100, device: 'old' })
    await applyOps(ops)
    await enableEncryption('correct horse battery staple', { iterations: 1000 })
    let reads = 0
    const count = (row: unknown) => { reads++; return row }
    db.tasks.hook('reading', count)
    try {
      await startMigration('encrypt')
    } finally {
      db.tasks.hook('reading').unsubscribe(count)
    }
    console.info(`[large-list-performance] task rows read by the migration of ${many} tasks: ${reads} (${(reads / many).toFixed(1)} per task)`)
    expect((await db.outbox.toArray()).filter((o) => o.field === 'title')).toHaveLength(many)
    // Counting the work, the batch and writing each row back: a fixed few reads per task
    // (about 5), where re-reading the table for each of the ten batches took about 20.
    expect(reads).toBeLessThan(many * 8)
  }, 120_000)
})
