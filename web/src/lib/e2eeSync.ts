// The sync engine's end-to-end encryption hooks (OpenSpec change `e2ee`).
//
// Encryption happens at one choke point: prepareOutgoing() runs on every batch
// right before it is uploaded, so whatever path created an op (an edit, the
// re-seed after a restore, the migration job, encrypt-on-sight) nothing leaves
// the device in plaintext for an encrypted account. Web Crypto is asynchronous
// and cannot run inside an IndexedDB transaction, which is why this is done at
// upload rather than inside mutate() (design.md, implementation notes); the
// outbox at rest holds plaintext like every other local table (design D4: the
// device is the trust boundary).
//
// Decryption happens before incoming ops are applied (decryptIncoming), so the
// local tables, search, filters and live queries work on plaintext.
import {
  decryptValue, encryptValue, isEnvelope,
} from './crypto'
import { db, entityTables, getMeta, setMeta } from './db'
import {
  CONTENT_FIELDS, currentKey, isContentField, isEnabled, K_DISCARD, publishEncryption, refreshFromServer, UNDECRYPTABLE,
} from './e2ee'
import { getDeviceId, mutateMany, mutationTables, readField, FIELD_VALUE_PREFIX, type Change } from './ops'
import { membershipMap } from './sharing'
import type { Clock, Entity, Op, RowEncryption } from './types'

export type Wire = 'p' | 'c' | 'x'
export interface WireInfo {
  kind: Wire
  /** The envelope of a value this device could not decrypt. */
  raw?: string
}

/** The device holds no key for an encrypted account: nothing may be pulled or pushed. */
export class LockedError extends Error {
  constructor() {
    super('This device is locked. Unlock it to sync.')
  }
}

type Row = Record<string, unknown> & { _clock?: Clock; _e2ee?: RowEncryption }
type AnyTable = { get(id: string): Promise<Row | undefined>; put(v: Row): Promise<unknown>; toArray(): Promise<Row[]> }

function tableOf(entity: Entity): AnyTable {
  const t = {
    project: db.projects, task: db.tasks, label: db.labels, view: db.views, reminder: db.reminders, section: db.sections,
    comment: db.comments, project_prefs: db.prefs, user_prefs: db.userPrefs, attachment: db.attachments, field: db.fields, review: db.review,
  }[entity]
  return t as unknown as AnyTable
}

/**
 * Decides whether an op's entity lives in the account's personal scope, the
 * only scope that is ever encrypted. A task's scope follows its project (and
 * never changes: moves across scopes are copies); sections follow their project,
 * comments and attachments their task; labels and views are always personal.
 */
async function personalResolver(batch: Op[]): Promise<(entity: Entity, id: string) => Promise<boolean>> {
  const memberships = await membershipMap()
  const latest = new Map<string, unknown>()
  for (const op of batch) {
    if (op.field === 'project_id' || op.field === 'task_id') latest.set(`${op.entity}:${op.entityId}:${op.field}`, op.value)
  }
  const ref = async (entity: Entity, id: string, field: 'project_id' | 'task_id'): Promise<string | null> => {
    const k = `${entity}:${id}:${field}`
    if (latest.has(k)) return (latest.get(k) as string | null) ?? null
    const row = await tableOf(entity).get(id)
    return (row?.[field] as string | null | undefined) ?? null
  }
  const projectPersonal = (pid: string | null) => !pid || !memberships.has(pid)
  return async (entity, id) => {
    switch (entity) {
      case 'project': return projectPersonal(id)
      case 'task': return projectPersonal(await ref('task', id, 'project_id'))
      case 'section': return projectPersonal(await ref('section', id, 'project_id'))
      case 'field': return projectPersonal(await ref('field', id, 'project_id'))
      case 'comment':
      case 'attachment': {
        const taskId = await ref(entity, id, 'task_id')
        return taskId ? projectPersonal(await ref('task', taskId, 'project_id')) : true
      }
      default: return true
    }
  }
}

function encryptable(op: Op): op is Op & { value: string } {
  return isContentField(op.entity, op.field) && typeof op.value === 'string' && op.value !== '' && !isEnvelope(op.value)
}

/**
 * Encrypt the content fields of an outgoing batch for an encrypted account.
 * Empty strings and null stay as they are (their emptiness is visible anyway);
 * an envelope this device could not decrypt is passed through unchanged.
 * Throws LockedError when the account encrypts and the device has no key.
 */
export async function prepareOutgoing(ops: Op[]): Promise<Op[]> {
  if (ops.length === 0 || !(await isEnabled())) return ops
  const key = await currentKey()
  if (!key) throw new LockedError()
  const personal = await personalResolver(ops)
  const out: Op[] = []
  for (const op of ops) {
    if (encryptable(op) && (await personal(op.entity, op.entityId))) {
      out.push({ ...op, value: await encryptValue(key, op.entity, op.entityId, op.field, op.value) })
    } else {
      out.push(op)
    }
  }
  return out
}

export interface Incoming {
  ops: Op[]
  wire: Map<string, WireInfo>
  /** Ciphertext arrived (any scope). */
  ciphertext: boolean
  /** Non-empty plaintext content arrived for the personal scope. */
  plaintext: boolean
  /** Ciphertext arrived and this device has no key. */
  needsKey: boolean
}

/**
 * Decrypt incoming content values before they are applied. A value that does
 * not authenticate (wrong key, tampering, or moved to another entity or field:
 * the binding is part of the authentication) becomes the UNDECRYPTABLE
 * placeholder; the op is kept and its envelope remembered.
 */
export async function decryptIncoming(ops: Op[]): Promise<Incoming> {
  const res: Incoming = { ops: [], wire: new Map(), ciphertext: false, plaintext: false, needsKey: false }
  if (ops.length === 0) return res
  const key = await currentKey()
  let personal: ((e: Entity, id: string) => Promise<boolean>) | null = null
  for (const op of ops) {
    if (!isContentField(op.entity, op.field) || typeof op.value !== 'string') {
      res.ops.push(op)
      continue
    }
    if (isEnvelope(op.value)) {
      res.ciphertext = true
      if (!key) res.needsKey = true
      try {
        if (!key) throw new Error('no key')
        const value = await decryptValue(key, op.entity, op.entityId, op.field, op.value)
        res.ops.push({ ...op, value })
        res.wire.set(op.id, { kind: 'c' })
      } catch {
        res.ops.push({ ...op, value: UNDECRYPTABLE })
        res.wire.set(op.id, { kind: 'x', raw: op.value })
      }
      continue
    }
    res.ops.push(op)
    if (op.value === '') continue
    personal ??= await personalResolver(ops)
    if (await personal(op.entity, op.entityId)) {
      res.plaintext = true
      res.wire.set(op.id, { kind: 'p' })
    }
  }
  return res
}

/**
 * Bring the local account mode in line with the server when incoming content
 * disagrees with it: plaintext while we encrypt (REST writes, or another device
 * disabled encryption) or ciphertext while we do not (another device enabled
 * it, or late edits after disabling). One key-record read settles it. Returns
 * 'locked' when the account turns out to encrypt and this device has no key:
 * the caller must not apply the batch.
 */
export async function reconcileMode(inc: Incoming): Promise<'ok' | 'locked'> {
  const enabled = await isEnabled()
  const mismatch = (enabled && inc.plaintext) || (!enabled && inc.ciphertext)
  if (mismatch) {
    try {
      await refreshFromServer()
    } catch {
      // Offline or transient: keep the local mode; the next exchange retries.
    }
  }
  if ((await isEnabled()) && !(await currentKey())) return 'locked'
  return 'ok'
}

/**
 * After an upload: remember which form the server now holds for each content
 * field whose current value came from an op of the batch (the "not yet
 * encrypted" marker reads it).
 */
export async function markSent(original: Op[], sent: Op[]): Promise<void> {
  const byId = new Map(sent.map((o) => [o.id, o]))
  const relevant = original.filter((o) => isContentField(o.entity, o.field))
  if (relevant.length === 0) return
  await db.transaction('rw', entityTables(), async () => {
    for (const op of relevant) {
      const table = tableOf(op.entity)
      const row = await table.get(op.entityId)
      const c = row?._clock?.[op.field]
      if (!row || !c || c.ts !== op.ts || c.device !== op.device) continue
      const value = byId.get(op.id)?.value
      const kind: Wire = isEnvelope(value) ? (row._e2ee?.raw?.[op.field] ? 'x' : 'c') : 'p'
      const e2ee: RowEncryption = { ...row._e2ee, wire: { ...row._e2ee?.wire, [op.field]: kind } }
      await table.put({ ...row, _e2ee: e2ee })
    }
  })
}

/**
 * Converge the server's content on the account mode, after an incoming batch
 * was applied (design D7, encrypt-on-sight):
 *  - encrypted account, unlocked: a winning plaintext value is re-written (same
 *    plaintext, new op), which prepareOutgoing encrypts on upload;
 *  - plaintext account, key still held: a winning ciphertext is re-written as
 *    plaintext (late edits after disabling);
 *  - after the "both lost" path: an entity whose winning content cannot be
 *    decrypted is tombstoned.
 * Only fields whose current winner is the incoming op are touched, so once the
 * server holds the right form nothing is re-written again and the process ends;
 * two devices racing produce two winners that decrypt to the same text.
 * Returns the number of changes queued.
 */
export async function normalizeOnSight(inc: Incoming): Promise<number> {
  if (inc.wire.size === 0) return 0
  const enabled = await isEnabled()
  const key = await currentKey()
  const discard = await getMeta<boolean>(K_DISCARD, false)
  const patches = new Map<string, Change>()
  const now = Date.now()
  for (const op of inc.ops) {
    const info = inc.wire.get(op.id)
    if (!info) continue
    const rewrite = (enabled && key && info.kind === 'p') || (!enabled && key && info.kind === 'c')
    const tombstone = !enabled && discard && info.kind === 'x'
    if (!rewrite && !tombstone) continue
    const row = await tableOf(op.entity).get(op.entityId)
    const c = row?._clock?.[op.field]
    if (!row || !c || c.ts !== op.ts || c.device !== op.device) continue
    const k = `${op.entity}:${op.entityId}`
    const change = patches.get(k) ?? { entity: op.entity, entityId: op.entityId, patch: {} }
    if (tombstone) {
      if (row.deleted_at == null && 'deleted_at' in row) change.patch.deleted_at = now
    } else {
      change.patch[op.field] = readField(row, op.field)
    }
    if (Object.keys(change.patch).length) patches.set(k, change)
  }
  if (patches.size === 0) return 0
  // Shared-scope plaintext was filtered when the wire info was recorded.
  await mutateMany([...patches.values()])
  return patches.size
}

// ---- migration job (design D7) ----

const K_MIGRATION = 'e2ee.migration'
const MIGRATION_ORDER: Entity[] = ['project', 'label', 'section', 'view', 'field', 'task', 'comment']
/** Entities re-written per batch (one mutateMany each). */
export const MIGRATION_BATCH = 200

interface MigrationState {
  mode: 'encrypt' | 'decrypt'
  /** Index into MIGRATION_ORDER and the last entity id done there. */
  entity: number
  lastId: string
  done: number
  total: number
}

/** Rows of one entity kind that still need a re-write, in id order after `after`. */
async function pending(entity: Entity, mode: MigrationState['mode'], after: string, me: string): Promise<{ id: string; patch: Record<string, unknown> }[]> {
  const fields = CONTENT_FIELDS[entity] ?? []
  const target: Wire = mode === 'encrypt' ? 'c' : 'p'
  const rows = (await tableOf(entity).toArray()).filter((r) => (r.id as string) > after)
  rows.sort((a, b) => ((a.id as string) < (b.id as string) ? -1 : 1))
  const personal = await personalResolver([])
  const out: { id: string; patch: Record<string, unknown> }[] = []
  for (const row of rows) {
    // Only the author may write a comment.
    if (entity === 'comment' && row.author_id !== me) continue
    const patch: Record<string, unknown> = {}
    // A task's custom field values are content too (custom-fields D4): one entry each.
    const keys = entity === 'task' ? [...fields, ...Object.keys((row.fields ?? {}) as object).map((id) => FIELD_VALUE_PREFIX + id)] : fields
    for (const f of keys) {
      const v = readField(row, f)
      if (typeof v !== 'string' || v === '' || row._e2ee?.raw?.[f]) continue
      if (row._e2ee?.wire?.[f] === target) continue
      patch[f] = v
    }
    if (Object.keys(patch).length && (await personal(entity, row.id as string))) out.push({ id: row.id as string, patch })
  }
  return out
}

async function countPending(mode: MigrationState['mode'], me: string): Promise<number> {
  let n = 0
  for (const e of MIGRATION_ORDER) n += (await pending(e, mode, '', me)).length
  return n
}

/** Start the re-write job (enable: 'encrypt'; disable: 'decrypt') and run it to the end. */
export async function startMigration(mode: MigrationState['mode'], opts: { failAfterBatches?: number } = {}): Promise<void> {
  const me = (await getMeta<string>('userId', '')) ?? ''
  const state: MigrationState = { mode, entity: 0, lastId: '', done: 0, total: await countPending(mode, me) }
  await setMeta(K_MIGRATION, state)
  await runMigration(opts)
}

/**
 * Run (or resume after a reload) the persisted re-write job. Progress is stored
 * in the same transaction as each batch, so an interrupted run continues where
 * it stopped. `failAfterBatches` simulates an interruption in tests.
 */
export async function runMigration(opts: { failAfterBatches?: number } = {}): Promise<boolean> {
  let state = await getMeta<MigrationState | null>(K_MIGRATION, null)
  if (!state) return false
  const me = (await getMeta<string>('userId', '')) ?? ''
  await getDeviceId()
  let batches = 0
  publishEncryption({ migration: { mode: state.mode, done: state.done, total: state.total } })
  while (state.entity < MIGRATION_ORDER.length) {
    const entity = MIGRATION_ORDER[state.entity]
    const list = (await pending(entity, state.mode, state.lastId, me)).slice(0, MIGRATION_BATCH)
    if (list.length === 0) {
      state = { ...state, entity: state.entity + 1, lastId: '' }
      await setMeta(K_MIGRATION, state)
      continue
    }
    if (opts.failAfterBatches !== undefined && batches >= opts.failAfterBatches) throw new Error('migration interrupted (test)')
    const next: MigrationState = { ...state, lastId: list[list.length - 1].id, done: state.done + list.length }
    await db.transaction('rw', mutationTables(), async () => {
      await mutateMany(list.map((r) => ({ entity, entityId: r.id, patch: r.patch })))
      await db.meta.put({ key: K_MIGRATION, value: next })
    })
    state = next
    batches++
    publishEncryption({ migration: { mode: state.mode, done: state.done, total: Math.max(state.total, state.done) } })
  }
  await db.meta.delete(K_MIGRATION)
  publishEncryption({ migration: null })
  return true
}
