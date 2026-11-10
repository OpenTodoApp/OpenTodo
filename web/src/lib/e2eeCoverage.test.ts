// The encryption re-write job covers every entity kind with content fields
// (OpenSpec change encryption-rewrite-coverage). Before it, turning encryption on
// left the existing text of notes, time entries, routines, calendar frames and
// slots, saved places and the review's line for tomorrow in plaintext on the
// server. These tests pin the list against the generated content fields, show
// each kind converted both ways, keep shared projects plaintext, and show the
// one-time catch-up for accounts that turned encryption on with the older job.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeyRecord } from './crypto'
import type { Entity, Op } from './types'

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
    calls: [] as { device: string; ops: Op[] }[],
  }
  return { server, MockApiError }
})

vi.mock('./api', () => ({
  ApiError: MockApiError,
  api: {
    sync: async (device: string, cursor: number, ops: Op[]) => {
      server.calls.push({ device, ops: structuredClone(ops) })
      let applied = 0
      for (const op of ops) {
        if (server.log.some((o) => o.id === op.id)) continue
        server.log.push({ ...structuredClone(op), seq: ++server.seq })
        applied++
      }
      return { applied, ops: server.log.filter((o) => o.seq > cursor && o.device !== device), cursor: server.seq, hasMore: false, serverTime: Date.now(), rejected: [] }
    },
    encryptionKeys: async () => {
      if (!server.record) throw new MockApiError(404, 'encryption_disabled', 'not enabled')
      return { keys: structuredClone(server.record) }
    },
    putEncryptionKeys: async (r: KeyRecord) => {
      if (r.version !== (server.record?.version ?? 0) + 1) throw new MockApiError(409, 'encryption_conflict', 'conflict')
      server.record = { ...r, createdAt: server.record?.createdAt ?? Date.now() + server.seq, updatedAt: Date.now() }
      return { keys: structuredClone(server.record) }
    },
    deleteEncryptionKeys: async () => {
      if (!server.record) throw new MockApiError(404, 'encryption_disabled', 'not enabled')
      server.record = null
    },
    listNotifications: async () => ({ notifications: [], unread: 0 }),
  },
}))

import { OP_CONTENT_FIELDS } from '../generated/opSchema'
import { encryptValue, isEnvelope, ITERATION_LIMITS } from './crypto'
import { db, getMeta, setMeta, tableOf, useDatabase } from './db'
import { CONTENT_PREFIXES, currentKey, disableEncryption, enableEncryption, loadEncryptionState } from './e2ee'
import { catchUpEncryption, MIGRATION_ORDER, startMigration } from './e2eeSync'
import { mutate, resetDeviceId } from './ops'
import { syncNow } from './sync'
import { ENTITIES } from './types'

const PASS = 'correct horse battery staple'
const FAST = { iterations: 1000 }
ITERATION_LIMITS.min = 1000
const ME = 'u-me'
let run = 0

async function on(name: string) {
  useDatabase(`e2ee-coverage-${run}-${name}`)
  resetDeviceId()
  await loadEncryptionState()
  await setMeta('userId', ME)
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

/** The secret text of each kind the job used to miss, one row each. */
const SECRET: { entity: Entity; id: string; field: string; text: string; row: Record<string, unknown> }[] = [
  { entity: 'note', id: 'n1', field: 'title', text: 'Divorce lawyer', row: { title: 'Divorce lawyer', description: 'Call Monday', project_id: null, position: 1, created_at: 1, deleted_at: null } },
  { entity: 'time_entry', id: 'te1', field: 'note', text: 'Therapy session', row: { task_id: 't1', user_id: ME, started_at: 1, ended_at: 2, note: 'Therapy session', created_at: 1, deleted_at: null } },
  { entity: 'rule', id: 'r1', field: 'name', text: 'Pay the debt collector', row: { name: 'Pay the debt collector', project_id: null, created_at: 1, deleted_at: null } },
  { entity: 'frame', id: 'f1', field: 'title', text: 'Chemo', row: { title: 'Chemo', created_at: 1, deleted_at: null } },
  { entity: 'slot', id: 's1', field: 'title', text: 'Court hearing', row: { title: 'Court hearing', created_at: 1, deleted_at: null } },
  { entity: 'place', id: 'pl1', field: 'address', text: '12 Hidden Lane', row: { name: 'Safe house', address: '12 Hidden Lane', geo: { lat: 52.1, lon: 4.3 }, position: 1, created_at: 1, deleted_at: null } },
  { entity: 'review', id: 'me', field: 'tomorrow_note', text: 'Tell my boss', row: { tomorrow_note: 'Tell my boss', closed_at: 1 } },
  // The names of the priority levels (priority-names D7).
  { entity: 'user_prefs', id: 'me', field: 'priority_name_1', text: 'Hide from Dad', row: { priority_name_1: 'Hide from Dad' } },
  { entity: 'objective', id: 'ob1', field: 'title', text: 'Leave the job', row: { title: 'Leave the job', period: '2026-Q4', position: 1, done_at: 0, created_at: 1, deleted_at: null } },
]

async function seed() {
  await mutate('task', 't1', { title: 'Appointment', project_id: null, position: 1, created_at: 1, deleted_at: null })
  for (const s of SECRET) await mutate(s.entity, s.id, s.row)
  await syncNow()
}

/** The kinds whose secret text the server still holds in plaintext. */
function plaintextOnServer(): string[] {
  return SECRET.filter((s) => !isEnvelope(current(s.entity, s.id, s.field))).map((s) => `${s.entity}.${s.field}`)
}

beforeEach(() => {
  run++
  server.log = []
  server.seq = 0
  server.record = null
  server.calls = []
})

describe('the re-write job covers every content kind', () => {
  it('lists every entity kind that has content fields or content prefixes', () => {
    const content = new Set<string>([...Object.keys(OP_CONTENT_FIELDS), ...Object.keys(CONTENT_PREFIXES)])
    const missing = [...content].filter((e) => !MIGRATION_ORDER.includes(e as Entity))
    // A new entity with `Content: true` fields joins MIGRATION_ORDER at the end,
    // or turning encryption on leaves its existing text in plaintext on the server.
    expect(missing).toEqual([])
    expect(MIGRATION_ORDER.every((e) => ENTITIES.includes(e))).toBe(true)
    expect(new Set(MIGRATION_ORDER).size).toBe(MIGRATION_ORDER.length)
  })

  it('turning encryption on encrypts the existing text of every kind', async () => {
    await on('A')
    await seed()
    expect(plaintextOnServer().length).toBe(SECRET.length)
    await enableEncryption(PASS, FAST)
    await startMigration('encrypt')
    await syncNow()
    expect(plaintextOnServer()).toEqual([])
    // Every content field of each row, not only the one checked above.
    for (const s of SECRET) {
      for (const f of OP_CONTENT_FIELDS[s.entity] ?? []) {
        const v = current(s.entity, s.id, f)
        if (v === undefined || v === null || v === '') continue
        expect(isEnvelope(v), `${s.entity}.${f}`).toBe(true)
      }
    }
    // Plaintext fields stay plaintext; the device keeps reading plaintext.
    expect(current('objective', 'ob1', 'period')).toBe('2026-Q4')
    expect((await db.places.get('pl1'))!.geo).toEqual({ lat: 52.1, lon: 4.3 })
    expect((await tableOf('time_entry').get('te1'))!.note).toBe('Therapy session')
  })

  it('turning encryption off writes every kind back as plaintext', async () => {
    await on('A')
    await seed()
    await enableEncryption(PASS, FAST)
    await startMigration('encrypt')
    await syncNow()
    await disableEncryption()
    await startMigration('decrypt')
    await syncNow()
    for (const s of SECRET) expect(current(s.entity, s.id, s.field), `${s.entity}.${s.field}`).toBe(s.text)
  })

  it('leaves notes and time entries of a shared project in plaintext, and other people’s time entries alone', async () => {
    await on('A')
    await db.memberships.put({ projectId: 'shared1', role: 'owner', ownerId: ME, members: [] })
    await mutate('task', 'ts', { title: 'Team task', project_id: 'shared1', position: 1, created_at: 1, deleted_at: null })
    await mutate('note', 'ns', { title: 'Team note', project_id: 'shared1', position: 1, created_at: 1, deleted_at: null })
    await mutate('time_entry', 'tes', { task_id: 'ts', user_id: ME, started_at: 1, ended_at: 2, note: 'Pairing', created_at: 1, deleted_at: null })
    await mutate('task', 'tp', { title: 'Mine', project_id: null, position: 1, created_at: 1, deleted_at: null })
    await mutate('time_entry', 'teo', { task_id: 'tp', user_id: 'someone-else', started_at: 1, ended_at: 2, note: 'Theirs', created_at: 1, deleted_at: null })
    await syncNow()
    const mark = server.calls.length
    await enableEncryption(PASS, FAST)
    await startMigration('encrypt')
    await syncNow()
    expect(current('note', 'ns', 'title')).toBe('Team note')
    expect(current('time_entry', 'tes', 'note')).toBe('Pairing')
    // Only its author may write a time entry: the job does not try.
    expect(server.calls.slice(mark).flatMap((c) => c.ops).filter((o) => o.entityId === 'teo' || o.entityId === 'ns' || o.entityId === 'tes')).toEqual([])
    // New writes follow the same rule.
    await mutate('note', 'ns', { title: 'Team note, edited' })
    await syncNow()
    expect(current('note', 'ns', 'title')).toBe('Team note, edited')
  })

  it('encrypts a priority name written while encryption is on, never the task’s priority (priority-names D7)', async () => {
    await on('A')
    await seed()
    await enableEncryption(PASS, FAST)
    await mutate('user_prefs', 'me', { priority_name_1: 'Must' })
    await mutate('task', 't1', { priority: 1 })
    await syncNow()
    expect(isEnvelope(current('user_prefs', 'me', 'priority_name_1'))).toBe(true)
    expect(current('task', 't1', 'priority')).toBe(1)
    expect((await db.userPrefs.get('me'))!.priority_name_1).toBe('Must')
  })
})

describe('catch-up for accounts that turned encryption on with the older job', () => {
  /** An account that enabled encryption before this fix: the older job re-wrote only its nine kinds. */
  async function enabledWithOldJob() {
    await on('A')
    await seed()
    await enableEncryption(PASS, FAST)
    // What the older job did: re-write the task and the objective (kinds it
    // covered), not the others, and remember the kinds it covered.
    await mutate('task', 't1', { title: 'Appointment' })
    await mutate('objective', 'ob1', { title: 'Leave the job' })
    // The older app had no catch-up: keep this exchange from running it.
    await setMeta('e2ee.covered', [...MIGRATION_ORDER])
    await syncNow()
    expect(await db.outbox.count()).toBe(0)
    await setMeta('e2ee.covered', ['project', 'label', 'section', 'view', 'field', 'task', 'comment', 'attachment', 'objective'])
  }

  it('encrypts the leftover plaintext on the next sync, once', async () => {
    await enabledWithOldJob()
    expect(plaintextOnServer().length).toBe(SECRET.length - 1)
    const mark = server.calls.length
    await syncNow() // pulls, then queues the catch-up
    await syncNow() // uploads it
    expect(plaintextOnServer()).toEqual([])
    const sent = server.calls.slice(mark).flatMap((c) => c.ops)
    // Values already ciphertext (the task, the objective) are not re-written.
    expect(sent.filter((o) => o.entity === 'task' || o.entity === 'objective')).toEqual([])
    expect(await getMeta('e2ee.covered', null)).toEqual([...MIGRATION_ORDER])
    // Idempotent: nothing more is written.
    const after = server.calls.length
    await syncNow()
    await syncNow()
    expect(server.calls.slice(after).flatMap((c) => c.ops)).toEqual([])
    expect(await catchUpEncryption()).toBe(false)
  })

  it('waits while the device is locked and runs after unlocking', async () => {
    await enabledWithOldJob()
    const { lock, unlock } = await import('./e2ee')
    await lock()
    expect(await catchUpEncryption()).toBe(false)
    expect(await db.outbox.count()).toBe(0)
    await unlock(PASS, 'passphrase')
    await syncNow()
    await syncNow()
    expect(plaintextOnServer()).toEqual([])
  })

  it('writes ciphertext an older app left in a shared project back as plaintext', async () => {
    await enabledWithOldJob()
    await db.memberships.put({ projectId: 'shared1', role: 'owner', ownerId: ME, members: [] })
    await mutate('note', 'ns', { title: 'Team note', project_id: 'shared1', position: 1, created_at: 1, deleted_at: null })
    await setMeta('e2ee.covered', [...MIGRATION_ORDER])
    await syncNow()
    // The older app encrypted the shared note's title: the other members could not read it.
    const key = (await currentKey())!
    const sealed = await encryptValue(key, 'note', 'ns', 'title', 'Team note')
    server.log.push({ id: 'old-ns', entity: 'note', entityId: 'ns', field: 'title', value: sealed, ts: Date.now() + 1, device: 'old', seq: ++server.seq })
    await syncNow()
    expect(isEnvelope(current('note', 'ns', 'title'))).toBe(true)
    await setMeta('e2ee.covered', ['project', 'label', 'section', 'view', 'field', 'task', 'comment', 'attachment', 'objective'])
    await syncNow()
    await syncNow()
    expect(current('note', 'ns', 'title')).toBe('Team note')
    expect(plaintextOnServer()).toEqual([])
  })

  it('a job started while a catch-up runs waits for it, then runs in full', async () => {
    await enabledWithOldJob()
    const catchUp = catchUpEncryption()
    await startMigration('encrypt')
    expect(await catchUp).toBe(true)
    expect(await getMeta('e2ee.migration', null)).toBeNull()
    await syncNow()
    expect(plaintextOnServer()).toEqual([])
  })

  it('does nothing on an account that never encrypted', async () => {
    await on('A')
    await seed()
    const mark = server.calls.length
    expect(await catchUpEncryption()).toBe(false)
    await syncNow()
    expect(server.calls.slice(mark).flatMap((c) => c.ops)).toEqual([])
    expect(plaintextOnServer().length).toBe(SECRET.length)
  })
})
