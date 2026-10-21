// End-to-end encryption state on this device (OpenSpec change `e2ee`): which
// fields are encrypted, whether the account encrypts, the device's account key
// (non-extractable, in IndexedDB `meta`) and the account-level actions of the
// Settings panel and the unlock screen. Cryptography lives in crypto.ts; the
// sync engine's hooks in e2eeSync.ts.
//
// The device is the trust boundary (design D4): local tables hold plaintext, and
// nothing leaves the device for an encrypted account except ciphertext for the
// content fields below and wrapped key material.
import { useSyncExternalStore } from 'react'
import { api, ApiError } from './api'
import {
  checkRecordParams, createKeyRecord, decryptValue, KeyRecordParamsError, isEnvelope, resetWithRecoveryKey, rewrapWithPassphrase, unlockWithPassphrase, unlockWithRecoveryKey,
  type KeyRecord,
} from './crypto'
import { db, getMeta, setMeta } from './db'
import type { Entity, EncryptionStatus } from './types'
import { t, msg } from './i18n'

/** The client's ciphertext-awareness level; the server's minClientVersion is compared with it (design D9). */
export const CLIENT_VERSION = 1

/**
 * Fields encrypted for an encrypted account, in its personal scope only (shared
 * projects are never encrypted). Keep in step with internal/e2ee ContentFields.
 * task.labels holds label ids, so label names are encrypted instead of the
 * array (design.md, implementation notes).
 */
export const CONTENT_FIELDS: Partial<Record<Entity, readonly string[]>> = {
  // A task's origin is an object, serialised and encrypted whole (task-origin D2).
  // A task's location is an object too (task-locations D1).
  task: ['title', 'description', 'ical_extra', 'notes_doc', 'origin', 'location'],
  project: ['name', 'description', 'notes_doc'],
  label: ['name'],
  section: ['name'],
  view: ['name', 'query'],
  // A guest's typed name on a task page reply (task-pages D6).
  comment: ['body', 'guest_name'],
  // Attachments (OpenSpec attachments D8): the file bytes are an OTAT1 envelope too.
  attachment: ['name', 'mime', 'url'],
  // Custom field definitions (OpenSpec custom-fields, design D4).
  field: ['name', 'options'],
  // A time entry's note (OpenSpec time-tracking, design D1); its times stay plaintext.
  time_entry: ['note'],
  // The review record's line for tomorrow (OpenSpec close-the-day, design D5); its times and focus stay plaintext.
  review: ['tomorrow_note'],
  // A place (task-locations D1): its coordinates are one object; position and times stay plaintext.
  place: ['name', 'address', 'geo'],
}

/**
 * Families of content fields named by a prefix: a task's custom field values
 * `fields.<id>` (custom-fields D4). Only string values are encrypted (text, link,
 * date, choice); numbers and checkboxes stay plaintext. Keep in step with
 * internal/e2ee ContentPrefixes.
 */
export const CONTENT_PREFIXES: Partial<Record<Entity, readonly string[]>> = {
  task: ['fields.'],
}

export function isContentField(entity: Entity, field: string): boolean {
  if (CONTENT_FIELDS[entity]?.includes(field)) return true
  return CONTENT_PREFIXES[entity]?.some((p) => field.startsWith(p) && field.length > p.length) ?? false
}

/** Content values that are objects on the device and one encrypted JSON string on the wire (task-origin D2). */
const OBJECT_CONTENT: Partial<Record<Entity, readonly string[]>> = { task: ['origin', 'location'], place: ['geo'] }

function isObjectContent(entity: Entity, field: string): boolean {
  return OBJECT_CONTENT[entity]?.includes(field) ?? false
}

/**
 * The plaintext a content value encrypts as: a string as it is, an object-valued
 * field (task.origin) as its JSON. null, numbers, booleans and a string in an
 * object-valued field (an envelope or the undecryptable placeholder) give null:
 * nothing to encrypt.
 */
export function contentToString(entity: Entity, field: string, value: unknown): string | null {
  if (isObjectContent(entity, field)) return value !== null && typeof value === 'object' ? JSON.stringify(value) : null
  return typeof value === 'string' ? value : null
}

/** The device value of decrypted plaintext: the object for an object-valued field, else the string. */
export function contentFromString(entity: Entity, field: string, plaintext: string): unknown {
  if (!isObjectContent(entity, field)) return plaintext
  try {
    const v: unknown = JSON.parse(plaintext)
    return v !== null && typeof v === 'object' ? v : plaintext
  } catch {
    return plaintext
  }
}

/** What a field shows when its ciphertext cannot be decrypted with this device's key. */
export const UNDECRYPTABLE = msg('[Cannot decrypt]')

const K_ENABLED = 'e2ee.enabled'
const K_RECORD = 'e2ee.record'
const K_KEY = 'e2ee.key'
const K_FAILURES = 'e2ee.failures'
/** createdAt of the key record the stored key belongs to (a re-enabled account has a new key). */
const K_KEY_FOR = 'e2ee.keyFor'
/**
 * The account encrypts on this device but the server answered that it has no key
 * record (encryption-state-integrity): sync stays paused until the user restores
 * the record from this device or turns encryption off here. A server answer alone
 * never turns encryption off.
 */
const K_MISSING = 'e2ee.recordMissing'
/** Set by the "both lost" path: undecryptable content is tombstoned on sight. */
export const K_DISCARD = 'e2ee.discardUndecryptable'

/** 5 failed unlock attempts within a minute delay the next one (design D5). */
export const MAX_FAILURES = 5
export const FAILURE_WINDOW_MS = 60_000

export class UnlockThrottledError extends Error {
  constructor(public retryAt: number) {
    super(t('Too many attempts. Try again in {n, plural, one {# second} other {# seconds}}.', { n: Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)) }))
  }
}

/** Another device created or changed the key record first (409 encryption_conflict). */
export class EncryptionConflictError extends Error {
  constructor() {
    super(t('Encryption was already set up on another device. Unlock with that passphrase instead.'))
  }
}

// ---- observable snapshot ----

export interface EncryptionSnapshot {
  /** The account encrypts its content (from the profile or the key record). */
  enabled: boolean
  /** This device holds the account key. */
  unlocked: boolean
  keyVersion: number
  /** Progress of the re-write job while it runs (e2eeSync.runMigration). */
  migration: { mode: 'encrypt' | 'decrypt'; done: number; total: number; files?: boolean } | null
  /** The server needs a newer client (design D9). */
  updateRequired: boolean
  /** The account encrypts here but the server has no key record: sync is paused until the user decides. */
  recordMissing: boolean
}

let snap: EncryptionSnapshot = { enabled: false, unlocked: false, keyVersion: 0, migration: null, updateRequired: false, recordMissing: false }
const listeners = new Set<() => void>()

export function publishEncryption(patch: Partial<EncryptionSnapshot>): void {
  snap = { ...snap, ...patch }
  for (const fn of listeners) fn()
}

export function encryptionSnapshot(): EncryptionSnapshot {
  return snap
}

/** Call `fn` on every change of the snapshot; returns the unsubscribe. */
export function onEncryptionChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function useEncryption(): EncryptionSnapshot {
  return useSyncExternalStore(onEncryptionChange, () => snap, () => snap)
}

// ---- key storage ----

// The in-memory copy, per database (tests run several devices in one process).
const memKeys = new Map<string, CryptoKey | null>()

/** This device's account key, or null when locked or never enrolled. */
export async function currentKey(): Promise<CryptoKey | null> {
  if (memKeys.has(db.name)) return memKeys.get(db.name) ?? null
  const k = await getMeta<CryptoKey | null>(K_KEY, null)
  memKeys.set(db.name, k)
  return k
}

async function storeKey(key: CryptoKey | null, record?: KeyRecord): Promise<void> {
  if (key && key.extractable) throw new Error('refusing to store an extractable account key')
  if (key) {
    await setMeta(K_KEY, key)
    await setMeta(K_KEY_FOR, record?.createdAt ?? null)
  } else {
    await db.meta.delete(K_KEY)
  }
  memKeys.set(db.name, key)
  publishEncryption({ unlocked: !!key })
}

export async function isEnabled(): Promise<boolean> {
  return getMeta<boolean>(K_ENABLED, false)
}

/** The cached key record (lets a device unlock offline once it has seen it). */
export async function cachedRecord(): Promise<KeyRecord | null> {
  return getMeta<KeyRecord | null>(K_RECORD, null)
}

async function setEnabled(enabled: boolean, record: KeyRecord | null): Promise<void> {
  // A key kept after disabling belongs to the old record; a new record (encryption
  // enabled again, possibly elsewhere) has a new account key: lock instead of
  // producing undecryptable values.
  if (enabled && record && (await currentKey()) && (await getMeta<number | null>(K_KEY_FOR, null)) !== (record.createdAt ?? null)) {
    await storeKey(null)
  }
  await setMeta(K_ENABLED, enabled)
  if (record) await setMeta(K_RECORD, record)
  else await db.meta.delete(K_RECORD)
  // Either the server has a record again or the user turned encryption off here.
  await db.meta.delete(K_MISSING)
  publishEncryption({ enabled, keyVersion: record?.version ?? 0, recordMissing: false })
}

/** The server reported no key record while this device encrypts. */
export async function isRecordMissing(): Promise<boolean> {
  return getMeta<boolean>(K_MISSING, false)
}

/**
 * Nothing may be pulled or pushed: the account encrypts on this device and
 * either the device holds no key or the server lost the key record.
 */
export async function syncBlocked(): Promise<boolean> {
  if (!(await isEnabled())) return false
  return !(await currentKey()) || (await isRecordMissing())
}

/** Load the stored state into the snapshot (app start, database switch in tests). */
export async function loadEncryptionState(): Promise<EncryptionSnapshot> {
  memKeys.delete(db.name)
  const [enabled, key, record, missing] = await Promise.all([isEnabled(), currentKey(), cachedRecord(), isRecordMissing()])
  publishEncryption({ enabled, unlocked: !!key, keyVersion: record?.version ?? 0, recordMissing: enabled && missing })
  return snap
}

/**
 * Fetch the server's key record (null when there is none) and adopt it. A record
 * turns encryption on; a missing record never turns it off on a device that
 * encrypts (encryption-state-integrity): a server restored from an older backup,
 * or a hostile one, would otherwise downgrade the device to plaintext. The device
 * is marked "record missing" instead and sync pauses until the user restores the
 * record (restoreKeyRecord) or turns encryption off here (turnOffAfterMissingRecord,
 * disableEncryption). A record with out-of-range derivation parameters is not
 * adopted (KeyRecordParamsError). Network errors propagate.
 */
export async function refreshFromServer(): Promise<KeyRecord | null> {
  let record: KeyRecord | null = null
  try {
    record = (await api.encryptionKeys()).keys
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err
  }
  if (record) {
    try {
      checkRecordParams(record)
    } catch (err) {
      // The account encrypts, but this record is not used or cached: a device
      // without the key stays locked with this reason.
      if (!(await isEnabled())) {
        await setMeta(K_ENABLED, true)
        publishEncryption({ enabled: true })
      }
      throw err
    }
    await setEnabled(true, record)
  } else if (await isEnabled()) {
    await setMeta(K_MISSING, true)
    publishEncryption({ recordMissing: true })
  }
  return record
}

/**
 * Adopt the profile's encryption status (App start). A changed key version
 * refreshes the cached record so an offline unlock uses the current wrap; the
 * account key itself never changes, so an unlocked device stays unlocked.
 */
export async function adoptProfile(status: EncryptionStatus | undefined, minClientVersion?: number): Promise<void> {
  if (minClientVersion !== undefined) publishEncryption({ updateRequired: minClientVersion > CLIENT_VERSION })
  await loadEncryptionState()
  if (!status) return
  const record = await cachedRecord()
  if (status.enabled && record?.version === status.keyVersion) {
    if (!(await isEnabled())) await setEnabled(true, record)
    return
  }
  if (!status.enabled && !(await isEnabled())) return
  try {
    await refreshFromServer()
  } catch {
    // Offline or a transient error: the next sync re-checks.
    if (status.enabled && !(await isEnabled())) await setMeta(K_ENABLED, true)
  }
}

// ---- unlock throttling ----

async function checkThrottle(now: number): Promise<number[]> {
  const recent = (await getMeta<number[]>(K_FAILURES, [])).filter((item) => now - item < FAILURE_WINDOW_MS)
  if (recent.length >= MAX_FAILURES) throw new UnlockThrottledError(recent[0] + FAILURE_WINDOW_MS)
  return recent
}

async function attempt<T>(fn: () => Promise<T>, now = Date.now()): Promise<T> {
  const recent = await checkThrottle(now)
  try {
    const out = await fn()
    await setMeta(K_FAILURES, [])
    return out
  } catch (err) {
    await setMeta(K_FAILURES, [...recent, now])
    throw err
  }
}

// ---- account actions ----

async function recordForUnlock(): Promise<KeyRecord> {
  try {
    const r = await refreshFromServer()
    if (r) return r
  } catch (err) {
    // A record this client refuses keeps the device locked, with that reason.
    if (err instanceof KeyRecordParamsError) throw err
    // Offline: fall back to the cached record (offline unlock).
  }
  const cached = await cachedRecord()
  if (!cached) throw new Error(t('Encryption is not enabled for this account, or the key record is not available offline.'))
  return cached
}

/**
 * Unlock this device with the passphrase or the recovery key. The key is kept
 * non-extractable in IndexedDB so the device works offline afterwards.
 */
export async function unlock(secret: string, kind: 'passphrase' | 'recovery', opts: { now?: number } = {}): Promise<void> {
  const record = await recordForUnlock()
  const key = await attempt(() => (kind === 'passphrase' ? unlockWithPassphrase(record, secret) : unlockWithRecoveryKey(record, secret)), opts.now)
  await storeKey(key, record)
}

/** Lock: forget the key on this device and pause sync until unlocked (local data stays). */
export async function lock(): Promise<void> {
  await storeKey(null)
}

/**
 * Enable encryption (design D1): the key record is created on the server first
 * (409 when another device was faster), then the device keeps the key and the
 * caller starts the re-write job. Returns the recovery key to show once.
 */
export async function enableEncryption(passphrase: string, opts: { iterations?: number } = {}): Promise<{ recoveryKey: string }> {
  const prepared = await prepareEnable(passphrase, opts)
  await commitEnable(prepared)
  return { recoveryKey: prepared.recoveryKey }
}

/** A key record generated on this device, not yet stored on the server (the wizard shows its recovery key first). */
export interface PreparedEnable {
  record: KeyRecord
  key: CryptoKey
  recoveryKey: string
}

/** Step 1 of enabling: derive and wrap locally; nothing leaves the device. */
export function prepareEnable(passphrase: string, opts: { iterations?: number } = {}): Promise<PreparedEnable> {
  return createKeyRecord(passphrase, opts)
}

/**
 * Step 2, after the user saved the recovery key and acknowledged the risk: store the record and keep the key.
 * `digestDisabled`: the server turned the weekly email digest off (stats-and-review), since it would carry titles.
 * `issueConnectionsStopped`: the names of the issue connections the server stopped (issue-import D11).
 */
export async function commitEnable({ record, key }: PreparedEnable): Promise<{ digestDisabled: boolean; issueConnectionsStopped: string[] }> {
  let stored: KeyRecord
  let digestDisabled = false
  let issueConnectionsStopped: string[] = []
  try {
    const res = await api.putEncryptionKeys(record)
    stored = res.keys
    digestDisabled = !!res.digestDisabled
    issueConnectionsStopped = res.issueConnectionsStopped ?? []
  } catch (err) {
    if (err instanceof ApiError && err.code === 'encryption_conflict') {
      await refreshFromServer().catch(() => undefined)
      throw new EncryptionConflictError()
    }
    throw err
  }
  await storeKey(key, stored)
  await setEnabled(true, stored)
  await db.meta.delete(K_DISCARD)
  return { digestDisabled, issueConnectionsStopped }
}

/** Change the passphrase: re-wrap only, no content op (design D1). Needs the current passphrase. */
export async function changePassphrase(current: string, next: string, opts: { iterations?: number } = {}): Promise<void> {
  const record = await refreshFromServer()
  if (!record) throw new Error(t('Encryption is not enabled for this account.'))
  const rewrapped = await attempt(() => rewrapWithPassphrase(record, current, next, opts))
  const stored = (await putOrConflict(rewrapped)).keys
  await setEnabled(true, stored)
}

/** Reset a forgotten passphrase with the recovery key; returns the new recovery key (the old one stops working). */
export async function resetPassphrase(recoveryKey: string, next: string, opts: { iterations?: number } = {}): Promise<{ recoveryKey: string }> {
  const record = await refreshFromServer()
  if (!record) throw new Error(t('Encryption is not enabled for this account.'))
  const reset = await attempt(() => resetWithRecoveryKey(record, recoveryKey, next, opts))
  const stored = (await putOrConflict(reset.record)).keys
  await storeKey(reset.key, stored)
  await setEnabled(true, stored)
  return { recoveryKey: reset.recoveryKey }
}

async function putOrConflict(record: KeyRecord): Promise<{ keys: KeyRecord }> {
  try {
    return await api.putEncryptionKeys(record)
  } catch (err) {
    if (err instanceof ApiError && err.code === 'encryption_conflict') throw new EncryptionConflictError()
    throw err
  }
}

/**
 * Disable (design D7): delete the key record on the server first, so other
 * devices stop encrypting, then the caller re-writes content as plaintext. The
 * key stays on this device so ciphertext that still arrives can be decrypted
 * and re-written; lock() forgets it.
 */
export async function disableEncryption(): Promise<void> {
  if (!(await currentKey())) throw new Error(t('Unlock this device first: content can only be decrypted with the key.'))
  await api.deleteEncryptionKeys().catch((err) => {
    if (!(err instanceof ApiError && err.status === 404)) throw err
  })
  await setEnabled(false, null)
}

/**
 * The server lost the key record while this device encrypts (encryption-state-integrity):
 * upload the record this device cached as a new record (version 1). It wraps the
 * same account key, so other devices keep decrypting with the same passphrase. A
 * device without the key proves the passphrase against the cached record first.
 * When another device was faster (409), its record is adopted instead.
 */
export async function restoreKeyRecord(passphrase?: string): Promise<void> {
  const cached = await cachedRecord()
  if (!cached) throw new Error(t('This device has no copy of the key record. Turn encryption off on this device, or unlock another device that still has it.'))
  let key = await currentKey()
  if (!key) {
    if (!passphrase) throw new Error(t('Enter your encryption passphrase to restore the key record.'))
    key = await attempt(() => unlockWithPassphrase(cached, passphrase))
  }
  const { createdAt: _created, updatedAt: _updated, ...rest } = cached
  let stored: KeyRecord
  try {
    stored = (await api.putEncryptionKeys({ ...rest, version: 1 })).keys
  } catch (err) {
    if (err instanceof ApiError && err.code === 'encryption_conflict') {
      await refreshFromServer()
      return
    }
    throw err
  }
  await storeKey(key, stored)
  await setEnabled(true, stored)
}

/**
 * The user's explicit choice after the server lost the key record: stop
 * encrypting on this device. No server call (there is no record to delete). The
 * key stays, as with disableEncryption, so ciphertext that still arrives is
 * re-written as plaintext; the caller starts the decrypt job when unlocked.
 */
export async function turnOffAfterMissingRecord(): Promise<void> {
  await setEnabled(false, null)
}

/**
 * Both passphrase and recovery key lost: delete the key record and discard the
 * encrypted content, which nobody can read any more. Undecryptable content is
 * tombstoned as it arrives (e2eeSync).
 */
export async function disableWithoutKey(): Promise<void> {
  await api.deleteEncryptionKeys().catch((err) => {
    if (!(err instanceof ApiError && err.status === 404)) throw err
  })
  await setMeta(K_DISCARD, true)
  await storeKey(null)
  await setEnabled(false, null)
}

/** Delete superseded content operations on the server (design D7). */
export async function purgeHistory(): Promise<{ purged: number; notice: string }> {
  return api.purgeEncryptionHistory()
}

/** Settings → Sign out clears local data; forget the in-memory key as well. */
export function forgetMemoryKeys(): void {
  memKeys.clear()
  publishEncryption({ enabled: false, unlocked: false, keyVersion: 0, migration: null, recordMissing: false })
}

/** A content value the UI should mark: plaintext on the server while the account encrypts. */
export function notYetEncrypted(row: { _e2ee?: { wire?: Record<string, string> } } & Record<string, unknown>, entity: Entity, personal = true): boolean {
  if (!snap.enabled || !personal) return false
  const values = entity === 'task' ? Object.entries((row.fields ?? {}) as Record<string, unknown>).map(([id, v]) => [`fields.${id}`, v] as const) : []
  for (const [f, v] of [...(CONTENT_FIELDS[entity] ?? []).map((f) => [f, row[f]] as const), ...values]) {
    const text = contentToString(entity, f, v)
    if (!text || isEnvelope(v)) continue
    const w = row._e2ee?.wire?.[f]
    if (w !== 'c' && w !== 'x') return true
  }
  return false
}

// ---- REST reads shown in the UI (history, activity, feed) ----

/**
 * Decrypt a value read from the server outside sync (revision history, server
 * activity pages) for display. Plaintext passes through; an envelope that does
 * not open with this device's key, or with no key, shows UNDECRYPTABLE.
 */
export async function displayValue(entity: Entity, entityId: string, field: string, value: unknown): Promise<unknown> {
  if (!isContentField(entity, field) || !isEnvelope(value)) return value
  const key = await currentKey()
  if (!key) return UNDECRYPTABLE
  try {
    return contentFromString(entity, field, await decryptValue(key, entity, entityId, field, value))
  } catch {
    return UNDECRYPTABLE
  }
}

/** Decrypt the from/to values of history or activity changes. */
export async function decryptChanges<T extends { field: string; from: unknown; to: unknown }>(entity: Entity, entityId: string, changes: T[]): Promise<T[]> {
  return Promise.all(changes.map(async (c) => ({
    ...c, from: await displayValue(entity, entityId, c.field, c.from), to: await displayValue(entity, entityId, c.field, c.to),
  })))
}

type ActivityLike = { entity: 'task' | 'project' | 'comment'; entityId: string; taskId?: string; taskTitle?: string; changes: { field: string; from: unknown; to: unknown }[] }

/** Decrypt the values and resolved task titles of a page of server activity events. */
export async function decryptActivityPage<P extends { events: ActivityLike[] }>(page: P): Promise<P> {
  const events = await Promise.all(page.events.map(async (e) => ({
    ...e,
    changes: await decryptChanges(e.entity, e.entityId, e.changes),
    ...(e.taskTitle !== undefined && e.taskId ? { taskTitle: (await displayValue('task', e.taskId, 'title', e.taskTitle)) as string } : {}),
  })))
  return { ...page, events }
}
