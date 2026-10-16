// Web restore helpers (OpenSpec backup-restore-web): error copy, waiting for the
// server to come back after its restart, and the note on the sign-in screen.
import { ApiError } from './api'
import { t, msg } from './i18n'

/** What a failed restore step means, in the owner's words. */
export function restoreErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return t('The server is unreachable. Restoring needs a connection.')
  switch (err.code) {
    case 'passphrase_required': return t('This archive is encrypted. Enter the passphrase it was made with.')
    case 'passphrase_invalid': return t('That passphrase does not open this archive.')
    case 'newer_schema': return t('This archive comes from a newer version of OpenTodo. Update this server first. ({detail})', { detail: err.serverMessage })
    case 'integrity': return t('This is not a usable OpenTodo backup: {detail}', { detail: err.serverMessage })
    case 'insufficient_storage': return t('Not enough free disk space on the server: {detail}', { detail: err.serverMessage })
    case 'not_found': return t('This restore is no longer prepared. Choose the archive again.')
    case 'conflict': return t('A backup is running. Try again when it has finished.')
    case 'destination_error': return t('The backup destination could not be reached: {detail}', { detail: err.serverMessage })
    case 'rate_limited': return t('Too many attempts. Wait a minute and try again.')
    case 'reauth_required': return t('Confirm your identity to restore.')
    case 'proxy_too_large': return err.message
    default: return err.message
  }
}

/** The passphrase field appears for these answers to prepare. */
export function needsPassphrase(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'passphrase_required' || err.code === 'passphrase_invalid')
}

const RESTORED_KEY = 'opentodo.restored'

/** Remembered across the reload, so a signed-out owner learns why. */
export function markRestoring(): void {
  try { sessionStorage.setItem(RESTORED_KEY, '1') } catch { /* private mode */ }
}

/** True once after a restore in this tab; clears the flag. */
export function consumeRestored(): boolean {
  try {
    const v = sessionStorage.getItem(RESTORED_KEY)
    sessionStorage.removeItem(RESTORED_KEY)
    return v === '1'
  } catch {
    return false
  }
}

export const RESTORED_NOTICE = msg('This server was restored from a backup. Sign in again; sessions started after the backup ended.')

export interface WaitOptions {
  intervalMs?: number
  budgetMs?: number
  fetchFn?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

/**
 * Polls /healthz until the server answers again after its restart. It first
 * waits for the server to go away (or the first interval to pass), so a
 * request answered by the old process does not count. Resolves false after
 * the budget.
 */
export async function waitForRestart({ intervalMs = 1000, budgetMs = 60_000, fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now }: WaitOptions = {}): Promise<boolean> {
  const start = now()
  let wentAway = false
  while (now() - start < budgetMs) {
    await sleep(intervalMs)
    try {
      const res = await fetchFn('/healthz', { cache: 'no-store' })
      if (res.ok && (wentAway || now() - start >= 2 * intervalMs)) return true
      if (!res.ok) wentAway = true
    } catch {
      wentAway = true
    }
  }
  return false
}
