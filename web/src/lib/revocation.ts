// A revoked device removes its local copy (OpenSpec change revoked-device-wipe).
// While signed in, auth/status hands this session a wipe key, kept in the local
// database next to the data it protects (a sign-out or a wipe removes it with
// them). Once the session is revoked on purpose (Sign out everywhere, the
// account deactivated or deleted), auth/status answers its cookie with
// `revoked.proof`, an HMAC-SHA256 under that key. Only a proof that matches the
// stored key wipes: an answer from anything but this server, or for another
// session, changes nothing (design D3).
import { msg } from './i18n/catalog'
import { getMeta, setMeta } from './db'
import type { AuthStatus } from './types'

const K_WIPE = 'wipeKey'
/** What the proof authenticates; internal/auth/revoke.go uses the same text. */
const MESSAGE = 'opentodo device revoked v1'

/** The sign-in screen's notice after a wipe. */
export const REVOKED_NOTICE = msg('This device was signed out and its data was removed.')

/** Keeps the session's wipe key from a signed-in status (a no-op when it is unchanged or absent). */
export async function rememberWipeKey(status: Pick<AuthStatus, 'wipeKey'>): Promise<void> {
  const key = status.wipeKey
  if (!key || (await getMeta<string | null>(K_WIPE, null)) === key) return
  await setMeta(K_WIPE, key)
}

/** Whether a signed-out status proves that this device's session was revoked. */
export async function revokedHere(status: Pick<AuthStatus, 'authenticated' | 'revoked'>): Promise<boolean> {
  const proof = status.revoked?.proof
  if (status.authenticated || !proof) return false
  const stored = await getMeta<string | null>(K_WIPE, null)
  if (!stored) return false
  const sig = fromBase64url(proof)
  if (!sig) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(stored), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('HMAC', key, sig, enc.encode(MESSAGE))
}

/**
 * Runs `wipe` when the status proves this device was revoked, and reports
 * whether it did. A failed check (no Web Crypto, a broken database) wipes nothing.
 */
export async function wipeIfRevoked(status: Pick<AuthStatus, 'authenticated' | 'revoked'>, wipe: () => Promise<void>): Promise<boolean> {
  if (!(await revokedHere(status).catch(() => false))) return false
  await wipe()
  return true
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
