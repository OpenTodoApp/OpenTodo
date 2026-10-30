// Undoable batches (OpenSpec change bulk-edit, design D5; first written for the
// in-app assistant, in-app-assistant D2). A batch is applied as ONE mutateMany:
// locally first, queued for sync, offline-capable. Its inverse (previous values;
// the Trash for created entities) and the clock each field got are stored, so it
// can be undone in one step, skipping fields changed again since. The device keeps
// the last 20 batches, from the assistant and from bulk actions alike.
import { db, tableOf, type AssistantUndo } from './db'
import { mutateMany, readField, unfoldFieldPatches, type Change } from './ops'
import { defaultReminderChanges } from './defaultReminder'
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
  // Default reminders join the batch here, so one Undo removes them with the dates
  // (default-reminders D3); mutateMany then finds them in the batch and adds none.
  const switched: ProposedChange[] = []
  for (const d of await defaultReminderChanges(batch)) {
    batch.push(d)
    const local = (await tableOf('reminder').get(d.entityId)) as Record<string, unknown> | undefined
    if (!local || local.deleted_at) {
      inverse.push({ entity: 'reminder', entityId: d.entityId, patch: { deleted_at: Date.now(), offset_minutes: null }, created: true, followUp: true })
    } else {
      inverse.push({ entity: 'reminder', entityId: d.entityId, patch: Object.fromEntries(Object.keys(d.patch).map((f) => [f, norm(readField(local, f))])), followUp: true })
      switched.push({ entity: 'reminder', entityId: d.entityId, patch: d.patch })
    }
  }
  await mutateMany(batch, opts.origin ? { origin: opts.origin } : undefined)
  const clocks: AssistantUndo['clocks'] = []
  for (const c of [...changes, ...switched]) {
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

/** How many tasks an Undo would touch (the list reflows only up to a cap, motion-v2 D4). */
export async function undoTaskCount(id: string): Promise<number> {
  const entry = await db.assistantUndo.get(id)
  return new Set(entry?.inverse.filter((i) => i.entity === 'task').map((i) => i.entityId)).size
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
  let followUps = 0
  for (const inv of entry.inverse) {
    const row = (await tableOf(inv.entity as Entity).get(inv.entityId)) as (Record<string, unknown> & { _clock?: Record<string, { ts: number; device: string }> }) | undefined
    const patch: Record<string, unknown> = {}
    let skippedHere = false
    if (inv.created) {
      // Created by the batch: undo moves it to the Trash (restorable). A default
      // reminder also loses its offset, so a later due date may add it again (default-reminders D4).
      if (row && !row.deleted_at) Object.assign(patch, inv.patch, { deleted_at: Date.now() })
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
    if (skippedHere && inv.entity !== 'review' && !inv.followUp) skipped.push(String(row?.title ?? row?.name ?? `a ${inv.entity}`))
    if (Object.keys(patch).length) batch.push({ entity: inv.entity as Entity, entityId: inv.entityId, patch })
    if (inv.followUp && Object.keys(patch).length) followUps++
  }
  const assistant = (entry.source ?? 'assistant') === 'assistant'
  // Undo puts back earlier values: no default reminder (default-reminders D6).
  if (batch.length) await mutateMany(batch, assistant ? { origin: 'assistant', restore: true } : { restore: true })
  await db.assistantUndo.update(id, { undone_at: Date.now() })
  // The review row in a Close/Reopen the day batch is bookkeeping, not an item the person changed.
  return { restored: batch.filter((c) => c.entity !== 'review').length - followUps, skipped }
}
