// Undoable batches (OpenSpec change bulk-edit, design D5; first written for the
// in-app assistant, in-app-assistant D2). A batch is applied as ONE mutateMany:
// locally first, queued for sync, offline-capable. Its inverse (previous values;
// the Trash for created entities) and the clock each field got are stored, so it
// can be undone in one step, skipping fields changed again since. The device keeps
// the last 20 batches, from the assistant and from bulk actions alike.
import { db, tableOf, type AssistantUndo } from './db'
import { mutateMany, readField, unfoldFieldPatches, type Change } from './ops'
import type { ProposedChange } from './assistantTypes'
import type { Entity } from './types'
import { uuid } from './ids'

export const UNDO_KEEP = 20

const norm = (v: unknown) => (v === undefined ? null : v)

export interface BatchOptions {
  source: 'assistant' | 'bulk' | 'action'
  /** What the undo toast says ("3 tasks completed"). */
  label?: string
  /** `assistant` writes with device assistant:<device-id>. */
  origin?: 'assistant'
}

/** Applies changes as one batch and stores its inverse. Returns the undo entry, or null for nothing. */
export async function applyBatch(changes: ProposedChange[], opts: BatchOptions): Promise<AssistantUndo | null> {
  if (changes.length === 0) return null
  // A `fields` map becomes one `fields.<id>` entry per value, each with its own clock (custom-fields).
  changes = unfoldFieldPatches(changes as Change[]).map((u, i) => ({ ...changes[i], patch: u.patch }))
  const inverse: AssistantUndo['inverse'] = []
  for (const c of changes) {
    if (c.create) {
      if (!c.patch.deleted_at) inverse.push({ entity: c.entity, entityId: c.entityId, patch: { deleted_at: Date.now() }, created: true })
      continue
    }
    const local = (await tableOf(c.entity).get(c.entityId)) as Record<string, unknown> | undefined
    const patch: Record<string, unknown> = {}
    for (const f of Object.keys(c.patch)) patch[f] = norm((local ? readField(local, f) : undefined) ?? c.base?.[f])
    inverse.push({ entity: c.entity, entityId: c.entityId, patch })
  }
  const batch: Change[] = changes.map((c) => ({ entity: c.entity, entityId: c.entityId, patch: { ...c.patch } }))
  await mutateMany(batch, opts.origin ? { origin: opts.origin } : undefined)
  const clocks: AssistantUndo['clocks'] = []
  for (const c of changes) {
    if (c.create) continue
    const row = (await tableOf(c.entity).get(c.entityId)) as { _clock?: Record<string, { ts: number; device: string }> } | undefined
    for (const f of Object.keys(c.patch)) {
      const ck = row?._clock?.[f]
      if (ck) clocks.push({ entity: c.entity, entityId: c.entityId, field: f, ts: ck.ts, device: ck.device })
    }
  }
  const entry: AssistantUndo = { id: uuid(), created_at: Date.now(), count: changes.length, inverse, clocks, source: opts.source, ...(opts.label ? { label: opts.label } : {}) }
  await db.assistantUndo.put(entry)
  const all = await db.assistantUndo.orderBy('created_at').reverse().primaryKeys()
  if (all.length > UNDO_KEEP) await db.assistantUndo.bulkDelete(all.slice(UNDO_KEEP))
  return entry
}

export interface UndoResult {
  restored: number
  /** Titles of items whose field was changed again after the batch. */
  skipped: string[]
}

/**
 * Undoes one batch as one new batch: previous values come back, created entities
 * go to the Trash. A field changed again since (its clock is no longer the batch's)
 * keeps the newer value and is named as skipped.
 */
export async function undoBatch(id: string): Promise<UndoResult> {
  const entry = await db.assistantUndo.get(id)
  if (!entry || entry.undone_at) return { restored: 0, skipped: [] }
  const batch: Change[] = []
  const skipped: string[] = []
  for (const inv of entry.inverse) {
    const row = (await tableOf(inv.entity as Entity).get(inv.entityId)) as (Record<string, unknown> & { _clock?: Record<string, { ts: number; device: string }> }) | undefined
    const patch: Record<string, unknown> = {}
    let skippedHere = false
    if (inv.created) {
      // Created by the batch: undo moves it to the Trash (restorable).
      if (row && !row.deleted_at) patch.deleted_at = Date.now()
    } else {
      for (const [f, v] of Object.entries(inv.patch)) {
        const applied = entry.clocks.find((c) => c.entityId === inv.entityId && c.entity === inv.entity && c.field === f)
        const now = row?._clock?.[f]
        if (!row || !applied || !now || now.ts !== applied.ts || now.device !== applied.device) {
          skippedHere = true
          continue
        }
        patch[f] = v
      }
    }
    if (skippedHere && inv.entity !== 'review') skipped.push(String(row?.title ?? row?.name ?? `a ${inv.entity}`))
    if (Object.keys(patch).length) batch.push({ entity: inv.entity as Entity, entityId: inv.entityId, patch })
  }
  const assistant = (entry.source ?? 'assistant') === 'assistant'
  if (batch.length) await mutateMany(batch, assistant ? { origin: 'assistant' } : undefined)
  await db.assistantUndo.update(id, { undone_at: Date.now() })
  // The review row in a Close/Reopen the day batch is bookkeeping, not an item the person changed.
  return { restored: batch.filter((c) => c.entity !== 'review').length, skipped }
}
