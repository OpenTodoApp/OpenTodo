// End-to-end encryption on the client (OpenSpec e2ee, tasks 1.2 and 2.1–2.4):
// key storage and unlocking, the field split, encryption at upload, decryption
// on receipt, encrypt-on-sight, the locked state and the migration job. Several
// devices share one in-memory server that stores ops exactly as received, so
// the tests can assert what the server holds.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeyRecord } from './crypto'
import type { Op } from './types'

type Stored = Op & { seq: number }
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
    issueConnections: [] as string[],
    /** Refuses an op with this reason (client-data-safety); null accepts it. */
    reject: null as ((op: Op) => string | null) | null,
    /** The log generation sent with every answer; a new value means "restored from a backup". */
    generation: undefined as string | undefined,
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
      const rejected: { id: string; reason: string }[] = []
      for (const op of ops) {
        const reason = server.reject?.(op)
        if (reason) {
          rejected.push({ id: op.id, reason })
          continue
        }
        if (server.log.some((o) => o.id === op.id)) continue
        server.log.push({ ...structuredClone(op), seq: ++server.seq })
        applied++
      }
      return { applied, ops: server.log.filter((o) => o.seq > cursor && o.device !== device), cursor: server.seq, hasMore: false, serverTime: Date.now(), rejected, ...(server.generation ? { generation: server.generation } : {}) }
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
      const stopped = created ? server.issueConnections : []
      return { keys: structuredClone(server.record), ...(digestDisabled ? { digestDisabled: true } : {}), ...(stopped.length ? { issueConnectionsStopped: stopped } : {}) }
    },
    deleteEncryptionKeys: async () => {
      if (!server.record) throw new MockApiError(404, 'encryption_disabled', 'not enabled')
      server.record = null
    },
    purgeEncryptionHistory: async () => ({ purged: 0, notice: 'Backups may still contain plaintext' }),
    listNotifications: async () => ({ notifications: [], unread: 0 }),
  },
}))

import { decryptValue, isEnvelope, ITERATION_LIMITS, KeyRecordParamsError, MAX_PLAINTEXT_BYTES } from './crypto'
import { DocTooLargeError, MAX_DOC_CHARS_ENCRYPTED } from './docfields'
import { db, getMeta, setMeta, useDatabase } from './db'
import {
  changePassphrase, commitEnable, currentKey, prepareEnable, disableEncryption, enableEncryption, EncryptionConflictError, encryptionSnapshot, loadEncryptionState, lock,
  MAX_FAILURES, notYetEncrypted, refreshFromServer, resetPassphrase, restoreKeyRecord, turnOffAfterMissingRecord, unlock, UnlockThrottledError, UNDECRYPTABLE,
} from './e2ee'
import { decryptIncoming, LockedError, MIGRATION_BATCH, normalizeOnSight, prepareOutgoing, runMigration, startMigration } from './e2eeSync'
import { applyOps, mutate, PlaintextTooLongError, resetDeviceId } from './ops'
import { syncNow, syncSnapshot } from './sync'

const PASS = 'correct horse battery staple'
const FAST = { iterations: 1000 }
// Fast derivations in tests: lower the accepted minimum (the range test restores it).
ITERATION_LIMITS.min = 1000
let run = 0

/** Switch the global database to one device's. */
async function on(name: string) {
  useDatabase(`e2ee-${run}-${name}`)
  resetDeviceId()
  await loadEncryptionState()
}

/** The server's current value of a field (last-writer-wins over the stored log). */
function current(entity: string, id: string, field: string): unknown {
  let best: Stored | undefined
  for (const o of server.log) {
    if (o.entity !== entity || o.entityId !== id || o.field !== field) continue
    if (!best || o.ts > best.ts || (o.ts === best.ts && o.device > best.device)) best = o
  }
  return best?.value
}

const sentAfter = (n: number) => server.calls.slice(n).flatMap((c) => c.ops)

beforeEach(() => {
  run++
  server.log = []
  server.seq = 0
  server.record = null
  server.failNext = 0
  server.calls = []
  server.digestOn = false
  server.issueConnections = []
  server.reject = null
  server.generation = undefined
})
afterEach(() => vi.useRealTimers())

async function seedTasks() {
  await mutate('project', 'p1', { name: 'Health', color: '#ef4444', position: 1, archived: false, parent_id: null, created_at: 1, deleted_at: null })
  await mutate('label', 'l1', { name: 'errand', color: '#22c55e', position: 1, created_at: 1, deleted_at: null })
  await mutate('task', 't1', {
    title: 'Dentist', description: 'Ask about the crown', project_id: 'p1', parent_id: null, priority: 1, due: { date: '2026-10-11' },
    labels: ['l1'], position: 1, created_at: 1, completed_at: null, deleted_at: null,
  })
  await syncNow()
}

async function enableOnA() {
  await on('A')
  await seedTasks()
  const { recoveryKey } = await enableEncryption(PASS, FAST)
  await startMigration('encrypt')
  await syncNow()
  return recoveryKey
}

describe('key storage and unlocking (task 1.2)', () => {
  it('keeps a non-extractable key in IndexedDB; lock forgets it and pauses sync', async () => {
    await enableOnA()
    const stored = await getMeta<CryptoKey | null>('e2ee.key', null)
    expect(stored).not.toBeNull()
    expect(stored!.extractable).toBe(false)
    expect(encryptionSnapshot()).toMatchObject({ enabled: true, unlocked: true, keyVersion: 1 })
    await lock()
    expect(await getMeta('e2ee.key', null)).toBeNull()
    expect(await currentKey()).toBeNull()
    const before = server.calls.length
    await syncNow()
    expect(syncSnapshot().state).toBe('locked')
    expect(server.calls.length).toBe(before)
    await unlock(PASS, 'passphrase')
    await syncNow()
    expect(syncSnapshot().state).toBe('idle')
    expect(server.calls.length).toBe(before + 1)
  })

  it('delays attempts after 5 failures within a minute, then allows them again', async () => {
    await enableOnA()
    await lock()
    const t0 = Date.now()
    for (let i = 0; i < MAX_FAILURES; i++) await expect(unlock('wrong passphrase!', 'passphrase', { now: t0 + i })).rejects.toThrow()
    await expect(unlock(PASS, 'passphrase', { now: t0 + 10 })).rejects.toBeInstanceOf(UnlockThrottledError)
    expect(await currentKey()).toBeNull()
    await unlock(PASS, 'passphrase', { now: t0 + 61_000 })
    expect(await currentKey()).not.toBeNull()
  })

  it('unlocks offline with the cached key record', async () => {
    await enableOnA()
    await lock()
    const api = (await import('./api')).api as unknown as { encryptionKeys: () => Promise<unknown> }
    const original = api.encryptionKeys
    api.encryptionKeys = async () => {
      throw new TypeError('offline')
    }
    try {
      await unlock(PASS, 'passphrase')
    } finally {
      api.encryptionKeys = original
    }
    expect(await currentKey()).not.toBeNull()
  })

  it('a second device creating its own record gets a conflict and must unlock instead', async () => {
    await enableOnA()
    await on('B')
    await expect(enableEncryption('another passphrase', FAST)).rejects.toBeInstanceOf(EncryptionConflictError)
    expect(server.record!.version).toBe(1)
    expect(encryptionSnapshot().enabled).toBe(true)
  })
})

describe('field split and transport (task 2.1)', () => {
  it('TestEncryptedFieldSplit: content is ciphertext on the server, due and priority stay plaintext', async () => {
    await enableOnA()
    expect(isEnvelope(current('task', 't1', 'title'))).toBe(true)
    expect(isEnvelope(current('task', 't1', 'description'))).toBe(true)
    expect(isEnvelope(current('project', 'p1', 'name'))).toBe(true)
    expect(isEnvelope(current('label', 'l1', 'name'))).toBe(true)
    expect(current('task', 't1', 'due')).toEqual({ date: '2026-10-11' })
    expect(current('task', 't1', 'priority')).toBe(1)
    expect(current('task', 't1', 'labels')).toEqual(['l1'])
    expect(current('project', 'p1', 'color')).toBe('#ef4444')
    // Locally everything is plaintext.
    expect((await db.tasks.get('t1'))!.title).toBe('Dentist')
  })

  it('the server never receives plaintext content after enabling, including offline edits', async () => {
    await enableOnA()
    const mark = server.calls.length
    const logMark = server.log.length
    await mutate('task', 't1', { title: 'Dentist on Friday' })
    await mutate('task', 't2', { title: 'Offline idea', description: 'secret plan', due: null, priority: 4, project_id: null, labels: [] })
    await mutate('view', 'v1', { name: 'Health stuff', query: 'search: crown' })
    await mutate('section', 's1', { name: 'Later', project_id: 'p1', position: 1, created_at: 1, deleted_at: null })
    await syncNow()
    const content = sentAfter(mark).filter((o) => ['title', 'description', 'name', 'query', 'body'].includes(o.field))
    expect(content.length).toBeGreaterThanOrEqual(6)
    for (const o of content) expect(isEnvelope(o.value), `${o.entity}.${o.field}`).toBe(true)
    expect(JSON.stringify(server.log.slice(logMark))).not.toMatch(/Offline idea|secret plan|Health stuff|crown"|Friday/)
  })

  it('a project note is ciphertext on the server and its position stays plaintext (project-notes 2.1)', async () => {
    await enableOnA()
    await mutate('project', 'p1', { description: 'Packing list', notes_doc: 'ydoc:v1:AAEC', position: 7 })
    await syncNow()
    expect(isEnvelope(current('project', 'p1', 'description'))).toBe(true)
    expect(isEnvelope(current('project', 'p1', 'notes_doc'))).toBe(true)
    expect(current('project', 'p1', 'position')).toBe(7)
    expect(JSON.stringify(server.log)).not.toMatch(/Packing list/)
    const before = await db.outbox.count()
    await expect(mutate('project', 'p1', { notes_doc: 'ydoc:v1:' + 'A'.repeat(MAX_DOC_CHARS_ENCRYPTED) })).rejects.toBeInstanceOf(DocTooLargeError)
    expect(await db.outbox.count()).toBe(before)
  })

  it('the line for tomorrow is ciphertext, the close time is not (close-the-day 1.3)', async () => {
    await enableOnA()
    await mutate('review', 'me', { closed_at: 1_760_000_000_000, tomorrow_note: 'Call the bank' })
    await syncNow()
    expect(isEnvelope(current('review', 'me', 'tomorrow_note'))).toBe(true)
    expect(current('review', 'me', 'closed_at')).toBe(1_760_000_000_000)
    expect(JSON.stringify(server.log)).not.toMatch(/Call the bank/)
    expect((await db.review.get('me'))!.tomorrow_note).toBe('Call the bank')
  })

  it('does not encrypt content of shared projects', async () => {
    await enableOnA()
    await db.memberships.put({ projectId: 'shared1', role: 'owner', ownerId: 'u1', members: [] })
    await mutate('task', 'ts', { title: 'Team task', project_id: 'shared1' })
    await syncNow()
    expect(current('task', 'ts', 'title')).toBe('Team task')
  })

  it('refuses content too long to encrypt before an op exists', async () => {
    await enableOnA()
    const before = await db.outbox.count()
    await expect(mutate('task', 't1', { description: 'x'.repeat(MAX_PLAINTEXT_BYTES + 1) })).rejects.toBeInstanceOf(PlaintextTooLongError)
    expect(await db.outbox.count()).toBe(before)
  })

  it('ciphertext variants: order independence, idempotency and stale remote ops', async () => {
    const key = await (async () => {
      await enableOnA()
      return (await currentKey())!
    })()
    const { encryptValue } = await import('./crypto')
    const mk = async (id: string, value: string, ts: number, device: string): Promise<Op> =>
      ({ id, entity: 'task', entityId: 'tx', field: 'title', value: await encryptValue(key, 'task', 'tx', 'title', value), ts, device })
    const ops = [await mk('x1', 'old', 100, 'A'), await mk('x2', 'new', 200, 'B'), await mk('x3', 'tie-low', 200, 'A')]
    const results: string[] = []
    for (const order of [[0, 1, 2], [2, 1, 0], [1, 0, 2, 1, 0]]) {
      await on(`order-${order.join('')}`)
      // Share the key with this scratch device.
      await setMeta('e2ee.key', key)
      await setMeta('e2ee.enabled', true)
      await loadEncryptionState()
      for (const i of order) {
        const inc = await decryptIncoming([ops[i]])
        await applyOps(inc.ops, { wire: inc.wire })
      }
      results.push((await db.tasks.get('tx'))!.title)
    }
    expect(results).toEqual(['new', 'new', 'new'])
  })
})

describe('two devices', () => {
  it('a second device enrols with the passphrase and both converge on concurrent edits', async () => {
    await enableOnA()
    // B signs in: it learns that the account encrypts and is locked until unlocked.
    await on('B')
    await syncNow()
    expect(syncSnapshot().state).toBe('locked')
    expect(await db.tasks.count()).toBe(0)
    await unlock(PASS, 'passphrase')
    await syncNow()
    expect((await db.tasks.get('t1'))!.title).toBe('Dentist')
    expect((await db.labels.get('l1'))!.name).toBe('errand')
    // Concurrent offline edits: A edits the title, B the title and the due date.
    await on('A')
    await mutate('task', 't1', { title: 'Dentist (A)' })
    await new Promise((r) => setTimeout(r, 3))
    await on('B')
    await mutate('task', 't1', { title: 'Dentist (B)', due: { date: '2026-10-20' } })
    await syncNow()
    await on('A')
    await syncNow()
    await on('B')
    await syncNow()
    const seen: string[] = []
    for (const d of ['A', 'B']) {
      await on(d)
      const t = (await db.tasks.get('t1'))!
      seen.push(`${t.title}|${t.due?.date}`)
    }
    expect(seen[0]).toBe(seen[1])
    expect(seen[0]).toBe('Dentist (B)|2026-10-20')
    expect(isEnvelope(current('task', 't1', 'title'))).toBe(true)
  })

  it('encrypt-on-sight: REST plaintext becomes ciphertext; two racing devices converge and stop', async () => {
    await enableOnA()
    await on('B')
    await unlock(PASS, 'passphrase')
    await syncNow()
    // A script writes a plaintext task through the REST API (device "server").
    const ts = Date.now()
    server.log.push(
      { id: 'rest1', entity: 'task', entityId: 'tr', field: 'title', value: 'From a script', ts, device: 'server', seq: ++server.seq },
      { id: 'rest2', entity: 'task', entityId: 'tr', field: 'due', value: { date: '2026-10-12' }, ts, device: 'server', seq: ++server.seq },
    )
    // B pulls it, queues the re-write, then loses the connection before uploading.
    server.failNext = 0
    const api = (await import('./api')).api as unknown as { sync: (...a: unknown[]) => Promise<unknown> }
    const realSync = api.sync
    let callsB = 0
    api.sync = async (...a: unknown[]) => {
      if (++callsB > 1) throw new TypeError('network down')
      return realSync(...a)
    }
    await syncNow()
    api.sync = realSync
    expect((await db.tasks.get('tr'))!.title).toBe('From a script')
    expect(await db.outbox.count()).toBe(1)
    // A pulls the plaintext too and re-writes it.
    await on('A')
    await syncNow()
    expect(isEnvelope(current('task', 'tr', 'title'))).toBe(true)
    await on('B')
    await syncNow()
    await on('A')
    await syncNow()
    const settled = server.log.length
    for (const d of ['A', 'B', 'A', 'B']) {
      await on(d)
      await syncNow()
      expect((await db.tasks.get('tr'))!.title).toBe('From a script')
      expect(await db.outbox.count()).toBe(0)
    }
    // Termination: no device writes anything more.
    expect(server.log.length).toBe(settled)
    expect(isEnvelope(current('task', 'tr', 'title'))).toBe(true)
    expect(current('task', 'tr', 'due')).toEqual({ date: '2026-10-12' })
    const t = (await db.tasks.get('tr'))!
    expect(notYetEncrypted(t as never, 'task')).toBe(false)
  })

  it('a value moved to another task shows the placeholder and keeps the op', async () => {
    await enableOnA()
    const moved = current('task', 't1', 'title') as string
    server.log.push({ id: 'evil', entity: 'task', entityId: 't9', field: 'title', value: moved, ts: Date.now() + 10, device: 'mallory', seq: ++server.seq })
    await syncNow()
    const t9 = (await db.tasks.get('t9'))!
    expect(t9.title).toBe(UNDECRYPTABLE)
    expect(t9._e2ee?.raw?.title).toBe(moved)
    expect(server.log.some((o) => o.id === 'evil')).toBe(true)
    // Nothing is re-written for it (it is not plaintext), and the key still opens the original.
    expect(await db.outbox.count()).toBe(0)
    expect(await decryptValue((await currentKey())!, 'task', 't1', 'title', moved)).toBe('Dentist')
  })
})

describe('passphrase change, recovery and disabling', () => {
  it('change passphrase: no content op; a new device unlocks with the new one; reset with the recovery key', async () => {
    const recovery = await enableOnA()
    const ops = server.log.length
    await changePassphrase(PASS, 'a different passphrase', FAST)
    expect(server.log.length).toBe(ops)
    expect(server.record!.version).toBe(2)
    await on('C')
    await syncNow()
    await expect(unlock(PASS, 'passphrase')).rejects.toThrow()
    await unlock('a different passphrase', 'passphrase')
    await syncNow()
    expect((await db.tasks.get('t1'))!.title).toBe('Dentist')
    // Forgotten passphrase: the recovery key resets it and is replaced.
    const { recoveryKey } = await resetPassphrase(recovery, 'third passphrase here', FAST)
    expect(recoveryKey).not.toBe(recovery)
    await lock()
    await expect(unlock(recovery, 'recovery')).rejects.toThrow()
    await unlock(recoveryKey, 'recovery')
    expect(await currentKey()).not.toBeNull()
    // A is unaffected: still unlocked with its cached key.
    await on('A')
    await syncNow()
    expect(syncSnapshot().state).toBe('idle')
  })

  it('disable: content is re-written as plaintext and other devices stop encrypting', async () => {
    await enableOnA()
    await on('B')
    await unlock(PASS, 'passphrase')
    await syncNow()
    await on('A')
    await disableEncryption()
    await startMigration('decrypt')
    await syncNow()
    expect(server.record).toBeNull()
    expect(current('task', 't1', 'title')).toBe('Dentist')
    expect(current('label', 'l1', 'name')).toBe('errand')
    const settled = server.log.length
    // B learns of it from the server, which alone never turns encryption off
    // (encryption-state-integrity): B pauses and asks; its user turns it off here.
    await on('B')
    await syncNow()
    expect(encryptionSnapshot()).toMatchObject({ enabled: true, recordMissing: true })
    expect(syncSnapshot().state).toBe('locked')
    await turnOffAfterMissingRecord()
    await syncNow()
    expect(encryptionSnapshot()).toMatchObject({ enabled: false, recordMissing: false })
    expect((await db.tasks.get('t1'))!.title).toBe('Dentist')
    await on('A')
    await syncNow()
    expect(server.log.length).toBe(settled)
  })
})

describe('a server without the key record (encryption-state-integrity)', () => {
  const contentSent = (n: number) => sentAfter(n).filter((o) => ['title', 'description', 'name'].includes(o.field) && typeof o.value === 'string' && o.value !== '')

  it('a 404 on refresh keeps encryption on and locks; nothing is uploaded until the user decides', async () => {
    await enableOnA()
    server.record = null
    await expect(refreshFromServer()).resolves.toBeNull()
    expect(encryptionSnapshot()).toMatchObject({ enabled: true, unlocked: true, recordMissing: true })
    await mutate('task', 't1', { title: 'Dentist at 3' })
    await expect(prepareOutgoing(await db.outbox.toArray())).rejects.toBeInstanceOf(LockedError)
    const before = server.calls.length
    await syncNow()
    expect(syncSnapshot().state).toBe('locked')
    expect(server.calls.length).toBe(before)
    // The state survives a reload.
    await loadEncryptionState()
    expect(encryptionSnapshot().recordMissing).toBe(true)
    // Restoring from this device's copy: same account key, sync resumes encrypted.
    await restoreKeyRecord()
    expect(server.record).not.toBeNull()
    expect(encryptionSnapshot()).toMatchObject({ enabled: true, unlocked: true, recordMissing: false })
    await syncNow()
    expect(syncSnapshot().state).toBe('idle')
    expect(isEnvelope(current('task', 't1', 'title'))).toBe(true)
    // Another device unlocks the restored record with the same passphrase.
    await on('B')
    await unlock(PASS, 'passphrase')
    await syncNow()
    expect((await db.tasks.get('t1'))!.title).toBe('Dentist at 3')
  })

  it('a device without the key restores the record with its passphrase', async () => {
    await enableOnA()
    await lock()
    server.record = null
    await refreshFromServer()
    expect(encryptionSnapshot()).toMatchObject({ enabled: true, unlocked: false, recordMissing: true })
    await expect(restoreKeyRecord('wrong passphrase!')).rejects.toThrow()
    expect(server.record).toBeNull()
    await restoreKeyRecord(PASS)
    expect(encryptionSnapshot()).toMatchObject({ enabled: true, unlocked: true, recordMissing: false })
  })

  it('restoring the server from a pre-encryption backup never uploads plaintext content', async () => {
    await on('A')
    await seedTasks()
    const before = structuredClone(server.log)
    await enableEncryption(PASS, FAST)
    await startMigration('encrypt')
    await syncNow()
    // The server goes back to the backup: plaintext log, no key record, new generation.
    server.generation = 'g1'
    await syncNow()
    server.log = before
    server.seq = before.length
    server.record = null
    server.generation = 'g2'
    const n = server.calls.length
    await syncNow()
    expect(syncSnapshot().state).toBe('locked')
    expect(encryptionSnapshot()).toMatchObject({ enabled: true, recordMissing: true })
    expect(contentSent(n).filter((o) => !isEnvelope(o.value))).toEqual([])
    // Restoring the record lets the re-seed go out, encrypted.
    await restoreKeyRecord()
    await syncNow()
    expect(syncSnapshot().state).toBe('idle')
    const sent = contentSent(n)
    expect(sent.length).toBeGreaterThan(0)
    expect(sent.filter((o) => !isEnvelope(o.value))).toEqual([])
  })

  it('explicit disable on the device still turns encryption off', async () => {
    await enableOnA()
    await disableEncryption()
    expect(server.record).toBeNull()
    expect(encryptionSnapshot()).toMatchObject({ enabled: false, recordMissing: false })
    await startMigration('decrypt')
    await syncNow()
    expect(syncSnapshot().state).toBe('idle')
    expect(current('task', 't1', 'title')).toBe('Dentist')
  })

  it('refuses a key record with an iteration count outside the accepted range and stays locked', async () => {
    await enableOnA()
    await on('B')
    const good = structuredClone(server.record!)
    const saved = ITERATION_LIMITS.min
    ITERATION_LIMITS.min = 100_000
    try {
      for (const iterations of [99_999, 10_000_001, 1.5]) {
        server.record = { ...good, iterations }
        await expect(unlock(PASS, 'passphrase')).rejects.toBeInstanceOf(KeyRecordParamsError)
        expect(await currentKey()).toBeNull()
        await syncNow()
        expect(syncSnapshot().state).toBe('locked')
      }
    } finally {
      ITERATION_LIMITS.min = saved
      server.record = good
    }
  })
})

describe('migration job (task 2.4)', () => {
  it('resumes after an interrupted run and ends with no plaintext content fields', async () => {
    await on('A')
    const many = MIGRATION_BATCH * 2 + 50
    const ops: Op[] = []
    for (let i = 0; i < many; i++) {
      const id = `t${String(i).padStart(4, '0')}`
      ops.push({ id: `seed-${i}`, entity: 'task', entityId: id, field: 'title', value: `Task ${i}`, ts: 100, device: 'old' })
      if (i % 3 === 0) ops.push({ id: `seedd-${i}`, entity: 'task', entityId: id, field: 'description', value: `Notes ${i}`, ts: 100, device: 'old' })
    }
    await applyOps(ops)
    await enableEncryption(PASS, FAST)
    await expect(startMigration('encrypt', { failAfterBatches: 1 })).rejects.toThrow(/interrupted/)
    const progress = await getMeta<{ done: number; total: number } | null>('e2ee.migration', null)
    expect(progress).toMatchObject({ done: MIGRATION_BATCH, total: many })
    expect(await runMigration()).toBe(true)
    expect(await getMeta('e2ee.migration', null)).toBeNull()
    const outbox = await db.outbox.toArray()
    // Every task re-written exactly once, every content field ciphertext on the wire.
    const titles = outbox.filter((o) => o.field === 'title')
    expect(new Set(titles.map((o) => o.entityId)).size).toBe(many)
    expect(titles.length).toBe(many)
    const wire = await prepareOutgoing(outbox.map(({ local: _l, ...o }) => o))
    for (const o of wire) expect(isEnvelope(o.value)).toBe(true)
    expect(encryptionSnapshot().migration).toBeNull()
  })

  it('reads each task about once per run, not the whole table per batch (large-list-performance)', async () => {
    await on('A')
    const many = MIGRATION_BATCH * 10
    const ops: Op[] = []
    for (let i = 0; i < many; i++) ops.push({ id: `seed-${i}`, entity: 'task', entityId: `t${String(i).padStart(5, '0')}`, field: 'title', value: `Task ${i}`, ts: 100, device: 'old' })
    await applyOps(ops)
    await enableEncryption(PASS, FAST)
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
  })

  it('encrypts an existing project description when encryption is turned on (project-notes 2.1)', async () => {
    await on('A')
    await applyOps([
      { id: 'pd1', entity: 'project', entityId: 'pp', field: 'name', value: 'Trip', ts: 100, device: 'old' },
      { id: 'pd2', entity: 'project', entityId: 'pp', field: 'description', value: 'Book the ferry', ts: 100, device: 'old' },
    ])
    await enableEncryption(PASS, FAST)
    await startMigration('encrypt')
    const outbox = await db.outbox.toArray()
    const wire = await prepareOutgoing(outbox.map(({ local: _l, ...o }) => o))
    const desc = wire.find((o) => o.entity === 'project' && o.field === 'description')
    expect(desc && isEnvelope(desc.value)).toBe(true)
  })

  it('normalizeOnSight ignores plaintext ops that no longer win', async () => {
    await enableOnA()
    const inc = await decryptIncoming([{ id: 'stale', entity: 'task', entityId: 't1', field: 'title', value: 'Old plaintext', ts: 5, device: 'server' }])
    await applyOps(inc.ops, { wire: inc.wire })
    expect(await normalizeOnSight(inc)).toBe(0)
    expect((await db.tasks.get('t1'))!.title).toBe('Dentist')
  })
})

describe('locked during an exchange (client-data-safety)', () => {
  it('keeps changes a limit refused and forgets refused ones when the answer turns out locked', async () => {
    await on('A')
    await seedTasks()
    await on('B')
    await syncNow()
    expect((await db.tasks.get('t1'))!.title).toBe('Dentist')
    // B edits while A turns encryption on.
    await mutate('task', 't1', { priority: 3 })
    await mutate('task', 't1', { position: 7 })
    await on('A')
    await enableEncryption(PASS, FAST)
    await startMigration('encrypt')
    await syncNow()
    await on('B')
    server.reject = (op) => (op.field === 'priority' ? 'limit_storage' : op.field === 'position' ? 'forbidden' : null)
    await syncNow()
    expect(syncSnapshot().state).toBe('locked')
    // The limited change is held for later, not lost with the sent batch.
    expect((await getMeta<Op[]>('heldOps', [])).map((o) => o.field)).toEqual(['priority'])
    expect(syncSnapshot().pending).toBe(1)
    // The refused one no longer claims to be the newest value.
    const t1 = (await db.tasks.get('t1'))!
    expect(t1._clock.position).toBeUndefined()
    expect(t1._clock.priority).toBeDefined()
    expect(syncSnapshot().rejected?.count).toBe(1)
  })
})

describe('link attachments (client-data-safety)', () => {
  const URL = 'https://example.org/private-plan'
  /** Ops the server holds for one attachment field, in arrival order. */
  const opsFor = (id: string, field: string) => server.log.filter((o) => o.entity === 'attachment' && o.entityId === id && o.field === field)
  /** The live link attachments of task t1 on the server. */
  const liveLinks = () => [...new Set(server.log.filter((o) => o.entity === 'attachment').map((o) => o.entityId))]
    .filter((id) => current('attachment', id, 'deleted_at') == null && current('attachment', id, 'task_id') === 't1')

  async function seedLink() {
    await on('A')
    await setMeta('userId', 'u1')
    await seedTasks()
    await mutate('attachment', 'a1', {
      task_id: 't1', author_id: 'u1', comment_id: null, name: 'Plan', mime: 'text/uri-list', size: 0, sha256: '', url: URL,
      encrypted: false, created_at: 1, uploaded_at: null, deleted_at: null,
    })
    await syncNow()
    expect(current('attachment', 'a1', 'url')).toBe(URL)
  }

  it('enabling encrypts an existing link as a new attachment; disabling decrypts it again', async () => {
    await seedLink()
    await enableEncryption(PASS, FAST)
    await startMigration('encrypt')
    await syncNow()
    // The server fixes url at creation: the old link is never re-written, it is replaced.
    expect(opsFor('a1', 'url')).toHaveLength(1)
    expect(current('attachment', 'a1', 'deleted_at')).not.toBeNull()
    const [enc] = liveLinks()
    expect(liveLinks()).toHaveLength(1)
    expect(isEnvelope(current('attachment', enc, 'url'))).toBe(true)
    expect(isEnvelope(current('attachment', enc, 'name'))).toBe(true)
    const local = await db.attachments.get(enc)
    expect(local).toMatchObject({ url: URL, name: 'Plan', task_id: 't1', deleted_at: null })
    // Nothing is left to migrate: a second run queues nothing.
    await startMigration('encrypt')
    expect(await db.outbox.count()).toBe(0)

    await disableEncryption()
    await startMigration('decrypt')
    await syncNow()
    expect(opsFor(enc, 'url')).toHaveLength(1)
    const [plain] = liveLinks()
    expect(liveLinks()).toHaveLength(1)
    expect(plain).not.toBe(enc)
    expect(current('attachment', plain, 'url')).toBe(URL)
    expect(current('attachment', plain, 'name')).toBe('Plan')
    await startMigration('decrypt')
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('server reads shown in the UI', () => {
  it('history and activity values are decrypted for display; foreign envelopes show the placeholder', async () => {
    await enableOnA()
    const { decryptActivityPage, decryptChanges } = await import('./e2ee')
    const title = current('task', 't1', 'title') as string
    const changes = await decryptChanges('task', 't1', [
      { field: 'title', from: 'Dentist', to: title },
      { field: 'due', from: null, to: { date: '2026-10-11' } },
      { field: 'description', from: title, to: '' },
    ])
    expect(changes.map((c) => [c.from, c.to])).toEqual([['Dentist', 'Dentist'], [null, { date: '2026-10-11' }], [UNDECRYPTABLE, '']])
    const page = await decryptActivityPage({ events: [{ entity: 'task' as const, entityId: 't1', taskId: 't1', taskTitle: title, changes: [] }] })
    expect(page.events[0].taskTitle).toBe('Dentist')
  })
})

describe('weekly digest (stats-and-review)', () => {
  it('enabling encryption reports that the server turned the digest off', async () => {
    await on('A')
    server.digestOn = true
    expect(await commitEnable(await prepareEnable(PASS, FAST))).toEqual({ digestDisabled: true, issueConnectionsStopped: [] })
  })

  it('reports nothing when no digest was on', async () => {
    await on('A')
    expect(await commitEnable(await prepareEnable(PASS, FAST))).toEqual({ digestDisabled: false, issueConnectionsStopped: [] })
  })

  it('reports the issue connections the server stopped (issue-import D11)', async () => {
    await on('A')
    server.issueConnections = ['Work', 'Home']
    expect(await commitEnable(await prepareEnable(PASS, FAST))).toEqual({ digestDisabled: false, issueConnectionsStopped: ['Work', 'Home'] })
  })
})

describe('task origins (task-origin 1.3)', () => {
  const ORIGIN = { kind: 'url', url: 'https://example.org/post', title: 'Interesting article' }

  it('an origin leaves as one ciphertext string and comes back as the object on another device', async () => {
    await enableOnA()
    const mark = server.calls.length
    await mutate('task', 't1', { origin: ORIGIN })
    await syncNow()
    const sent = sentAfter(mark).filter((o) => o.field === 'origin')
    expect(sent).toHaveLength(1)
    expect(isEnvelope(sent[0].value)).toBe(true)
    expect(JSON.stringify(server.log)).not.toMatch(/example\.org|Interesting article/)
    expect((await db.tasks.get('t1'))!.origin).toEqual(ORIGIN)
    await on('B')
    await unlock(PASS, 'passphrase')
    await syncNow()
    expect((await db.tasks.get('t1'))!.origin).toEqual(ORIGIN)
  })

  it('a plaintext origin written by the server is re-encrypted on sight', async () => {
    await enableOnA()
    const mail = { kind: 'email', id: '<a1@mail.example>' }
    server.log.push({ id: 'mail1', entity: 'task', entityId: 't1', field: 'origin', value: mail, ts: Date.now(), device: 'server', seq: ++server.seq })
    await syncNow()
    await syncNow()
    expect((await db.tasks.get('t1'))!.origin).toEqual(mail)
    expect(isEnvelope(current('task', 't1', 'origin'))).toBe(true)
    expect(notYetEncrypted((await db.tasks.get('t1')) as never, 'task')).toBe(false)
  })

  it('enabling encrypts an existing origin and disabling decrypts it again', async () => {
    await on('A')
    await seedTasks()
    await mutate('task', 't1', { origin: ORIGIN })
    await syncNow()
    expect(current('task', 't1', 'origin')).toEqual(ORIGIN)
    await enableEncryption(PASS, FAST)
    await startMigration('encrypt')
    await syncNow()
    expect(isEnvelope(current('task', 't1', 'origin'))).toBe(true)
    await disableEncryption()
    await startMigration('decrypt')
    await syncNow()
    expect(current('task', 't1', 'origin')).toEqual(ORIGIN)
    expect((await db.tasks.get('t1'))!.origin).toEqual(ORIGIN)
  })
})

describe('locations and places (task-locations 1.4, "Encrypted locations and places")', () => {
  const LOCATION = { name: "Mum's", address: 'Via Roma 1, Torino', lat: 45.07, lon: 7.68 }

  it('a location leaves as one ciphertext string and another unlocked device reads it', async () => {
    await enableOnA()
    const mark = server.calls.length
    await mutate('task', 't1', { location: LOCATION })
    await syncNow()
    const sent = sentAfter(mark).filter((o) => o.field === 'location')
    expect(sent).toHaveLength(1)
    expect(isEnvelope(sent[0].value)).toBe(true)
    expect(JSON.stringify(server.log)).not.toMatch(/Via Roma|Mum's|45\.07/)
    await on('B')
    await unlock(PASS, 'passphrase')
    await syncNow()
    expect((await db.tasks.get('t1'))!.location).toEqual(LOCATION)
  })

  it("a place's name, address and coordinates are ciphertext; its position is not", async () => {
    await enableOnA()
    const mark = server.calls.length
    await mutate('place', 'pl1', { name: 'Home', address: 'Via Po 2', geo: { lat: 45.07, lon: 7.69 }, position: 1024, created_at: 1, deleted_at: null })
    await syncNow()
    const sent = sentAfter(mark).filter((o) => o.entity === 'place')
    for (const f of ['name', 'address', 'geo']) expect(isEnvelope(sent.find((o) => o.field === f)!.value)).toBe(true)
    expect(sent.find((o) => o.field === 'position')!.value).toBe(1024)
    await on('B')
    await unlock(PASS, 'passphrase')
    await syncNow()
    expect(await db.places.get('pl1')).toMatchObject({ name: 'Home', address: 'Via Po 2', geo: { lat: 45.07, lon: 7.69 } })
  })
})
