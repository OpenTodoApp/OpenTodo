// Server limits (OpenSpec `multi-tenant-host`, design D5): a hosted server may
// refuse single operations because it reached a limit (storage, changes per
// hour, stored changes). Unlike a refusal on the merits, the device keeps its
// change: the op is held here, the row stays as edited and unsynced, the rest
// of the outbox keeps syncing, and held ops are sent again later.
import { db, getMeta, setMeta } from './db'
import type { Op, Rejection } from './types'

const HELD_KEY = 'heldOps'
/** How often held ops are offered to the server again. */
export const HELD_RETRY_MS = 60_000

/** Whether a refusal reason names a server limit rather than a verdict on the change. */
export function isLimitReason(reason: string): boolean {
  return reason.startsWith('limit_')
}

/** The sentence the sync status shows for a limit. */
export function limitMessage(reason: string): string {
  switch (reason) {
    case 'limit_storage':
      return 'This server is full. Your latest changes stay on this device until there is room: empty the Trash or ask your provider for more space.'
    case 'limit_ops_hour':
      return 'This server reached its limit of changes per hour. Your latest changes stay on this device and upload later.'
    case 'limit_ops_total':
      return 'This server reached its limit of stored changes. Your latest changes stay on this device; ask your provider for a larger plan.'
  }
  return 'This server reached a limit. Your latest changes stay on this device and upload later.'
}

/** Splits a response's refusals into limit refusals and the rest. */
export function splitRejected(rejected: Rejection[]): { limited: Rejection[]; refused: Rejection[] } {
  const limited: Rejection[] = []
  const refused: Rejection[] = []
  for (const r of rejected) (isLimitReason(r.reason) ? limited : refused).push(r)
  return { limited, refused }
}

/** Keeps the sent ops a limit refused; returns how many are held now. */
export async function holdOps(sent: Op[], limited: Rejection[]): Promise<number> {
  const ids = new Set(limited.map((r) => r.id))
  const held = await getMeta<Op[]>(HELD_KEY, [])
  const known = new Set(held.map((o) => o.id))
  for (const op of sent) if (ids.has(op.id) && !known.has(op.id)) held.push(op)
  await setMeta(HELD_KEY, held)
  return held.length
}

export async function heldCount(): Promise<number> {
  return (await getMeta<Op[]>(HELD_KEY, [])).length
}

/** Moves the held ops back into the outbox (their original clocks), to be sent again. */
export async function requeueHeld(): Promise<number> {
  const held = await getMeta<Op[]>(HELD_KEY, [])
  if (held.length === 0) return 0
  await db.transaction('rw', db.outbox, db.meta, async () => {
    await db.outbox.bulkAdd(held)
    await setMeta(HELD_KEY, [])
  })
  return held.length
}
