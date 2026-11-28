// The trust record of the signed web app (OpenSpec change signed-web-app,
// design D5 and D17): which mode this device is in for this server, the keys
// it trusts, whether refusal is on, the installed and previous versions, and
// the last check's result. The service worker writes it; Settings → About
// reads it. It lives in its own IndexedDB database, so signing out and the
// revoked-device wipe (which clear the app's Dexie database) never touch it.
import type { ManifestFile, SignatureError } from './appCode'
import { fingerprint, shortFingerprint } from './appCode'
import { resettable } from './moduleState'

export const TRUST_DB = 'opentodo-app'
const STORE = 'trust'
const KEY = 'record'

/** Why a check failed; the same words internal/websign uses. */
export type CheckCause = SignatureError | 'older' | 'changed-file' | 'missing-file' | 'no-list'

/** signed: a trusted key signed what is installed; self-built and preview: unsigned builds. */
export type TrustMode = 'signed' | 'self-built' | 'preview'

export interface InstalledVersion {
  version: string
  /** SHA-256 of the list's payload. */
  payloadHash: string
  /** The cache holding its files. */
  cache: string
  files: Record<string, ManifestFile>
  /** SHA-256 of the service worker the list names, for the changed-worker warning (D8); absent in records from before it. */
  worker?: string
  at: number
}

export interface CheckResult {
  at: number
  version: string
  passed: boolean
  cause?: CheckCause
  /** The file a changed-file or missing-file cause names. */
  path?: string
  /** True when the update was not installed (refusal on). */
  refused: boolean
}

export interface TrustRecord {
  mode: TrustMode
  /** Trusted keys (base64 SPKI), in signed mode. */
  keys: string[]
  /** Full fingerprint of the key that signed the installed version, in signed mode. */
  signer?: string
  /** Refusal is on for this device, for good (design D17). */
  refuse: boolean
  /** The newest version installed with a verified signature, in signed mode: older ones are refused. */
  verified?: { version: string; payloadHash: string }
  current?: InstalledVersion
  previous?: InstalledVersion
  lastCheck?: CheckResult
  /** Hashes of the refused lists already announced, five at most. */
  announced: string[]
}

function open(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(TRUST_DB, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** The record, or null before the first install (or without IndexedDB). */
export async function loadTrust(idb: IDBFactory | undefined = globalThis.indexedDB): Promise<TrustRecord | null> {
  if (!idb) return null
  const db = await open(idb)
  try {
    return await new Promise<TrustRecord | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as TrustRecord | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

/**
 * Changes the record as stored, in one transaction: `change` gets the stored record
 * and returns the one to store, or null to leave it. Transactions on the store run
 * one at a time, also between workers, so nothing written meanwhile is lost.
 * Answers the record written, or null when nothing was.
 */
export async function updateTrust(change: (stored: TrustRecord | null) => TrustRecord | null, idb: IDBFactory = globalThis.indexedDB): Promise<TrustRecord | null> {
  const db = await open(idb)
  try {
    return await new Promise<TrustRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      let next: TrustRecord | null = null
      const req = store.get(KEY)
      req.onsuccess = () => {
        next = change((req.result as TrustRecord | undefined) ?? null)
        if (next) store.put(next, KEY)
      }
      tx.oncomplete = () => resolve(next)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

let officialPrints: Promise<string[]> | null = null
resettable('officialKeys', () => { officialPrints = null })

/** The fingerprints of the official keys built into this page (vite.config.ts). */
export function officialFingerprints(keys: readonly string[] = typeof __OFFICIAL_KEYS__ === 'undefined' ? [] : __OFFICIAL_KEYS__): Promise<string[]> {
  officialPrints ??= Promise.all(keys.map(fingerprint))
  return officialPrints
}

/** Whether the record trusts a key that isn't one of OpenTodo's (an own-key build, design D11). */
export async function trustsOwnKey(r: TrustRecord): Promise<boolean> {
  return r.mode === 'signed' && !!r.signer && !(await officialFingerprints()).includes(r.signer)
}

/**
 * One line a person can paste into an issue (design D10): the version, the
 * mode, the key, whether refusal is on and the last check. No account data.
 */
export function diagnosticsLine(r: TrustRecord): string {
  const parts = [
    'opentodo-app-code',
    `version=${r.current?.version ?? 'none'}`,
    `mode=${r.mode}`,
    `key=${r.signer ? shortFingerprint(r.signer).replace(/ /g, '') : 'none'}`,
    `refuse=${r.refuse ? 'on' : 'off'}`,
  ]
  const c = r.lastCheck
  if (c) {
    parts.push(`check=${c.passed ? 'passed' : c.refused ? 'refused' : 'failed'}`)
    if (c.cause) parts.push(`cause=${c.cause}`)
    if (c.path) parts.push(`path=${c.path}`)
    if (!c.passed) parts.push(`offered=${c.version}`)
    parts.push(`at=${new Date(c.at).toISOString().replace(/\.\d{3}Z$/, 'Z')}`)
  }
  return parts.join(' ')
}

/**
 * The refusal mode remembered beside the page policy, for a worker that cannot read
 * its record. It only ever turns on, like the record's own ratchet (D5): refusal is
 * its own key, written once and never overwritten, so a late report-only write from
 * any worker cannot undo it; turning it on also overwrites the report-only value. `get` answers true, false only for an explicit report-only
 * value, and null for nothing or anything else; a cache that cannot be opened rejects.
 */
export function rememberedMode(open: () => Promise<Pick<Cache, 'match' | 'put'>>) {
  return {
    get: async (): Promise<boolean | null> => {
      const c = await open()
      if (await c.match(REFUSE_ON_KEY)) return true
      const r = await c.match(REPORT_ONLY_KEY)
      return r && (await r.text()) === '0' ? false : null
    },
    set: async (on: boolean): Promise<void> => {
      const c = await open()
      if (!on) return c.put(REPORT_ONLY_KEY, new Response('0'))
      // Refusal also replaces an older report-only value: losing the on-key alone, or
      // failing to write it, then reads as unknown, never as report-only.
      const writes = await Promise.allSettled([c.put(REPORT_ONLY_KEY, new Response('1')), c.put(REFUSE_ON_KEY, new Response('1'))])
      const failed = writes.find((w) => w.status === 'rejected')
      if (failed) throw (failed as PromiseRejectedResult).reason
    },
  }
}
const REFUSE_ON_KEY = '/__refuse-on'
const REPORT_ONLY_KEY = '/__refuse'

/** What the worker knows of its record: the record (or the last one it read), and whether this read failed. */
export interface TrustState {
  record: TrustRecord | null
  /** The store could not be read: the record is the last one read in this worker, or none. */
  unreadable: boolean
  /** Refusal applies: the record says so, or, unreadable, the last mode the device had did. */
  refuse: boolean
}

/**
 * The worker's reads of its record. `remembered.get` answers the refusal mode last
 * remembered, and null (or a rejection) when none was or it cannot be read: unknown.
 * "No record" (a first install) is cached like any record; a failed read is not, so
 * the next request reads again. Every save the worker makes goes through `saved`, so
 * the record standing in while the store cannot be read is the last one this worker
 * read or wrote, and the remembered mode follows it. While the store cannot be read,
 * refusal applies unless both the remembered mode and the stand-in say report-only:
 * a stand-in never overrides a mode another worker remembered since.
 */
export function trustReader(load: () => Promise<TrustRecord | null>, remembered: { get: () => Promise<boolean | null>; set: (on: boolean) => Promise<void> }) {
  let pending: Promise<TrustState> | null = null
  let known: TrustRecord | null = null
  // Counts this worker's saves: a read that a save overtook keeps neither its record nor its mode.
  let saves = 0
  const read = async (): Promise<TrustState> => {
    const at = saves
    try {
      const record = await load()
      if (saves !== at) return { record: known, unreadable: false, refuse: !!known?.refuse }
      known = record
      if (record) await remembered.set(record.refuse).catch(() => undefined)
      return { record, unreadable: false, refuse: !!record?.refuse }
    } catch {
      const mode = await remembered.get().catch(() => null)
      return { record: known, unreadable: true, refuse: mode !== false || !!known?.refuse }
    }
  }
  return {
    read: (): Promise<TrustState> => {
      if (pending) return pending
      const p = read()
      pending = p
      // A failed read is not kept: the next request reads again.
      void p.then((t) => { if (t.unreadable && pending === p) pending = null })
      return p
    },
    /** After a write: the next read goes to the store. */
    forget: (): void => { pending = null },
    /** After a save that succeeded: the saved record stands in, its mode is remembered, the next read goes to the store. */
    saved: async (record: TrustRecord): Promise<void> => {
      saves++
      known = record
      pending = null
      await remembered.set(record.refuse).catch(() => undefined)
    },
  }
}
