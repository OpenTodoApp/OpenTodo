// Rollback of encrypted content (OpenSpec change e2ee-rollback, design D4 and
// D6): a hostile server serves an older ciphertext of a field again, or an
// older key record. Devices share one in-memory server that stores ops exactly
// as received; the tests play the hostile server by adding ops to its log.
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    /** The log generation; a new value means "restored from a backup". */
    generation: undefined as string | undefined,
    calls: [] as Op[][],
  }
  return { server, MockApiError }
})

vi.mock('./api', () => ({
  ApiError: MockApiError,
  api: {
    sync: async (device: string, cursor: number, ops: Op[]) => {
      server.calls.push(structuredClone(ops))
      let applied = 0
      for (const op of ops) {
        if (server.log.some((o) => o.id === op.id)) continue
        server.log.push({ ...structuredClone(op), seq: ++server.seq })
        applied++
      }
      return { applied, ops: server.log.filter((o) => o.seq > cursor && o.device !== device), cursor: server.seq, hasMore: false, serverTime: Date.now(), rejected: [], ...(server.generation ? { generation: server.generation } : {}) }
    },
    encryptionKeys: async () => {
      if (!server.record) throw new MockApiError(404, 'encryption_disabled', 'not enabled')
      return { keys: structuredClone(server.record) }
    },
    putEncryptionKeys: async (r: KeyRecord) => {
      if (r.version !== (server.record?.version ?? 0) + 1) throw new MockApiError(409, 'encryption_conflict', 'conflict')
      // As internal/e2ee Store.Put: a replacing record keeps the creation time,
      // unless it claims a later enablement than the stored one.
      const keep = server.record && !((r.createdAt ?? 0) > (server.record.createdAt ?? 0))
      server.record = { ...r, createdAt: keep ? server.record!.createdAt : Math.max(Date.now(), (r.createdAt ?? 0) + 1) + server.seq, updatedAt: Date.now() }
      return { keys: structuredClone(server.record) }
    },
    deleteEncryptionKeys: async () => {
      server.record = null
    },
    purgeEncryptionHistory: async () => ({ purged: 0, notice: '' }),
    listNotifications: async () => ({ notifications: [], unread: 0 }),
  },
}))

import { encryptValue, encryptValueV2, isEnvelope, ITERATION_LIMITS, PREFIX_V1 } from './crypto'
import { db, useDatabase } from './db'
import {
  cachedRecord, changePassphrase, clearOlderVersions, currentKey, decryptChanges, displayValue, enableEncryption, encryptionSnapshot, loadEncryptionState, lock,
  MAX_OLDER_VERSIONS, olderCount, olderVersionItems, olderVersions, recordOlderVersions, refreshFromServer, restoreKeyRecord, reuploadKeyRecord, unlock, UNDECRYPTABLE,
} from './e2ee'
import { WRITE_V2 } from './e2eeEnvelope'
import { decryptIncoming, olderVersion, prepareOutgoing } from './e2eeSync'
import { mutate, resetDeviceId } from './ops'
import { syncNow, syncSnapshot } from './sync'
import { nextMillisecond } from '../test/clock'

const PASS = 'correct horse battery staple'
const FAST = { iterations: 1000 }
ITERATION_LIMITS.min = 1000
let run = 0

async function on(name: string) {
  useDatabase(`rollback-${run}-${name}`)
  resetDeviceId()
  await loadEncryptionState()
}

beforeEach(() => {
  run++
  server.log = []
  server.seq = 0
  server.record = null
  server.generation = undefined
  server.calls = []
})

/** Device A of an encrypted account with one task, unlocked. */
async function account() {
  await on('A')
  await enableEncryption(PASS, FAST)
  await mutate('task', 't1', { title: 'Seed', project_id: null, parent_id: null, priority: 4, position: 1, created_at: 1, completed_at: null, deleted_at: null })
  await syncNow()
  return (await currentKey())!
}

let n = 0
/** An op as the server serves it, by device W (a device of the writer release) unless named. */
function serve(field: string, value: string, ts: number, device = 'W'): Op {
  const op: Op = { id: `srv-${++n}`, entity: 'task', entityId: 't1', field, value, ts, device }
  server.log.push({ ...op, seq: ++server.seq })
  return op
}

const title = async () => (await db.tasks.get('t1'))?.title
const clockOf = async () => (await db.tasks.get('t1'))?._clock?.title?.ts

describe('rollback of a content value (D4)', () => {
  it('refuses an older ciphertext replayed under a newer timestamp and keeps the value', async () => {
    const key = await account()
    const t0 = Date.now() + 10_000
    const old = await encryptValueV2(key, t0, 'task', 't1', 'title', 'Last month')
    serve('title', old, t0)
    serve('title', await encryptValueV2(key, t0 + 1000, 'task', 't1', 'title', 'Now'), t0 + 1000)
    await syncNow()
    expect(await title()).toBe('Now')
    expect((await db.tasks.get('t1'))?._e2ee?.v2?.title).toBe(true)
    // The attack: last month's ciphertext inside an op with a later timestamp.
    const replay = serve('title', old, t0 + 5000)
    await syncNow()
    expect(await title()).toBe('Now')
    expect(await clockOf()).toBe(t0 + 1000)
    expect(encryptionSnapshot().olderVersions).toBe(1)
    expect((await olderVersions()).map((o) => [o.entity, o.entityId, o.field, o.op])).toEqual([['task', 't1', 'title', replay.id]])
    // Settings → Clear forgets the list only.
    await clearOlderVersions()
    expect(encryptionSnapshot().olderVersions).toBe(0)
    expect(await title()).toBe('Now')
  })

  it('lets a replay with its original timestamp lose quietly', async () => {
    const key = await account()
    const t0 = Date.now() + 10_000
    const old = await encryptValueV2(key, t0, 'task', 't1', 'title', 'Last month')
    serve('title', old, t0)
    serve('title', await encryptValueV2(key, t0 + 1000, 'task', 't1', 'title', 'Now'), t0 + 1000)
    await syncNow()
    serve('title', old, t0)
    await syncNow()
    expect(await title()).toBe('Now')
    expect(await olderVersions()).toEqual([])
  })

  it('refuses a downgrade to v1 over a value held as v2 (writer release)', async () => {
    const key = await account()
    const t0 = Date.now() + 10_000
    serve('title', await encryptValueV2(key, t0, 'task', 't1', 'title', 'Now'), t0)
    await syncNow()
    const down: Op = { id: 'down', entity: 'task', entityId: 't1', field: 'title', value: await encryptValue(key, 'task', 't1', 'title', 'Older, as v1'), ts: t0 + 5000, device: 'W' }
    const inc = await decryptIncoming([down], { downgrade: true })
    expect(inc.ops).toEqual([])
    expect(inc.refused.map((r) => r.op)).toEqual(['down'])
    // In the same batch after a v2 value too.
    const v2: Op = { id: 'v2', entity: 'task', entityId: 't1', field: 'title', value: await encryptValueV2(key, t0 + 6000, 'task', 't1', 'title', 'Newer'), ts: t0 + 6000, device: 'W' }
    const later: Op = { ...down, id: 'down2', ts: t0 + 7000 }
    const both = await decryptIncoming([v2, later], { downgrade: true })
    expect(both.ops.map((o) => o.id)).toEqual(['v2'])
    expect(both.refused.map((r) => r.op)).toEqual(['down2'])
  })

  it('applies v1 over v2 in the reader release, where honest writers still write v1', async () => {
    const key = await account()
    const t0 = Date.now() + 10_000
    serve('title', await encryptValueV2(key, t0, 'task', 't1', 'title', 'Now'), t0)
    await syncNow()
    serve('title', await encryptValue(key, 'task', 't1', 'title', 'From an older ot'), t0 + 5000)
    await syncNow()
    expect(await title()).toBe(WRITE_V2 ? 'Now' : 'From an older ot')
    expect((await db.tasks.get('t1'))?._e2ee?.v2?.title).toBe(WRITE_V2 ? true : undefined)
  })

  it('a new device accepts every winning authentic value and records nothing', async () => {
    const key = await account()
    const t0 = Date.now() + 10_000
    serve('title', await encryptValue(key, 'task', 't1', 'title', 'v1 first'), t0)
    serve('title', await encryptValueV2(key, t0 + 1000, 'task', 't1', 'title', 'v2 later'), t0 + 1000)
    serve('description', await encryptValue(key, 'task', 't1', 'description', 'a v1 note'), t0 + 2000)
    await on('C')
    await unlock(PASS, 'passphrase')
    await syncNow()
    expect(await title()).toBe('v2 later')
    expect((await db.tasks.get('t1'))?.description).toBe('a v1 note')
    expect(await olderVersions()).toEqual([])
  })

  it('two devices that refuse the same op keep the same value, and the next edit converges', async () => {
    const key = await account()
    const t0 = Date.now() + 10_000
    const old = await encryptValueV2(key, t0, 'task', 't1', 'title', 'Last month')
    serve('title', old, t0)
    serve('title', await encryptValueV2(key, t0 + 1000, 'task', 't1', 'title', 'Now'), t0 + 1000)
    await syncNow()
    await on('B')
    await unlock(PASS, 'passphrase')
    await syncNow()
    serve('title', old, t0 + 5000)
    await syncNow()
    expect(await title()).toBe('Now')
    await on('A')
    await syncNow()
    expect(await title()).toBe('Now')
    // An edit on A after the refusal reaches B.
    await nextMillisecond()
    await mutate('task', 't1', { title: 'Edited on A' })
    await syncNow()
    await on('B')
    await syncNow()
    expect(await title()).toBe('Edited on A')
  })

  it('records each refused op once, at most MAX_OLDER_VERSIONS', async () => {
    await on('A')
    const one = { entity: 'task' as const, entityId: 't1', field: 'title', op: 'x', at: 1 }
    await recordOlderVersions([one])
    await recordOlderVersions([one])
    expect((await olderVersions()).length).toBe(1)
    await recordOlderVersions(Array.from({ length: MAX_OLDER_VERSIONS + 5 }, (_, i) => ({ ...one, op: `o${i}` })))
    const list = await olderVersions()
    expect(list.length).toBe(MAX_OLDER_VERSIONS)
    expect(list[list.length - 1].op).toBe(`o${MAX_OLDER_VERSIONS + 4}`)
    // Settings counts values, not ops: all of these are one task's title.
    expect(olderCount(list)).toBe(1)
    expect(encryptionSnapshot().olderVersions).toBe(1)
    expect(olderCount([...list, { ...one, field: 'description', op: 'd' }])).toBe(2)
    expect((await olderVersionItems()).map((o) => o.name)).toEqual(['Untitled'])
  })

  it('checks the stamp without a key, before decrypting', () => {
    const v2 = 'enc:v2:' + btoa(String.fromCharCode(0, 0, 0, 0, 0, 0, 0, 5, ...new Array(36).fill(1))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const op = (value: string, ts: number): Op => ({ id: 'o', entity: 'task', entityId: 't1', field: 'title', value, ts, device: 'W' })
    expect(olderVersion(op(v2, 5), { v2: false })).toBe(false)
    expect(olderVersion(op(v2, 6), { v2: false })).toBe(true)
    const v1 = PREFIX_V1 + 'A'.repeat(48)
    expect(olderVersion(op(v1, 10), { v2: true, clock: { ts: 5, device: 'W' } }, true)).toBe(true)
    expect(olderVersion(op(v1, 10), { v2: true, clock: { ts: 5, device: 'W' } }, false)).toBe(false)
    expect(olderVersion(op(v1, 4), { v2: true, clock: { ts: 5, device: 'W' } }, true)).toBe(false)
    expect(olderVersion(op(v1, 10), { v2: false, clock: { ts: 5, device: 'W' } }, true)).toBe(false)
    // A note document merges: replaying an update changes nothing, so only the stamp counts.
    expect(olderVersion({ ...op(v1, 10), field: 'notes_doc' }, { v2: true }, true)).toBe(false)
    expect(olderVersion({ ...op(v2, 6), field: 'notes_doc' }, { v2: false })).toBe(true)
  })

  it('records refusals even while the device is locked', async () => {
    const key = await account()
    const t0 = Date.now() + 10_000
    const old = await encryptValueV2(key, t0, 'task', 't1', 'title', 'Last month')
    await lock()
    const inc = await decryptIncoming([{ id: 'r1', entity: 'task', entityId: 't1', field: 'title', value: old, ts: t0 + 1, device: 'W' }])
    expect(inc.ops).toEqual([])
    expect(inc.refused.length).toBe(1)
  })

  it('shows a mismatched value in history as undecryptable', async () => {
    const key = await account()
    const v = await encryptValueV2(key, 1000, 'task', 't1', 'title', 'Then')
    expect(await displayValue('task', 't1', 'title', v, 1000)).toBe('Then')
    expect(await displayValue('task', 't1', 'title', v, 2000)).toBe(UNDECRYPTABLE)
    expect(await displayValue('task', 't1', 'title', v)).toBe('Then')
    // A change's `from` is the value it replaced: one stamped after the change cannot be it.
    const later = await encryptValueV2(key, 3000, 'task', 't1', 'title', 'Later')
    const [c] = await decryptChanges('task', 't1', [{ field: 'title', from: later, to: v }], 2000)
    expect(c.from).toBe(UNDECRYPTABLE)
    const [d] = await decryptChanges('task', 't1', [{ field: 'title', from: v, to: later }], 3000)
    expect(d).toMatchObject({ from: 'Then', to: 'Later' })
  })

  it('treats a title typed as "enc:v2: …" as text', async () => {
    await account()
    const t0 = Date.now() + 10_000
    serve('title', 'enc:v2: release notes', t0)
    await syncNow()
    expect(await title()).toBe('enc:v2: release notes')
    expect(await olderVersions()).toEqual([])
  })

  it('the reader release still uploads v1', async () => {
    await account()
    expect(WRITE_V2).toBe(false)
    const [out] = await prepareOutgoing([{ id: 'u', entity: 'task', entityId: 't1', field: 'title', value: 'Plain', ts: Date.now(), device: 'A' }])
    expect(String(out.value).startsWith(PREFIX_V1)).toBe(true)
  })
})

/** The record another enablement made (another account key), without touching this device. */
async function enableElsewhere(): Promise<KeyRecord> {
  const { createKeyRecord } = await import('./crypto')
  return (await createKeyRecord('another passphrase entirely', FAST)).record
}

describe('an older key record (D6)', () => {
  it('warns and keeps its own record, without stopping anything', async () => {
    await account()
    const v1 = structuredClone(server.record!)
    await changePassphrase(PASS, 'a brand new passphrase', FAST)
    expect((await cachedRecord())?.version).toBe(2)
    // The server serves the version 1 record again, unchanged (a restore, or a hostile server).
    server.record = v1
    const got = await refreshFromServer()
    expect(got?.wrappedByPassphrase).toBe((await cachedRecord())?.wrappedByPassphrase)
    expect((await cachedRecord())?.version).toBe(2)
    expect(encryptionSnapshot().olderRecord).toBe(true)
    // Sync goes on, and unlocking uses this device's record: the old passphrase does not open it.
    await syncNow()
    expect(syncSnapshot().state).toBe('idle')
    await lock()
    await expect(unlock(PASS, 'passphrase')).rejects.toThrow()
    await unlock('a brand new passphrase', 'passphrase')
    expect(await currentKey()).not.toBeNull()
    // The state survives a reload.
    await loadEncryptionState()
    expect(encryptionSnapshot().olderRecord).toBe(true)
  })

  it('uploads this device’s record over the older one on request', async () => {
    await account()
    const v1 = structuredClone(server.record!)
    await changePassphrase(PASS, 'a brand new passphrase', FAST)
    const mine = (await cachedRecord())!
    server.record = v1
    await refreshFromServer()
    await reuploadKeyRecord()
    expect(server.record).toMatchObject({ version: 2, wrappedByPassphrase: mine.wrappedByPassphrase, salt: mine.salt })
    expect(encryptionSnapshot().olderRecord).toBe(false)
    await refreshFromServer()
    expect(encryptionSnapshot().olderRecord).toBe(false)
  })

  it('a passphrase change while an older record is served replaces it', async () => {
    await account()
    const v1 = structuredClone(server.record!)
    await changePassphrase(PASS, 'a brand new passphrase', FAST)
    server.record = v1
    await refreshFromServer()
    await changePassphrase('a brand new passphrase', 'a third passphrase here', FAST)
    expect(server.record?.version).toBe(2)
    expect(encryptionSnapshot().olderRecord).toBe(false)
  })

  it('a server restored from an older backup with an older record still gets the re-seed', async () => {
    await account()
    server.generation = 'g1'
    await syncNow()
    const backupLog = structuredClone(server.log)
    const backupRecord = structuredClone(server.record!)
    await changePassphrase(PASS, 'a brand new passphrase', FAST)
    await mutate('task', 't1', { title: 'After the backup' })
    await syncNow()
    // The honest server goes back to the backup: older log, older key record, new generation.
    server.log = backupLog
    server.seq = backupLog.length
    server.record = backupRecord
    server.generation = 'g2'
    const n = server.calls.length
    await syncNow()
    expect(syncSnapshot().state).toBe('idle')
    expect(encryptionSnapshot().olderRecord).toBe(true)
    const sent = server.calls.slice(n).flat().filter((o) => o.entity === 'task' && o.field === 'title')
    expect(sent.length).toBeGreaterThan(0)
    expect(sent.every((o) => isEnvelope(o.value))).toBe(true)
    expect(await title()).toBe('After the backup')
  })

  it('uploading over an earlier enablement’s record keeps this device and the others unlocked', async () => {
    await account()
    await on('B')
    await unlock(PASS, 'passphrase')
    await on('A')
    const mine = structuredClone(server.record!)
    // The server serves the record of an earlier enablement: another account key, an older creation time.
    const earlier = await enableElsewhere()
    server.record = { ...earlier, createdAt: (mine.createdAt ?? 0) - 1000, version: 5 }
    await refreshFromServer()
    expect(encryptionSnapshot()).toMatchObject({ olderRecord: true, olderRecordDetail: { served: { version: 5 }, mine: { version: 1 } } })
    await reuploadKeyRecord()
    expect(server.record).toMatchObject({ version: 6, wrappedByPassphrase: mine.wrappedByPassphrase })
    expect((server.record!.createdAt ?? 0) > (mine.createdAt ?? 0)).toBe(true)
    expect(await currentKey()).not.toBeNull()
    expect(encryptionSnapshot()).toMatchObject({ unlocked: true, olderRecord: false })
    // Another device of the same enablement adopts the fresh record and stays unlocked.
    await on('B')
    await refreshFromServer()
    expect(await currentKey()).not.toBeNull()
    expect(encryptionSnapshot()).toMatchObject({ unlocked: true, olderRecord: false, keyVersion: 6 })
  })

  it('a record of another account key with a newer creation time still locks', async () => {
    await account()
    const other = await enableElsewhere()
    server.record = { ...other, createdAt: (server.record!.createdAt ?? 0) + 1000, version: 2 }
    await refreshFromServer()
    expect(await currentKey()).toBeNull()
  })

  it('counts the record of an earlier enablement as older too', async () => {
    await account()
    const current = structuredClone(server.record!)
    server.record = { ...current, createdAt: (current.createdAt ?? 0) - 1, version: 7 }
    await refreshFromServer()
    expect(encryptionSnapshot().olderRecord).toBe(true)
    server.record = current
    await refreshFromServer()
    expect(encryptionSnapshot().olderRecord).toBe(false)
  })

  it('adopts the record its own upload returns', async () => {
    await account()
    server.record = null
    await refreshFromServer()
    expect(encryptionSnapshot().recordMissing).toBe(true)
    await restoreKeyRecord()
    expect((await cachedRecord())?.version).toBe(1)
    expect(encryptionSnapshot().recordMissing).toBe(false)
  })
})
