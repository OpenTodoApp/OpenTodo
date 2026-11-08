// The signed web app's file list (OpenSpec change signed-web-app): reading
// app-manifest.json, checking its ECDSA P-256 signatures with WebCrypto, key
// fingerprints and the version order. The service worker uses it to check
// updates; Settings → About uses the fingerprints. internal/websign is the Go
// side; the shared vectors (internal/websign/testdata/manifest.vectors.json)
// keep the two in step (docs/contracts.md).

/** Signed in front of the payload, so a signature can never be reused as anything else. */
export const DOMAIN = 'opentodo-web-manifest/v1\n'
export const APP = 'opentodo-web'
export const MANIFEST_PATH = 'app-manifest.json'

export interface Envelope {
  format: number
  /** The manifest's exact bytes, base64url without padding. */
  payload: string
  signatures: { key: string; sig: string }[]
}

export interface ManifestFile { sha256: string; size: number; load: 'install' | 'lazy' }

export interface AppManifest {
  app: string
  version: string
  /** "preview" for an unsigned build of main. */
  build?: string
  /** The switch from report-only to refusal (design D17). */
  refuse: boolean
  keys: { spki: string; role: string }[]
  worker: { path: string; sha256: string }
  files: Record<string, ManifestFile>
}

export interface ParsedList { envelope: Envelope; payload: Uint8Array; manifest: AppManifest }

/** Why a list's signature was not accepted; the same causes as internal/websign. */
export type SignatureError = 'unsigned' | 'unknown-key' | 'bad-signature'
export type SignatureResult = { signer: string } | { error: SignatureError }

export function base64urlDecode(s: string): Uint8Array {
  return base64Decode(s.replace(/-/g, '+').replace(/_/g, '/'))
}

export function base64Decode(s: string): Uint8Array {
  const bin = atob(s.padEnd(Math.ceil(s.length / 4) * 4, '='))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
}

/** Reads app-manifest.json; null when it is not a list of this app in the known format. */
export function parseList(text: string): ParsedList | null {
  try {
    const envelope = JSON.parse(text) as Envelope
    if (envelope?.format !== 1 || typeof envelope.payload !== 'string' || !Array.isArray(envelope.signatures)) return null
    const payload = base64urlDecode(envelope.payload)
    const manifest = JSON.parse(new TextDecoder().decode(payload)) as AppManifest
    if (manifest?.app !== APP || typeof manifest.version !== 'string' || !manifest.files || typeof manifest.files !== 'object') return null
    if (!Array.isArray(manifest.keys)) manifest.keys = []
    manifest.refuse = manifest.refuse === true
    return { envelope, payload, manifest }
  } catch {
    return null
  }
}

/** The SHA-256 of a key's DER SubjectPublicKeyInfo: 64 lowercase hex characters. */
export async function fingerprint(spki: string): Promise<string> {
  return sha256Hex(base64Decode(spki))
}

/** "3F2A 9C41 7B0D E615": the first 16 characters, upper case, in four groups. */
export function shortFingerprint(full: string): string {
  const s = full.slice(0, 16).toUpperCase()
  return s.length < 16 ? s : `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8, 12)} ${s.slice(12, 16)}`
}

async function importKey(spki: string): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.importKey('spki', base64Decode(spki) as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  } catch {
    return null
  }
}

/**
 * Checks a list's signatures against trusted keys (base64 SPKIs) and returns
 * the fingerprint of the first trusted key whose signature verifies, or the
 * cause: no signature, none by a trusted key, or a trusted key's that fails.
 */
export async function verifyList(list: Pick<ParsedList, 'envelope' | 'payload'>, trusted: readonly string[]): Promise<SignatureResult> {
  if (list.envelope.signatures.length === 0) return { error: 'unsigned' }
  const keys = new Map<string, string>()
  for (const spki of trusted) {
    try { keys.set(await fingerprint(spki), spki) } catch { /* not base64: never trusted */ }
  }
  const domain = new TextEncoder().encode(DOMAIN)
  const message = new Uint8Array(domain.length + list.payload.length)
  message.set(domain)
  message.set(list.payload, domain.length)
  let named = false
  for (const s of list.envelope.signatures) {
    const key = String(s?.key ?? '').toLowerCase()
    const spki = keys.get(key)
    if (!spki) continue
    named = true
    const pub = await importKey(spki)
    if (!pub) continue
    let sig: Uint8Array
    try { sig = base64urlDecode(String(s.sig)) } catch { continue }
    if (sig.length !== 64) continue
    if (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig as BufferSource, message as BufferSource)) return { signer: key }
  }
  return { error: named ? 'bad-signature' : 'unknown-key' }
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

function cmp(a: number, b: number): number { return a < b ? -1 : a > b ? 1 : 0 }

function cmpIdent(a: string, b: string): number {
  const na = /^\d+$/.test(a)
  const nb = /^\d+$/.test(b)
  if (na && nb) return a.length !== b.length ? cmp(a.length, b.length) : a < b ? -1 : a > b ? 1 : 0
  if (na) return -1
  if (nb) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Semantic version precedence, as internal/websign.CompareVersions: build
 * metadata is ignored, a pre-release is lower than its release, and a version
 * that does not parse is lower than any that does.
 */
export function compareVersions(a: string, b: string): number {
  const va = SEMVER.exec(a)
  const vb = SEMVER.exec(b)
  if (!va && !vb) return 0
  if (!va) return -1
  if (!vb) return 1
  for (let i = 1; i <= 3; i++) {
    // Each part may exceed 2^53; compare as digit strings.
    const c = cmpIdent(va[i], vb[i])
    if (c !== 0) return c
  }
  const pa = va[4]?.split('.') ?? []
  const pb = vb[4]?.split('.') ?? []
  if (pa.length === 0 || pb.length === 0) return cmp(pb.length, pa.length)
  for (let i = 0; i < pa.length && i < pb.length; i++) {
    const c = cmpIdent(pa[i], pb[i])
    if (c !== 0) return c
  }
  return cmp(pa.length, pb.length)
}
