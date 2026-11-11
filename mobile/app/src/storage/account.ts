// One database per account and server (design D4), like the web app's per browser
// profile: a file named after both, opened at sign-in and deleted at sign-out, so the
// next account on the phone starts clean and two servers never share rows.
import { clearLocalData, db, useDatabase as openDatabaseNamed } from '@shared/db'
import type { SqliteDatabase } from './adapter'

/** FNV-1a, 32 bits: a short stable name, not a secret (the file stays on the device). */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** The database name of an account on a server (its origin, so a path or a slash does not matter). */
export function accountDatabaseName(server: string, userId: string): string {
  const origin = new URL(server).origin.toLowerCase()
  return `opentodo-${hash(`${origin}\n${userId}`)}`
}

/** Makes the account's database the one the shared modules use. */
export function openAccount(server: string, userId: string): void {
  openDatabaseNamed(accountDatabaseName(server, userId))
}

/** Sign-out: every table emptied (as on the web), then the file deleted. */
export async function forgetAccount(): Promise<void> {
  await clearLocalData()
  await (db as unknown as SqliteDatabase).delete()
}
