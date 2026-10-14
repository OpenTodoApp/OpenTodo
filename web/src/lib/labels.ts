// Labels: a cross-project vocabulary. Tasks reference labels by id in their
// `labels` array, so rename and recolour are one op each and never touch tasks.
// The array itself is a whole-value LWW register (see docs/sync.md, "Task labels"),
// which is why every write here reads the current array in the same transaction.
import { db } from './db'
import { getDeviceId, mutate, mutationTables } from './ops'
import type { Label, Task } from './types'

// The canonical hexes of the design-system palette (src/ui/tokens/palette.ts). The
// original nine keep their order so older clients and stored colours stay valid;
// lime, cyan and indigo were appended by design-language.
export const LABEL_PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#84cc16', '#06b6d4', '#6366f1']

/** Thrown by createLabel when a non-deleted label with the same name (ignoring case) exists. */
export class LabelExistsError extends Error {
  constructor(public existing: Label) {
    super(`A label named "${existing.name}" already exists`)
  }
}

export function labelKey(name: string): string {
  return name.trim().toLocaleLowerCase()
}

/** Non-deleted labels in sidebar order. */
export function activeLabels(labels: Label[]): Label[] {
  return labels.filter((l) => !l.deleted_at).sort((a, b) => a.position - b.position || a.created_at - b.created_at)
}

export async function findLabelByName(name: string): Promise<Label | undefined> {
  const key = labelKey(name)
  if (!key) return undefined
  return db.labels.filter((l) => !l.deleted_at && labelKey(l.name) === key).first()
}

/** Create a label; names are unique per device ignoring case. Returns the new id. */
export async function createLabel(input: { name: string; color?: string }): Promise<string> {
  const name = input.name.trim()
  if (!name) throw new Error('Label name must not be empty')
  const existing = await findLabelByName(name)
  if (existing) throw new LabelExistsError(existing)
  const id = crypto.randomUUID()
  const now = Date.now()
  const used = new Set((await db.labels.filter((l) => !l.deleted_at).toArray()).map((l) => l.color))
  const color = input.color ?? LABEL_PALETTE.find((c) => !used.has(c)) ?? LABEL_PALETTE[now % LABEL_PALETTE.length]
  await mutate('label', id, { name, color, position: now, created_at: now, deleted_at: null })
  return id
}

/** Rename or recolour: one op per changed field, no task is written. */
export async function updateLabel(id: string, patch: Partial<Pick<Label, 'name' | 'color' | 'position'>>): Promise<void> {
  if (patch.name !== undefined) {
    patch = { ...patch, name: patch.name.trim() }
    if (!patch.name) throw new Error('Label name must not be empty')
    const other = await findLabelByName(patch.name)
    if (other && other.id !== id) throw new LabelExistsError(other)
  }
  await mutate('label', id, patch)
}

/** Move a label one step up (-1) or down (+1) in the sidebar by swapping positions. */
export async function reorderLabel(id: string, delta: -1 | 1): Promise<void> {
  const list = activeLabels(await db.labels.toArray())
  const i = list.findIndex((l) => l.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return
  const a = list[i], b = list[j]
  // Equal positions (e.g. two labels created in the same millisecond) would not swap.
  const pa = a.position === b.position ? b.position + delta : b.position
  const pb = a.position === b.position ? a.position : a.position
  await mutate('label', a.id, { position: pa })
  await mutate('label', b.id, { position: pb })
}

/**
 * Rewrite one task's label array from its current value, inside a single transaction
 * with the write, so sequential edits on this device never lose a label.
 */
async function rewriteTaskLabels(taskId: string, fn: (current: string[]) => string[]): Promise<boolean> {
  await getDeviceId()
  return db.transaction('rw', mutationTables(), async () => {
    const t = await db.tasks.get(taskId)
    if (!t || t.deleted_at) return false
    const next = fn(t.labels)
    if (next.length === t.labels.length && next.every((v, i) => v === t.labels[i])) return false
    await mutate('task', taskId, { labels: next })
    return true
  })
}

export function addLabel(taskId: string, labelId: string): Promise<boolean> {
  return rewriteTaskLabels(taskId, (cur) => (cur.includes(labelId) ? cur : [...cur, labelId]))
}

export function removeLabel(taskId: string, labelId: string): Promise<boolean> {
  return rewriteTaskLabels(taskId, (cur) => cur.filter((id) => id !== labelId))
}

export async function toggleLabel(taskId: string, labelId: string): Promise<void> {
  const t = await db.tasks.get(taskId)
  if (!t) return
  await (t.labels.includes(labelId) ? removeLabel(taskId, labelId) : addLabel(taskId, labelId))
}

async function tasksCarrying(labelId: string): Promise<Task[]> {
  return db.tasks.filter((t) => !t.deleted_at && t.labels.includes(labelId)).toArray()
}

/** Tombstone the label and drop its id from every non-deleted task, one op per task. */
export async function deleteLabel(id: string): Promise<void> {
  for (const t of await tasksCarrying(id)) await removeLabel(t.id, id)
  await mutate('label', id, { deleted_at: Date.now() })
}

/** Rewrite every carrier of `sourceId` to carry `targetId` (de-duplicated), then delete the source. */
export async function mergeLabels(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) return
  for (const t of await tasksCarrying(sourceId)) {
    await rewriteTaskLabels(t.id, (cur) => {
      const out: string[] = []
      for (const id of cur) {
        const v = id === sourceId ? targetId : id
        if (!out.includes(v)) out.push(v)
      }
      return out
    })
  }
  await mutate('label', sourceId, { deleted_at: Date.now() })
}

// ---- display helpers (pure) ----

/** Resolve ids to labels, hiding unknown (not yet received) and deleted ones. Order follows the array. */
export function resolveLabels(ids: string[], byId: Map<string, Label>): Label[] {
  const out: Label[] = []
  for (const id of ids) {
    const l = byId.get(id)
    if (l && !l.deleted_at) out.push(l)
  }
  return out
}

/** Ids of non-deleted labels whose name (ignoring case) is shared with another one. */
export function duplicateLabelIds(labels: Label[]): Set<string> {
  const byKey = new Map<string, string[]>()
  for (const l of labels) {
    if (l.deleted_at) continue
    const k = labelKey(l.name)
    byKey.set(k, [...(byKey.get(k) ?? []), l.id])
  }
  const out = new Set<string>()
  for (const ids of byKey.values()) if (ids.length > 1) ids.forEach((id) => out.add(id))
  return out
}

/** Open-task count per label id over the given (already filtered) open tasks. */
export function countOpenByLabel(openTasks: Task[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const t of openTasks) {
    if (t.deleted_at || t.completed_at) continue
    for (const id of new Set(t.labels)) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}
