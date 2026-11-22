// Signing out, and what this device keeps (OpenSpec client-sync-robustness): unsynced
// changes are uploaded first when online, this device's push subscription is removed
// with the session, the provider's end-session page takes the browser, and the local
// copy, the in-memory keys and the account's badge go before the screen returns to
// sign-in. `clearDeviceData` is also what an expired demo sandbox clears with
// (OpenSpec `demo-sandboxes`).
import { useCallback } from 'react'
import { clearBadge } from '../lib/appBadge'
import { api } from '../lib/api'
import { clearOwnAvatar } from '../lib/avatars'
import { clearLocalData, hasLocalData } from '../lib/db'
import { forgetMemoryKeys } from '../lib/e2ee'
import { forgetNoiseVolume } from '../lib/focus/prefs'
import { clearInbox } from '../lib/shareInbox'
import { unsubscribeOnSignOut } from '../lib/push'
import { currentUserId } from '../lib/sharing'
import { announceSignOut, stopSyncAndWait, syncNow, withSyncLock } from '../lib/sync'
import { cacheMfa } from './mfaCache'
import { clearVimPref } from './vim/prefs'

/**
 * Browser storage keys that hold the account's data (names, text, entity ids) rather than
 * a device preference, so the next account on this browser starts without them
 * (client-data-safety; 1.6.0 web security review L1, L2). Kept as names so this module
 * loads none of the screens that use them; accountStorage.test.ts checks them.
 */
export const ACCOUNT_KEYS = [
  'appLinksTrusted', // schemes trusted with "Don't ask again" (app-links D4)
  'opentodo.notes.tokens', // the Notes search chips: label and project names
  'opentodo.notes.filters', // the same, as an earlier version stored them
  'opentodo.notes.graph.positions', // note ids
  'opentodo.importJobs', // import summaries, file names
  'opentodo.taskPageSnapshots', // shared task pages uploaded from here
  'opentodo.notePageSnapshots', // shared note pages uploaded from here
  'opentodo.collapsed', // task ids
  'ot.groups.collapsed', // project and group ids
  'ot.subprojects.collapsed', // project ids
  'ot.objectives.collapsed', // objective ids
] as const

/** Session storage prefixes of the account's text: comment drafts per task. */
const ACCOUNT_SESSION_PREFIXES = ['ot.draft.']

function forgetAccountStorage(): void {
  try {
    for (const key of ACCOUNT_KEYS) localStorage.removeItem(key)
    const drafts: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && ACCOUNT_SESSION_PREFIXES.some((p) => key.startsWith(p))) drafts.push(key)
    }
    for (const key of drafts) sessionStorage.removeItem(key)
  } catch {
    // Storage refused (a private window): nothing was kept there.
  }
}

/** Clears everything this device holds for the signed-in account (sign-out and an expired demo sandbox). */
export async function clearDeviceData(): Promise<void> {
  // Other tabs stop syncing and reload; the exchange running here stops and is
  // awaited, and the data is cleared while no tab can sync (client-sync-robustness).
  announceSignOut()
  await stopSyncAndWait()
  await withSyncLock(() => clearLocalData())
  // Files shared to the app and not saved yet (OpenSpec attachments D9).
  await clearInbox(indexedDB).catch(() => undefined)
  forgetMemoryKeys()
  // The badge on the app icon belongs to the account (app-icon-badge).
  await clearBadge().catch(() => undefined)
  localStorage.removeItem('opentodo.user')
  // The profile's last loaded values and picture version (settings-refresh D10).
  localStorage.removeItem('opentodo.profile')
  forgetAccountStorage()
  clearOwnAvatar()
  cacheMfa(null)
  // The background noise volume is per device (focus-everywhere D6).
  forgetNoiseVolume()
}

/**
 * A different account has signed in on this device while the previous one's
 * session ended without a sign-out (an expired or revoked cookie, so its local
 * copy was left in place). Clear that copy — under the sync lock, before anything
 * new is stored or pulled — so it is neither shown to nor uploaded for the new
 * account (client-data-safety). The first sign-in on a device, and the same
 * account signing back in does nothing, so a re-auth keeps its unsynced work.
 * Data left with no recorded owner (a lost marker write) is cleared too, since it
 * cannot be shown to belong to the account signing in. Returns whether a clear
 * happened.
 */
export async function clearIfDifferentAccount(userId: string): Promise<boolean> {
  const previous = await currentUserId()
  if (previous === userId) return false
  if (previous !== null || (await hasLocalData())) {
    await clearDeviceData()
    return true
  }
  return false
}

/**
 * The server proved this device's session was revoked (revoked-device-wipe D4):
 * everything a sign-out clears goes, unsynced changes included, then the
 * sign-out request clears the cookie and the HTTP cache.
 */
export async function wipeRevokedDevice(): Promise<void> {
  await clearDeviceData()
  clearVimPref()
  await api.logout().catch(() => undefined)
}

/** The sign-out the shell calls; `refresh` re-reads the status afterwards. */
export function useSignOut(refresh: () => Promise<void>): () => Promise<void> {
  return useCallback(async () => {
    let redirect: string | undefined
    try {
      // Unsynced changes are uploaded first when online (as Settings promises),
      // for at most ten seconds; the exchange is then stopped before the clear.
      if (navigator.onLine !== false) await Promise.race([syncNow().catch(() => undefined), new Promise((r) => setTimeout(r, 10_000))])
      // Remove this device's push subscription first (the server also drops it with the session).
      await unsubscribeOnSignOut()
      redirect = (await api.logout())?.redirect
    } finally {
      await clearDeviceData()
      clearVimPref()
      // Provider sign-out (OpenSpec `oidc-login`): the local session and data are
      // gone; the provider's end-session page sends the browser back to sign-in.
      if (redirect && /^https:\/\//.test(redirect)) window.location.assign(redirect)
      else await refresh()
    }
  }, [refresh])
}
