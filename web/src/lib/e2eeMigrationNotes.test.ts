// Issue #96: turning encryption off stalls when a task carries a note document
// and the rich-text module has not been loaded yet in this page load.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeyRecord } from './crypto'
import type { Op } from './types'

const { server, MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message)
    }
  }
  const server = {
    log: [] as (Op & { seq: number })[],
    seq: 0,
    record: null as KeyRecord | null,
    /** Number of further sync calls that fail like a dropped connection. */
    failNext: 0,
    calls: [] as { device: string; ops: Op[] }[],
    /** The account has the weekly email digest on (stats-and-review): enabling encryption turns it off. */
    digestOn: false,
  }
  return { server, MockApiError }
})

vi.mock('./api', () => ({
  ApiError: MockApiError,
  api: {
    sync: async (device: string, cursor: number, ops: Op[]) => {
      if (server.failNext > 0) {
        server.failNext--
        throw new TypeError('network down')
      }
      server.calls.push({ device, ops: structuredClone(ops) })
      let applied = 0
      for (const op of ops) {
        if (server.log.some((o) => o.id === op.id)) continue
        server.log.push({ ...structuredClone(op), seq: ++server.seq })
        applied++
      }
      return { applied, ops: server.log.filter((o) => o.seq > cursor && o.device !== device), cursor: server.seq, hasMore: false, serverTime: Date.now() }
    },
    encryptionKeys: async () => {
      if (!server.record) throw new MockApiError(404, 'encryption_disabled', 'not enabled')
      return { keys: structuredClone(server.record) }
    },
    putEncryptionKeys: async (r: KeyRecord) => {
      if (r.version !== (server.record?.version ?? 0) + 1) throw new MockApiError(409, 'encryption_conflict', 'conflict')
      const created = !server.record
      server.record = { ...r, createdAt: server.record?.createdAt ?? Date.now() + server.seq, updatedAt: Date.now() }
      const digestDisabled = created && server.digestOn
      if (digestDisabled) server.digestOn = false
      return { keys: structuredClone(server.record), ...(digestDisabled ? { digestDisabled: true } : {}) }
    },
    deleteEncryptionKeys: async () => {
      if (!server.record) throw new MockApiError(404, 'encryption_disabled', 'not enabled')
      server.record = null
    },
    purgeEncryptionHistory: async () => ({ purged: 0, notice: 'Backups may still contain plaintext' }),
    listNotifications: async () => ({ notifications: [], unread: 0 }),
  },
}))

import { db, useDatabase } from './db'
import { resetRichTextForTests } from './docfields'
import { disableEncryption, enableEncryption, loadEncryptionState } from './e2ee'
import { runMigration, startMigration } from './e2eeSync'
import { applyOps, resetDeviceId } from './ops'
import { syncNow } from './sync'

const PASS = 'correct horse battery staple'
const FAST = { iterations: 1000 }

beforeEach(async () => {
  server.log = []; server.seq = 0; server.record = null; server.failNext = 0; server.calls = []; server.digestOn = false
  useDatabase(`e2ee-notes-${Date.now()}`)
  resetDeviceId()
  await loadEncryptionState()
})
afterEach(() => vi.useRealTimers())

async function seed() {
  const ops: Op[] = [
    { id: 'o1', entity: 'project', entityId: 'p1', field: 'name', value: 'Health', ts: 100, device: 'old' },
    { id: 'o2', entity: 'project', entityId: 'p1', field: 'description', value: 'Goal', ts: 100, device: 'old' },
    { id: 'o3', entity: 'task', entityId: 't1', field: 'title', value: 'Dentist', ts: 100, device: 'old' },
    { id: 'o4', entity: 'task', entityId: 't1', field: 'description', value: 'Ask about the crown', ts: 100, device: 'old' },
    { id: 'o5', entity: 'task', entityId: 't1', field: 'notes_doc', value: 'ydoc:v1:AAEC', ts: 100, device: 'old' },
    { id: 'o6', entity: 'task', entityId: 't1', field: 'project_id', value: 'p1', ts: 100, device: 'old' },
  ]
  await applyOps(ops, { actor: 'me', local: false })
}

describe('disable with a note document (issue #96)', () => {
  it('re-writes a task that has a note document as plaintext', async () => {
    await seed()
    await enableEncryption(PASS, FAST)
    await startMigration('encrypt')
    await syncNow()
    // Settings opened after a reload: the note code is not in memory and the
    // decrypt job is the first thing that needs it.
    // Its fetch takes a real macrotask, as a network load does.
    resetRichTextForTests(async () => { await new Promise((r) => setTimeout(r, 20)); return import('./richtext') })
    await disableEncryption()
    await startMigration('decrypt')
    expect(await runMigration()).toBe(false) // nothing left to resume
    await syncNow()
    expect(server.record).toBeNull()
    const t = await db.tasks.get('t1')
    expect(t?._e2ee?.wire?.description).toBe('p')
  })
})
