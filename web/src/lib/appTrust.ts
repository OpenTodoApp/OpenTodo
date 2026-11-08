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

/** Writes the record in one transaction. */
export async function saveTrust(record: TrustRecord, idb: IDBFactory = globalThis.indexedDB): Promise<void> {
  const db = await open(idb)
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(record, KEY)
      tx.oncomplete = () => resolve()
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
