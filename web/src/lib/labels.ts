// Labels: a cross-project vocabulary. Tasks reference labels by id in their
// `labels` array, so rename and recolour are one op each and never touch tasks.
// The array itself is a whole-value LWW register (see docs/sync.md, "Task labels"),
// which is why every write here reads the current array in the same transaction.
import { db } from './db'
import { getDeviceId, mutate, mutateMany, mutationTables } from './ops'
import { compareByPosition, planMove, planStep, type Placement, type PositionChange } from './ordering'
import type { Label, Task } from './types'
import { HUES } from '../ui/tokens/palette'
import { t } from './i18n'
import { uuid } from './ids'
import { ownIn, readWorkspaceState, workspaceFields } from './workspaces'

// The canonical hexes of the design-system palette (src/ui/tokens/palette.ts). The
// original nine keep their order so older clients and stored colours stay valid;
// lime, cyan and indigo were appended by design-language.
// LABEL_PALETTE is an alias of the palette's canonical solid hexes (labels-and-menus 4.3).
export const LABEL_PALETTE: readonly string[] = HUES.map((h) => h.hex)

/** Thrown by createLabel when a non-deleted label with the same name (ignoring case) exists. */
export class LabelExistsError extends Error {
  constructor(public existing: Label) {
    super(t('A label named "{name}" already exists', { name: existing.name }))
  }
}

export function labelKey(name: string): string {
  return name.trim().toLocaleLowerCase()
}

/** Non-deleted labels in sidebar order: the shared order rule (position, then id), total on every device. */
export function activeLabels(labels: Label[]): Label[] {
  return labels.filter((l) => !l.deleted_at).sort(compareByPosition)
}

export async function findLabelByName(name: string): Promise<Label | undefined> {
  const key = labelKey(name)
  if (!key) return undefined
  // Names are unique within a workspace (OpenSpec change workspaces, design D7).
  const here = ownIn(await readWorkspaceState(), await db.labels.filter((l) => !l.deleted_at && labelKey(l.name) === key).toArray())
  return here[0]
}

/** Create a label; names are unique per device ignoring case. Returns the new id. */
export async function createLabel(input: { name: string; color?: string }): Promise<string> {
  const name = input.name.trim()
  if (!name) throw new Error(t('Label name must not be empty'))
  const existing = await findLabelByName(name)
  if (existing) throw new LabelExistsError(existing)
  const id = uuid()
  const now = Date.now()
  const used = new Set((await db.labels.filter((l) => !l.deleted_at).toArray()).map((l) => l.color))
  const color = input.color ?? LABEL_PALETTE.find((c) => !used.has(c)) ?? LABEL_PALETTE[now % LABEL_PALETTE.length]
  await mutate('label', id, { name, color, position: now, created_at: now, deleted_at: null, ...(await workspaceFields()) })
  return id
}

/** Rename or recolour: one op per changed field, no task is written. */
export async function updateLabel(id: string, patch: Partial<Pick<Label, 'name' | 'color' | 'position'>>): Promise<void> {
  if (patch.name !== undefined) {
    patch = { ...patch, name: patch.name.trim() }
    if (!patch.name) throw new Error(t('Label name must not be empty'))
    const other = await findLabelByName(patch.name)
    if (other && other.id !== id) throw new LabelExistsError(other)
  }
  await mutate('label', id, patch)
}

async function writePositions(plan: PositionChange[] | null): Promise<void> {
  if (!plan || plan.length === 0) return
  await mutateMany(plan.map((c) => ({ entity: 'label' as const, entityId: c.id, patch: { position: c.position } })))
}

/**
 * Move a label one step up (-1) or down (+1), or to the top or bottom, on the shared
 * ordering helpers (labels-and-menus D4): an ordinary step is one op; neighbours are
 * renumbered only when their positions leave no gap.
 */
export async function reorderLabel(id: string, step: -1 | 1 | 'top' | 'bottom'): Promise<void> {
  await writePositions(planStep(activeLabels(await db.labels.toArray()), id, step))
}

/** Put a label at a placement (drag and drop: { before | after: id }), in one batch. */
export async function moveLabelTo(id: string, placement: Placement): Promise<void> {
  await writePositions(planMove(activeLabels(await db.labels.toArray()), id, placement))
}

/** Non-deleted tasks carrying the label: the same set deleteLabel and mergeLabels rewrite. */
export async function labelUsage(id: string): Promise<number> {
  return (await tasksCarrying(id)).length
}

/**
 * Rewrite one task's label array from its current value, inside a single transaction
 * with the write, so sequential edits on this device never lose a label.
 */
async function rewriteTaskLabels(taskId: string, fn: (current: string[]) => string[]): Promise<boolean> {
  await getDeviceId()
  return db.transaction('rw', mutationTables(), async () => {
    const task = await db.tasks.get(taskId)
    if (!task || task.deleted_at) return false
    const next = fn(task.labels)
    if (next.length === task.labels.length && next.every((v, i) => v === task.labels[i])) return false
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
  const task = await db.tasks.get(taskId)
  if (!task) return
  await (task.labels.includes(labelId) ? removeLabel(taskId, labelId) : addLabel(taskId, labelId))
}

async function tasksCarrying(labelId: string): Promise<Task[]> {
  return db.tasks.filter((task) => !task.deleted_at && task.labels.includes(labelId)).toArray()
}

/** Tombstone the label and drop its id from every non-deleted task, one op per task. */
export async function deleteLabel(id: string): Promise<void> {
  for (const task of await tasksCarrying(id)) await removeLabel(task.id, id)
  await mutate('label', id, { deleted_at: Date.now() })
}

/** Rewrite every carrier of `sourceId` to carry `targetId` (de-duplicated), then delete the source. */
export async function mergeLabels(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) return
  for (const task of await tasksCarrying(sourceId)) {
    await rewriteTaskLabels(task.id, (cur) => {
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
  for (const task of openTasks) {
    if (task.deleted_at || task.completed_at) continue
    for (const id of new Set(task.labels)) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}
