// The last known two-factor status, cached in localStorage (non-secret booleans
// and a count) so Settings can show it read-only while offline (OpenSpec
// `mfa-totp`). Its own small module: the app shell writes it at sign-in and
// sign-out without loading the two-factor panel.
import { readJSON, writeString } from '../lib/deviceStorage'
import type { MfaStatus } from '../lib/types'

const STATUS_KEY = 'opentodo.mfa'

export function readCachedMfa(): MfaStatus | null {
  return readJSON<MfaStatus | null>(STATUS_KEY, null)
}

export function cacheMfa(st: MfaStatus | null) {
  // Storage unavailable: the status is fetched again next time.
  writeString(STATUS_KEY, st ? JSON.stringify(st) : null)
}
