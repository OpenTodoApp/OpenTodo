import { t } from './i18n'
// End-to-end encryption primitives (OpenSpec change `e2ee`, design D1 and D3).
// Only the browser's built-in Web Crypto API is used: no dependency, no
// home-grown primitive. Everything here is pure (no storage, no network) so it
// can be tested with known-answer vectors.
//
// Key hierarchy (all client-side):
//   account key (DEK)   AES-256-GCM, 256 random bits from crypto.getRandomValues
//   passphrase key      PBKDF2-HMAC-SHA-256(passphrase, 16-byte salt, 600,000) -> AES-KW-256
//   recovery key        256 random bits, shown once as 56 base32 characters
//                       (52 for the key + 4 checksum), HKDF-SHA-256 -> AES-KW-256
// The DEK is wrapped (AES-KW, RFC 3394) under both; only the wrapped blobs and
// the derivation parameters reach the server (the key record).
//
// Content value format, carried as an ordinary string through the op log:
//   "enc:v1:" + base64url(nonce(12) || AES-256-GCM(utf8(plaintext)) incl. 16-byte tag)
//   additional authenticated data = utf8(entity + "\0" + entityId + "\0" + field)
// The binding makes a value moved to another field or entity fail authentication.
// Nonces are 96 random bits per encryption; with a single key per account the
// collision probability stays negligible far beyond any realistic number of
// edits (NIST SP 800-38D's 2^32 bound for random nonces).

export const PREFIX = 'enc:'
export const PREFIX_V1 = 'enc:v1:'
export const KDF_PBKDF2_SHA256 = 1
export const PBKDF2_ITERATIONS = 600_000
export const MIN_PASSPHRASE_LENGTH = 12
/**
 * PBKDF2 iteration counts this client accepts from a key record (encryption-state-integrity).
 * The server stores 600,000 and up; a record outside this range came from a broken
 * or hostile server (too few: cheap to brute-force; too many: the device hangs).
 * Mutable only so tests can derive keys quickly.
 */
export const ITERATION_LIMITS = { min: 100_000, max: 10_000_000 }
/**
 * Largest plaintext (UTF-8 bytes) a content field may hold on an encrypted
 * account: its envelope is 64,047 bytes of JSON, under the
 * server's unchanged 64 KiB value limit (design D3).
 */
export const MAX_PLAINTEXT_BYTES = 48_000
const NONCE_BYTES = 12
const RECOVERY_INFO = 'opentodo/e2ee/recovery-kek/v1'
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** A value failed to decrypt: wrong key, tampered ciphertext, or moved to another field. */
export class DecryptError extends Error {
  constructor(message = t('cannot decrypt this value')) {
    super(message)
  }
}

/** The passphrase or recovery key did not unwrap the account key. */
export class WrongSecretError extends Error {
  constructor(message = t('the passphrase or recovery key is not correct')) {
    super(message)
  }
}

/** A recovery key was mistyped (bad length, characters or checksum). */
export class RecoveryKeyFormatError extends Error {
  constructor(message = t('this is not a valid recovery key; check for typos')) {
    super(message)
  }
}

/** A key record's derivation parameters are outside what this client accepts. */
export class KeyRecordParamsError extends Error {
  constructor(public iterations: number) {
    super(t('The encryption key record from the server uses {n} key derivation iterations, outside the accepted range. This device stays locked; ask the server operator to check the server.', { n: iterations }))
  }
}

/** Throws KeyRecordParamsError when the record's iteration count is out of range or not an integer. */
export function checkRecordParams(record: KeyRecord): void {
  const n = record.iterations
  if (!Number.isInteger(n) || n < ITERATION_LIMITS.min || n > ITERATION_LIMITS.max) throw new KeyRecordParamsError(n)
}

/** What the server stores: wrapped keys and derivation parameters (design D1). */
export interface KeyRecord {
  version: number
  kdf: number
  salt: string
  iterations: number
  wrappedByPassphrase: string
  wrappedByRecovery: string
  createdAt?: number
  updatedAt?: number
}

// ---- encoding ----

const enc = new TextEncoder()
const dec = new TextDecoder('utf-8', { fatal: true })

type Bytes = Uint8Array<ArrayBuffer>

export function utf8(s: string): Bytes {
  return enc.encode(s) as Bytes
}

export function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(s: string): Bytes {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('not base64url')
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function random(n: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(n))
}

/** True for a string that starts like a ciphertext envelope (the server's loose check). */
export function isCiphertext(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(PREFIX)
}

const ENVELOPE = /^enc:v[0-9]+:[A-Za-z0-9_-]{38,}$/

/**
 * True for a well-formed envelope: "enc:vN:" and at least nonce + tag of
 * base64url. Stricter than isCiphertext so a title someone typed as "enc: …"
 * is still treated (and encrypted) as text.
 */
export function isEnvelope(v: unknown): v is string {
  return typeof v === 'string' && ENVELOPE.test(v)
}

// ---- keys ----

/** A fresh account key. Extractable only so it can be wrapped once; callers keep a non-extractable copy. */
export function generateAccountKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export function randomSalt(): Bytes {
  return random(16)
}

/** The passphrase key (design D1): PBKDF2-SHA-256 into a non-extractable AES-KW key. */
export async function derivePassphraseKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', utf8(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as Bytes, iterations },
    base, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey'],
  )
}

/** The recovery key's wrapping key: HKDF-SHA-256 with a fixed context, so a passphrase change never touches it. */
export async function deriveRecoveryKey(raw: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', raw as Bytes, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: utf8(RECOVERY_INFO) },
    base, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey'],
  )
}

export async function wrapAccountKey(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.wrapKey('raw', dek, kek, 'AES-KW')))
}

/** Unwrap the account key; `extractable` only for the moment a re-wrap needs it. */
export async function unwrapAccountKey(wrapped: string, kek: CryptoKey, extractable = false): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey('raw', fromB64url(wrapped), kek, 'AES-KW', { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt'])
  } catch {
    // AES-KW's integrity check fails for a wrong key-encryption key.
    throw new WrongSecretError()
  }
}

// ---- recovery key text ----

function base32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

function fromBase32(s: string): Uint8Array {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const c of s) {
    const v = BASE32.indexOf(c)
    if (v < 0) throw new RecoveryKeyFormatError()
    value = ((value << 5) | v) & 0xffff
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

async function checksum(raw: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', raw as Bytes))
  // 20 bits of the hash as four base32 characters.
  return base32(h.slice(0, 3)).slice(0, 4)
}

/** 32 random bytes as 14 groups of four base32 characters, the last group a checksum. */
export async function formatRecoveryKey(raw: Uint8Array): Promise<string> {
  if (raw.length !== 32) throw new Error('a recovery key is 32 bytes')
  const text = base32(raw) + (await checksum(raw))
  return text.match(/.{4}/g)!.join('-')
}

/**
 * Parse a typed recovery key: case, spaces and dashes are ignored and the digits
 * 0, 1 and 8 read as O, I and B (they are not in the alphabet). Throws
 * RecoveryKeyFormatError on a wrong length, character or checksum.
 */
export async function parseRecoveryKey(text: string): Promise<Uint8Array> {
  const s = text.toUpperCase().replace(/[\s-]/g, '').replace(/0/g, 'O').replace(/1/g, 'I').replace(/8/g, 'B')
  if (s.length !== 56) throw new RecoveryKeyFormatError()
  const raw = fromBase32(s.slice(0, 52)).slice(0, 32)
  if (raw.length !== 32 || base32(raw) !== s.slice(0, 52)) throw new RecoveryKeyFormatError()
  if ((await checksum(raw)) !== s.slice(52)) throw new RecoveryKeyFormatError()
  return raw
}

export function generateRecoveryBytes(): Bytes {
  return random(32)
}

// ---- key record lifecycle ----

/** Import a raw DEK as the non-extractable key a device keeps. */
async function nonExtractable(dek: CryptoKey): Promise<CryptoKey> {
  const raw = await crypto.subtle.exportKey('raw', dek)
  try {
    return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  } finally {
    new Uint8Array(raw).fill(0)
  }
}

/**
 * Enablement (design D1): a new account key wrapped under the passphrase and a
 * new recovery key. Returns the record for the server, the device's
 * non-extractable key and the recovery key text to show once.
 */
export async function createKeyRecord(passphrase: string, opts: { iterations?: number } = {}): Promise<{ record: KeyRecord; key: CryptoKey; recoveryKey: string }> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error(t('the passphrase must have at least {n} characters', { n: MIN_PASSPHRASE_LENGTH }))
  const iterations = opts.iterations ?? PBKDF2_ITERATIONS
  const dek = await generateAccountKey()
  const salt = randomSalt()
  const recovery = generateRecoveryBytes()
  const record: KeyRecord = {
    version: 1, kdf: KDF_PBKDF2_SHA256, salt: b64url(salt), iterations,
    wrappedByPassphrase: await wrapAccountKey(dek, await derivePassphraseKey(passphrase, salt, iterations)),
    wrappedByRecovery: await wrapAccountKey(dek, await deriveRecoveryKey(recovery)),
  }
  const recoveryKey = await formatRecoveryKey(recovery)
  recovery.fill(0)
  return { record, key: await nonExtractable(dek), recoveryKey }
}

export async function unlockWithPassphrase(record: KeyRecord, passphrase: string, extractable = false): Promise<CryptoKey> {
  if (record.kdf !== KDF_PBKDF2_SHA256) throw new Error(t('unsupported key derivation {kdf}; update the app', { kdf: record.kdf }))
  checkRecordParams(record)
  const kek = await derivePassphraseKey(passphrase, fromB64url(record.salt), record.iterations)
  return unwrapAccountKey(record.wrappedByPassphrase, kek, extractable)
}

export async function unlockWithRecoveryKey(record: KeyRecord, recoveryKey: string, extractable = false): Promise<CryptoKey> {
  const raw = await parseRecoveryKey(recoveryKey)
  return unwrapAccountKey(record.wrappedByRecovery, await deriveRecoveryKey(raw), extractable)
}

/**
 * Passphrase change: re-wrap the same account key under a new passphrase and a
 * new salt; content is not re-encrypted and the recovery wrap is kept.
 */
export async function rewrapWithPassphrase(record: KeyRecord, currentPassphrase: string, newPassphrase: string, opts: { iterations?: number } = {}): Promise<KeyRecord> {
  if (newPassphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error(t('the passphrase must have at least {n} characters', { n: MIN_PASSPHRASE_LENGTH }))
  const dek = await unlockWithPassphrase(record, currentPassphrase, true)
  const iterations = opts.iterations ?? PBKDF2_ITERATIONS
  const salt = randomSalt()
  return {
    version: record.version + 1, kdf: KDF_PBKDF2_SHA256, salt: b64url(salt), iterations,
    wrappedByPassphrase: await wrapAccountKey(dek, await derivePassphraseKey(newPassphrase, salt, iterations)),
    wrappedByRecovery: record.wrappedByRecovery,
  }
}

/**
 * Forgotten passphrase: the recovery key unwraps the account key, which is
 * re-wrapped under a new passphrase and a new recovery key (the old one stops
 * working). Returns the new record, the device key and the new recovery key text.
 */
export async function resetWithRecoveryKey(record: KeyRecord, recoveryKey: string, newPassphrase: string, opts: { iterations?: number } = {}): Promise<{ record: KeyRecord; key: CryptoKey; recoveryKey: string }> {
  if (newPassphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error(t('the passphrase must have at least {n} characters', { n: MIN_PASSPHRASE_LENGTH }))
  const dek = await unlockWithRecoveryKey(record, recoveryKey, true)
  const iterations = opts.iterations ?? PBKDF2_ITERATIONS
  const salt = randomSalt()
  const recovery = generateRecoveryBytes()
  const next: KeyRecord = {
    version: record.version + 1, kdf: KDF_PBKDF2_SHA256, salt: b64url(salt), iterations,
    wrappedByPassphrase: await wrapAccountKey(dek, await derivePassphraseKey(newPassphrase, salt, iterations)),
    wrappedByRecovery: await wrapAccountKey(dek, await deriveRecoveryKey(recovery)),
  }
  const text = await formatRecoveryKey(recovery)
  recovery.fill(0)
  return { record: next, key: await nonExtractable(dek), recoveryKey: text }
}

// ---- content values ----

/** The additional authenticated data binding a value to where it belongs. */
export function bindingOf(entity: string, entityId: string, field: string): Bytes {
  return utf8(`${entity}\u0000${entityId}\u0000${field}`)
}

/**
 * Encrypt one content value. `nonce` is for known-answer tests only; production
 * calls always draw a fresh random one.
 */
export async function encryptValue(key: CryptoKey, entity: string, entityId: string, field: string, plaintext: string, nonce?: Uint8Array): Promise<string> {
  const iv = (nonce ?? random(NONCE_BYTES)) as Bytes
  if (iv.length !== NONCE_BYTES) throw new Error('nonce must be 12 bytes')
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: bindingOf(entity, entityId, field), tagLength: 128 }, key, utf8(plaintext)))
  const out = new Uint8Array(NONCE_BYTES + ct.length)
  out.set(iv)
  out.set(ct, NONCE_BYTES)
  return PREFIX_V1 + b64url(out)
}

/** Decrypt one content value; throws DecryptError when it is not authentic for this key and location. */
export async function decryptValue(key: CryptoKey, entity: string, entityId: string, field: string, value: string): Promise<string> {
  if (!value.startsWith(PREFIX_V1)) throw new DecryptError(t('unknown ciphertext format; update the app'))
  let raw: Uint8Array
  try {
    raw = fromB64url(value.slice(PREFIX_V1.length))
  } catch {
    throw new DecryptError()
  }
  if (raw.length < NONCE_BYTES + 16) throw new DecryptError()
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: raw.slice(0, NONCE_BYTES) as Bytes, additionalData: bindingOf(entity, entityId, field), tagLength: 128 },
      key, raw.slice(NONCE_BYTES) as Bytes,
    )
    return dec.decode(pt)
  } catch {
    throw new DecryptError()
  }
}

/** UTF-8 length of a string, for the plaintext size check. */
export function byteLength(s: string): number {
  return utf8(s).length
}

// ---- attachment files (OpenSpec attachments, design D8) ----

/** The attachment envelope's magic and its chunk size (1 MiB, like backups). */
export const FILE_MAGIC = 'OTAT1'
export const FILE_CHUNK = 1 << 20
const FILE_HEADER = 17
const TAG_BYTES = 16

function fileNonce(prefix: Uint8Array, index: number, final: boolean): Bytes {
  if (index >= 1 << 24) throw new Error('file too large for the envelope')
  const n = new Uint8Array(NONCE_BYTES)
  n.set(prefix)
  n[8] = (index >> 16) & 0xff
  n[9] = (index >> 8) & 0xff
  n[10] = index & 0xff
  n[11] = final ? 1 : 0
  return n as Bytes
}

function fileAad(id: string, header: Uint8Array): Bytes {
  const label = utf8(`attachment\u0000${id}\u0000`)
  const aad = new Uint8Array(label.length + header.length)
  aad.set(label)
  aad.set(header, label.length)
  return aad as Bytes
}

/**
 * Encrypt a file for an attachment: a header and AES-GCM chunks read one at a
 * time from the Blob, so the whole plaintext is never in memory at once. The id
 * is bound into every chunk; the last chunk is marked final. `prefix` and
 * `chunkSize` are for known-answer tests only.
 */
export async function encryptFile(key: CryptoKey, id: string, file: Blob, opts: { prefix?: Uint8Array; chunkSize?: number } = {}): Promise<Blob> {
  const chunkSize = opts.chunkSize ?? FILE_CHUNK
  const prefix = opts.prefix ?? random(8)
  const header = new Uint8Array(FILE_HEADER)
  header.set(utf8(FILE_MAGIC))
  new DataView(header.buffer).setUint32(5, chunkSize)
  header.set(prefix, 9)
  const aad = fileAad(id, header)
  const parts: BlobPart[] = [header]
  for (let i = 0; ; i++) {
    const end = Math.min((i + 1) * chunkSize, file.size)
    const final = end === file.size
    const plain = new Uint8Array(await file.slice(i * chunkSize, end).arrayBuffer())
    parts.push(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: fileNonce(prefix, i, final), additionalData: aad, tagLength: 128 }, key, plain as Bytes)))
    if (final) break
  }
  return new Blob(parts, { type: 'application/octet-stream' })
}

/**
 * Open an attachment envelope chunk by chunk into a Blob of `type`. Throws
 * DecryptError for a wrong key or id, a reordered, altered or missing chunk, or
 * a truncated file.
 */
export async function decryptFile(key: CryptoKey, id: string, envelope: Blob, type = 'application/octet-stream'): Promise<Blob> {
  if (envelope.size < FILE_HEADER + TAG_BYTES) throw new DecryptError()
  const header = new Uint8Array(await envelope.slice(0, FILE_HEADER).arrayBuffer())
  if (dec.decode(header.slice(0, 5)) !== FILE_MAGIC) throw new DecryptError(t('unknown file format; update the app'))
  const chunkSize = new DataView(header.buffer).getUint32(5)
  if (chunkSize === 0) throw new DecryptError()
  const prefix = header.slice(9, FILE_HEADER)
  const aad = fileAad(id, header)
  const sealed = chunkSize + TAG_BYTES
  const body = envelope.size - FILE_HEADER
  const count = Math.max(1, Math.ceil(body / sealed))
  const parts: BlobPart[] = []
  for (let i = 0; i < count; i++) {
    const start = FILE_HEADER + i * sealed
    const chunk = new Uint8Array(await envelope.slice(start, Math.min(start + sealed, envelope.size)).arrayBuffer())
    if (chunk.length < TAG_BYTES) throw new DecryptError()
    try {
      parts.push(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fileNonce(prefix, i, i === count - 1), additionalData: aad, tagLength: 128 }, key, chunk as Bytes)))
    } catch {
      throw new DecryptError()
    }
  }
  return new Blob(parts, { type })
}
