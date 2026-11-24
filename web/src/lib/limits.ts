// Server limits (OpenSpec `multi-tenant-host`, design D5): a hosted server may
// refuse single operations because it reached a limit (storage, changes per
// hour, stored changes). Unlike a refusal on the merits, the device keeps its
// change: the op is held here, the row stays as edited and unsynced, the rest
// of the outbox keeps syncing, and held ops are sent again later.
import { db, getMeta, setMeta, tableOf } from './db'
import { wins } from './hlc'
import { t } from './i18n/catalog'
import { ENTITIES, type Clock, type Entity, type Op, type Rejection } from './types'

const HELD_KEY = 'heldOps'
/** How often held ops are offered to the server again. */
export const HELD_RETRY_MS = 60_000

/** Whether a refusal reason names a server limit rather than a verdict on the change. */
export function isLimitReason(reason: string): boolean {
  return reason.startsWith('limit_')
}

/**
 * An op for a field this server does not know (a newer client's field): not a verdict
 * on the change, so the device keeps it, held like a limited one, and offers it again,
 * since a later server may accept it (invalid-op-ends D2). An `invalid` refusal is a
 * verdict and ends like any refused change (sharing.ts forgetRejected).
 */
export const UNKNOWN_FIELD_REASON = 'unknown_field'

/** Whether a refusal keeps the change on this device, held and offered again later. */
export function isHeldReason(reason: string): boolean {
  return isLimitReason(reason) || reason === UNKNOWN_FIELD_REASON
}

/** The sentence the sync status shows for a limit. */
export function limitMessage(reason: string): string {
  switch (reason) {
    case UNKNOWN_FIELD_REASON:
      return t('This server could not accept a change from this device. It stays on this device, and everything else keeps syncing.')
    case 'limit_storage':
      return t('This server is full. Your latest changes stay on this device until there is room: empty the Trash or ask your provider for more space.')
    case 'limit_ops_hour':
      return t('This server reached its limit of changes per hour. Your latest changes stay on this device and upload later.')
    case 'limit_ops_total':
      return t('This server reached its limit of stored changes. Your latest changes stay on this device; ask your provider for a larger plan.')
  }
  return t('This server reached a limit. Your latest changes stay on this device and upload later.')
}

/** Splits a response's refusals into the ones that hold the change (limits, unknown fields) and the rest. */
export function splitRejected(rejected: Rejection[]): { limited: Rejection[]; refused: Rejection[] } {
  const limited: Rejection[] = []
  const refused: Rejection[] = []
  for (const r of rejected) (isHeldReason(r.reason) ? limited : refused).push(r)
  return { limited, refused }
}

/**
 * Keeps the sent ops a limit refused; returns how many are held now. The read
 * and the write of the held list are one transaction, so a requeue running at
 * the same time (another call, another tab) cannot lose ops (client-sync-robustness).
 */
export async function holdOps(sent: Op[], limited: Rejection[]): Promise<number> {
  const ids = new Set(limited.map((r) => r.id))
  return db.transaction('rw', db.meta, async () => {
    const held = await getMeta<Op[]>(HELD_KEY, [])
    const known = new Set(held.map((o) => o.id))
    for (const op of sent) if (ids.has(op.id) && !known.has(op.id)) held.push(op)
    await setMeta(HELD_KEY, held)
    return held.length
  })
}

export async function heldCount(): Promise<number> {
  return (await getMeta<Op[]>(HELD_KEY, [])).length
}

/**
 * Moves the held ops back into the outbox (their original clocks), to be sent again.
 * A held op whose field was written again since, on this device or another (a
 * newer clock on the row), is dropped instead (#1532). One whose row is in the
 * Trash stays held until the row is restored. Returns how many were queued again.
 */
export async function requeueHeld(): Promise<number> {
  // Most syncs hold nothing: they open no transaction, and one with held ops
  // locks only the tables of its rows. An op held after this read is offered at
  // the next retry.
  const before = await getMeta<Op[]>(HELD_KEY, [])
  if (before.length === 0) return 0
  const tables = [...new Set(before.map((o) => o.entity).filter(isEntity))].map(tableOf)
  return db.transaction('rw', [db.outbox, db.meta, ...tables], async () => {
    // Read again inside the transaction: ops held between the read above and
    // the clear below would otherwise be dropped without ever being sent.
    const held = await getMeta<Op[]>(HELD_KEY, [])
    if (held.length === 0) return 0
    const live: Op[] = []
    const kept: Op[] = []
    const locked = new Set(before.map((o) => o.entity))
    for (const op of held) {
      const fate = await fateOf(op, locked)
      if (fate === 'send') live.push(op)
      else if (fate === 'keep') kept.push(op)
    }
    if (live.length) await db.outbox.bulkAdd(live)
    await setMeta(HELD_KEY, kept)
    return live.length
  })
}

function isEntity(e: string): e is Entity {
  return (ENTITIES as readonly string[]).includes(e)
}

/**
 * What happens to a held op now: offered again, dropped because a newer write of its
 * field wins, or kept held while its row is in the Trash, so a restore does not lose it.
 */
async function fateOf(op: Op, tables: ReadonlySet<string>): Promise<'send' | 'drop' | 'keep'> {
  // An op held after the first read may name a table outside the transaction: it goes again.
  if (!isEntity(op.entity) || !tables.has(op.entity)) return 'send'
  const row = await tableOf(op.entity).get(op.entityId)
  if (!row) return 'send'
  const c = ((row._clock ?? {}) as Clock)[op.field]
  if (c && wins(c.ts, c.device, op)) return 'drop'
  if (op.field !== 'deleted_at' && row.deleted_at != null) return 'keep'
  return 'send'
}
