// Undoable batches (OpenSpec change bulk-edit, design D5; first written for the
// in-app assistant, in-app-assistant D2). A batch is applied as ONE mutateMany:
// locally first, queued for sync, offline-capable. Its inverse (previous values;
// the Trash for created entities) and the clock each field got are stored, so it
// can be undone in one step, skipping fields changed again since. The device keeps
// the last 20 batches, from the assistant and from bulk actions alike.
import { db, tableOf, type AssistantUndo } from './db'
import { resettable } from './moduleState'
import { mutateMany, readField, unfoldFieldPatches, type Change } from './ops'
import { defaultReminderChanges } from './defaultReminder'
import { withSectorClears } from './sectorWrites'
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
  // Its base (a new occurrence record's undo state) is unfolded the same way, so each value's undo is its own.
  changes = unfoldFieldPatches(changes as Change[]).map((u, i) => ({ ...changes[i], patch: u.patch, ...(changes[i].base ? { base: unfoldBase(changes[i].base!) } : {}) }))
  // Dating a sectored task clears its sector here, so one Undo restores it (time-sectors D2).
  changes = await withSectorClears(changes)
  const inverse: AssistantUndo['inverse'] = []
  // A field this device cannot decrypt (OpenSpec e2ee): the change is written, but no step is kept.
  let unreadable = false
  for (const c of changes) {
    if (c.create) {
      if (!c.patch.deleted_at) inverse.push({ entity: c.entity, entityId: c.entityId, patch: { deleted_at: Date.now() }, created: true })
      continue
    }
    const local = (await tableOf(c.entity).get(c.entityId)) as (Record<string, unknown> & { _clock?: Record<string, FieldClock>; _e2ee?: { raw?: Record<string, unknown> } }) | undefined
    if (local?._e2ee?.raw && Object.keys(c.patch).some((f) => local._e2ee!.raw![f] !== undefined)) unreadable = true
    const patch: Record<string, unknown> = {}
    // The clock each field held before this batch overwrote it (#1488 D4), so a later reversal
    // refreshes only the batches this one sat directly on top of.
    const prev: Record<string, FieldClock> = {}
    for (const f of Object.keys(c.patch)) {
      patch[f] = norm((local ? readField(local, f) : undefined) ?? c.base?.[f])
      const ck = local?._clock?.[f]
      if (ck) prev[f] = ck
    }
    // A task stored before task.energy has none: its undo writes '' (none), never null, which the field refuses.
    if (c.entity === 'task' && 'energy' in patch && patch.energy === null) patch.energy = ''
    // Likewise task.sector (time-sectors): a task stored before it has none, which is ''.
    if (c.entity === 'task' && 'sector' in patch && patch.sector === null) patch.sector = ''
    inverse.push({ entity: c.entity, entityId: c.entityId, patch, ...(Object.keys(prev).length ? { prev } : {}) })
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
  if (unreadable) return null
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
  // A new recorded action clears the redo stack (undo-redo-history D3): the undone
  // batches ahead are dropped, so history stays linear — you cannot redo past a new edit.
  const redone = await db.assistantUndo.filter((e) => !!e.undone_at).primaryKeys()
  if (redone.length > 0) await db.assistantUndo.bulkDelete(redone)
  await db.assistantUndo.put(entry)
  const all = await db.assistantUndo.orderBy('created_at').reverse().primaryKeys()
  if (all.length > UNDO_KEEP) await db.assistantUndo.bulkDelete(all.slice(UNDO_KEEP))
  return entry
}

/** A base's `fields` object as one `fields.<id>` entry per value, as unfoldFieldPatches does for the patch. */
function unfoldBase(base: Record<string, unknown>): Record<string, unknown> {
  const fields = base.fields
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return base
  const { fields: _, ...rest } = base
  return { ...rest, ...Object.fromEntries(Object.entries(fields).map(([id, v]) => [`fields.${id}`, v])) }
}

type FieldClock = { ts: number; device: string }
const clockKey = (entity: string, entityId: string, field: string) => `${entity}\u0000${entityId}\u0000${field}`
const stamp = (ck: FieldClock) => `${ck.ts}\u0000${ck.device}`

/**
 * After a reversal rewrote `batch`'s fields with new clocks, point every other batch that
 * sat directly on top of what this reversal overwrote at the new clock, so the next reversal
 * of it recognises the field as ours rather than as "changed again since" (#1488, D4). The
 * test is exact: an other batch is refreshed only when its recorded clock equals this
 * reversal's pre-batch clock for the field (`actingPrev` — the clock it overwrote). A field
 * a hand edit or another device changed in between has a different clock, so the chain is
 * broken and the batch is left to skip. A batch on the undo stack expects its field through
 * `clocks` (what undo checks); one on the redo stack through `redo.clocks`. A batch whose
 * recorded clock matches neither (a foreign edit broke its chain, or it predates this fix)
 * is never refreshed and is left to skip.
 */
async function refreshUndoClocks(actingId: string, batch: Change[], canMatch: Map<string, Set<string>>): Promise<void> {
  const fresh = new Map<string, FieldClock>()
  for (const c of batch) {
    const row = (await tableOf(c.entity).get(c.entityId)) as { _clock?: Record<string, FieldClock> } | undefined
    for (const f of Object.keys(c.patch)) {
      const ck = row?._clock?.[f]
      if (ck) fresh.set(clockKey(c.entity, c.entityId, f), ck)
    }
  }
  if (fresh.size === 0) return
  for (const e of await db.assistantUndo.filter((x) => x.id !== actingId).toArray()) {
    const list = e.undone_at ? e.redo?.clocks : e.clocks
    if (!list) continue
    let changed = false
    for (const clk of list) {
      const key = clockKey(clk.entity, clk.entityId, clk.field)
      const nk = fresh.get(key)
      if (nk && canMatch.get(key)?.has(stamp(clk)) && (clk.ts !== nk.ts || clk.device !== nk.device)) {
        clk.ts = nk.ts
        clk.device = nk.device
        changed = true
      }
    }
    if (changed) await db.assistantUndo.update(e.id, e.undone_at ? { redo: e.redo } : { clocks: e.clocks })
  }
}

export interface UndoResult {
  restored: number
  /** Titles of items whose field was changed again after the batch. */
  skipped: string[]
  /** The batch this step reversed, when it reversed one. */
  id?: string
  /** What that batch did ("3 tasks completed"), when it recorded it: the feedback names it. */
  label?: string
}

/** How an undo or redo picks its batch. */
export interface StepOptions {
  /**
   * Keyboard and palette steps (#1488): `id` is the stack's top as the caller last read it
   * from a live query, which lags a fast second press. When an earlier step already reversed
   * that batch, take the top as it stands when this step runs, so the second press reverses
   * the next batch instead of nothing. The toast's own button names its exact batch and
   * leaves this off.
   */
  latest?: boolean
}

const named = (e: AssistantUndo) => ({ id: e.id, ...(e.label ? { label: e.label } : {}) })

// The undo and redo stacks (OpenSpec change undo-redo-history, #1488): the batch log read as
// two stacks. lib/undoHistory.ts follows their tops live; the steps below re-read them when
// they run, so a fast second press is not fooled by a live query that has not caught up.

/** One step of history, named for a control or the feedback ("Undo: complete 3 tasks"). */
export interface UndoStep {
  id: string
  /** What the action was ("3 tasks completed"), when the batch recorded one. */
  label?: string
  /** How many changes the batch made. */
  count: number
}

const stepOf = (e: AssistantUndo): UndoStep => ({ ...named(e), count: e.count })

/** The batch the next Undo reverses: the most recent one not yet undone, or null. */
export function topUndo(entries: readonly AssistantUndo[]): UndoStep | null {
  let top: AssistantUndo | undefined
  for (const e of entries) if (!e.undone_at && (!top || e.created_at > top.created_at)) top = e
  return top ? stepOf(top) : null
}

/** The batch the next Redo re-applies: the one undone most recently, or null. */
export function topRedo(entries: readonly AssistantUndo[]): UndoStep | null {
  let top: AssistantUndo | undefined
  for (const e of entries) {
    // A batch undone before this feature shipped has no redo payload and cannot be redone.
    if (e.undone_at == null || !e.redo) continue
    if (!top || e.undone_at > top.undone_at!) top = e
  }
  return top ? stepOf(top) : null
}

/** How many tasks an Undo would touch (the list reflows only up to a cap, motion-v2 D4). */
export async function undoTaskCount(id: string): Promise<number> {
  const entry = await db.assistantUndo.get(id)
  return new Set(entry?.inverse.filter((i) => i.entity === 'task').map((i) => i.entityId)).size
}

/** One direction to replay: the values to write and the clock each field must still hold. */
interface Reversal {
  inverse: AssistantUndo['inverse']
  clocks: AssistantUndo['clocks']
}

/** Updates `base`'s clocks from `fresh` where they name the same field; others stay. */
function mergeClocks(base: AssistantUndo['clocks'], fresh: AssistantUndo['clocks']): AssistantUndo['clocks'] {
  const by = new Map(fresh.map((c) => [clockKey(c.entity, c.entityId, c.field), c]))
  return base.map((c) => {
    const n = by.get(clockKey(c.entity, c.entityId, c.field))
    return n ? { ...c, ts: n.ts, device: n.device } : c
  })
}

/**
 * Writes one direction of a batch as one new batch (undo from the batch's own
 * `inverse`/`clocks`, redo from its stored `redo`): a field whose clock is no longer the
 * recorded one is kept and named as skipped, the rest are written locally first so it
 * works offline. Returns what it restored, the skipped titles, and the opposite direction
 * (the values it overwrote and the clock each field got) to store for the next reversal.
 * A created entity's undo trashes it; redoing that write restores it, as a plain write.
 */
async function reverse(entry: AssistantUndo, src: Reversal): Promise<{ restored: number; skipped: string[]; back: NonNullable<AssistantUndo['redo']> }> {
  const batch: Change[] = []
  const back: NonNullable<AssistantUndo['redo']>['inverse'] = []
  const skipped: string[] = []
  let followUps = 0
  // The clocks a field may still hold for another batch to be refreshed (#1488 D4): this
  // direction's own pre-batch clock (a batch it sat directly on top of) and the clock it
  // overwrites (a batch that owns the current value). A hand edit or another device's clock
  // in between matches neither, so that batch is left to skip.
  const canMatch = new Map<string, Set<string>>()
  const allow = (entity: string, entityId: string, field: string, ck?: FieldClock) => {
    if (!ck) return
    const k = clockKey(entity, entityId, field)
    let set = canMatch.get(k)
    if (!set) { set = new Set(); canMatch.set(k, set) }
    set.add(stamp(ck))
  }
  for (const inv of src.inverse) if (inv.prev) for (const [f, ck] of Object.entries(inv.prev)) allow(inv.entity, inv.entityId, f, ck)
  for (const c of src.clocks) allow(c.entity, c.entityId, c.field, c)
  for (const inv of src.inverse) {
    const row = (await tableOf(inv.entity as Entity).get(inv.entityId)) as (Record<string, unknown> & { _clock?: Record<string, { ts: number; device: string }> }) | undefined
    const patch: Record<string, unknown> = {}
    const now: Record<string, unknown> = {}
    let skippedHere = false
    if (inv.created) {
      // Created by the batch: undo moves it to the Trash (restorable); redoing that write
      // restores it. A default reminder also loses its offset (default-reminders D4).
      if (row && !row.deleted_at) {
        Object.assign(patch, inv.patch, { deleted_at: Date.now() })
        for (const f of Object.keys(patch)) now[f] = norm(readField(row, f))
      }
    } else {
      for (const [f, v] of Object.entries(inv.patch)) {
        const applied = src.clocks.find((c) => c.entityId === inv.entityId && c.entity === inv.entity && c.field === f)
        const ck = row?._clock?.[f]
        if (!row || !applied || !ck || ck.ts !== applied.ts || ck.device !== applied.device) {
          skippedHere = true
          continue
        }
        now[f] = norm(readField(row, f))
        patch[f] = v
      }
    }
    if (skippedHere && inv.entity !== 'review' && !inv.followUp) skipped.push(String(row?.title ?? row?.name ?? `a ${inv.entity}`))
    if (Object.keys(patch).length) {
      batch.push({ entity: inv.entity as Entity, entityId: inv.entityId, patch })
      back.push({ entity: inv.entity, entityId: inv.entityId, patch: now, ...(inv.followUp ? { followUp: true } : {}) })
    }
    if (inv.followUp && Object.keys(patch).length) followUps++
  }
  const assistant = (entry.source ?? 'assistant') === 'assistant'
  const clocks: AssistantUndo['clocks'] = []
  // A reversal puts back earlier values: no default reminder (default-reminders D6).
  if (batch.length) {
    await mutateMany(batch, assistant ? { origin: 'assistant', restore: true } : { restore: true })
    const fresh = new Map<string, FieldClock>()
    for (const c of batch) {
      const r = (await tableOf(c.entity).get(c.entityId)) as { _clock?: Record<string, FieldClock> } | undefined
      for (const f of Object.keys(c.patch)) {
        const ck = r?._clock?.[f]
        if (ck) { clocks.push({ entity: c.entity, entityId: c.entityId, field: f, ts: ck.ts, device: ck.device }); fresh.set(clockKey(c.entity, c.entityId, f), ck) }
      }
    }
    // The opposite direction, stored for the next reversal, expects each field at the clock
    // this reversal just set: that is its pre-batch clock.
    for (const b of back) {
      const prev: Record<string, FieldClock> = {}
      for (const f of Object.keys(b.patch)) { const ck = fresh.get(clockKey(b.entity, b.entityId, f)); if (ck) prev[f] = ck }
      if (Object.keys(prev).length) b.prev = prev
    }
    // D4 (#1488): this reversal rewrote these fields with new clocks. Refresh every other
    // batch that sat directly on top of what it overwrote (its recorded clock equals this
    // reversal's pre-batch clock), so undoing our earlier change is still recognised as ours;
    // a hand edit or another device's change in between broke the chain and is left to skip.
    await refreshUndoClocks(entry.id, batch, canMatch)
  }
  // The review row in a Close/Reopen the day batch is bookkeeping, not an item the person changed.
  return { restored: batch.filter((c) => c.entity !== 'review').length - followUps, skipped, back: { inverse: back, clocks } }
}

// Undo and redo run one at a time (#1488): a rapid second press (Ctrl+Z twice) must wait
// for the first to record its result, or it reads the stale live query, reverses the same
// batch again as a no-op and overwrites the real redo payload with an empty one.
let chain: Promise<unknown> = Promise.resolve()
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn)
  chain = run.catch(() => undefined)
  return run
}
// A fresh import has nothing queued; tests start each case from that (improvement plan T1).
resettable('undo', () => {
  chain = Promise.resolve()
})

/**
 * Undoes one batch as one new batch: previous values come back, created entities go to
 * the Trash. A field changed again since (its clock is no longer the batch's) keeps the
 * newer value and is named as skipped. The forward values and their new clocks are stored
 * so the batch can be redone.
 */
export function undoBatch(id: string, opts: StepOptions = {}): Promise<UndoResult> {
  return serialize(async () => {
    let entry = await db.assistantUndo.get(id)
    if ((!entry || entry.undone_at) && opts.latest) {
      const top = topUndo(await db.assistantUndo.toArray())
      entry = top ? await db.assistantUndo.get(top.id) : undefined
    }
    if (!entry || entry.undone_at) return { restored: 0, skipped: [] }
    const r = await reverse(entry, { inverse: entry.inverse, clocks: entry.clocks })
    await db.assistantUndo.update(entry.id, { undone_at: Date.now(), redo: r.back })
    return { restored: r.restored, skipped: r.skipped, ...named(entry) }
  })
}

/**
 * Redoes an undone batch: re-applies exactly what the undo reverted, skipping a field
 * changed again since the undo. Its clocks become the batch's recorded clocks, so a later
 * undo of it is recognised as ours.
 */
export function redoBatch(id: string, opts: StepOptions = {}): Promise<UndoResult> {
  return serialize(async () => {
    let entry = await db.assistantUndo.get(id)
    if ((!entry || !entry.undone_at || !entry.redo) && opts.latest) {
      const top = topRedo(await db.assistantUndo.toArray())
      entry = top ? await db.assistantUndo.get(top.id) : undefined
    }
    if (!entry || !entry.undone_at || !entry.redo) return { restored: 0, skipped: [] }
    const r = await reverse(entry, entry.redo)
    await db.assistantUndo.update(entry.id, { undone_at: undefined, clocks: mergeClocks(entry.clocks, r.back.clocks) })
    return { restored: r.restored, skipped: r.skipped, ...named(entry) }
  })
}
