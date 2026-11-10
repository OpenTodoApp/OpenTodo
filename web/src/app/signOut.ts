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
import { clearLocalData } from '../lib/db'
import { forgetMemoryKeys } from '../lib/e2ee'
import { forgetNoiseVolume } from '../lib/focus/prefs'
import { clearInbox } from '../lib/shareInbox'
import { unsubscribeOnSignOut } from '../lib/push'
import { announceSignOut, stopSyncAndWait, syncNow, withSyncLock } from '../lib/sync'
import { cacheMfa } from './TwoFactorPanel'
import { clearVimPref } from './vim/prefs'

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
  clearOwnAvatar()
  cacheMfa(null)
  // The background noise volume is per device (focus-everywhere D6).
  forgetNoiseVolume()
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
