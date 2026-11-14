// Writing a label page's or saved view's own manual order (OpenSpec change
// view-manual-order, design D2, D5, D6): one undoable batch on the label or the
// view, applied locally first, so a move works offline, converges as one
// last-writer-wins value and can be undone. A plain reorder writes no task row;
// a drop across project groups or onto a task (view-project-drops) moves the
// task in the same batch.
import { db } from './db'
import { getDeviceId } from './ops'
import { t } from './i18n'
import { applyBatch } from './undo'
import type { UndoableResult } from './undoActions'
import { manualSequence, orderRank, planViewOrder, stepAnchor, type ViewPlacement, type ViewStep } from './viewOrder'
import type { Label, Task, View } from './types'
import { listDisplayOf } from './listDisplay'
import { viewOptions } from './views'
import { planMove, readTicked, toProposed } from './bulk'
import { canEditTasks, currentUserId, membershipMap, roleOf, scopeOf } from './sharing'
import { isDescendant } from './tree'
import { positionAtEnd } from './ordering'
import { keepWorkspaceFor } from './workspaces'
import type { Change } from './ops'

/** The label or saved view whose order a page shows. */
export interface OrderHost {
  entity: 'label' | 'view'
  id: string
}

/** The stored values a row without the fields reads as (the op schema's defaults). */
const BASE: Record<OrderHost['entity'], Record<string, unknown>> = {
  label: { manual_order: [], sort_by: '', sort_dir: '' },
  view: { manual_order: [], sort_by: 'due', sort_dir: 'asc' },
}

async function hostRow(host: OrderHost): Promise<Label | View | null> {
  const row = host.entity === 'label' ? await db.labels.get(host.id) : await db.views.get(host.id)
  return row && !row.deleted_at ? row : null
}

function storedOrder(row: Label | View): string[] {
  return Array.isArray(row.manual_order) ? row.manual_order.filter((id): id is string => typeof id === 'string') : []
}

/** The order patch that places `moved` next to an anchor (null when nothing changes). */
async function orderPatch(host: OrderHost, row: Label | View, tasks: readonly Task[], moved: string, at: ViewPlacement): Promise<Record<string, unknown> | null> {
  const stored = storedOrder(row)
  const seq = manualSequence(tasks, orderRank(stored))
  // Ids the page does not show now: an open task keeps its place; a deleted, completed or unknown one is dropped.
  const onPage = new Set(seq)
  const hidden = stored.filter((id) => !onPage.has(id))
  const rows = hidden.length ? await db.tasks.bulkGet(hidden) : []
  const alive = new Set(rows.filter((x): x is Task => !!x && !x.deleted_at && !x.completed_at).map((x) => x.id))
  const next = planViewOrder(seq, stored, moved, at, (id) => alive.has(id))
  const shown = host.entity === 'label' ? listDisplayOf('label', row as Label) : viewOptions(row as View)
  const manual = shown.sortBy === 'position' && shown.sortDir === 'asc'
  if (!next && manual) return null
  const patch: Record<string, unknown> = {}
  if (next) patch.manual_order = next
  if (!manual) Object.assign(patch, { sort_by: 'position', sort_dir: 'asc' })
  return patch
}

/**
 * Move `moved` next to an anchor in the page's manual order. `tasks` are the tasks
 * the page shows. The page switches to Manual order ascending in the same batch
 * (design D5), so one Undo restores both. Null when nothing changes.
 */
export async function moveInViewOrder(host: OrderHost, tasks: readonly Task[], moved: string, at: ViewPlacement): Promise<UndoableResult | null> {
  const row = await hostRow(host)
  if (!row) return null
  const patch = await orderPatch(host, row, tasks, moved, at)
  if (!patch) return null
  await getDeviceId()
  const label = t('Order changed')
  const entry = await applyBatch([{ entity: host.entity, entityId: host.id, patch, base: BASE[host.entity] }], { source: 'action', label })
  return { entry, label }
}

/** Where a drop in a view grouped by project lands (view-project-drops D2, D3). */
export interface GroupDrop {
  /** The project of the group the row was dropped in (null: the Inbox). */
  projectId: string | null
  /** Its name, for the toast. */
  projectName: string
  /** Onto a task with Nest subtasks on: the new parent. Absent: a top-level place. */
  parentId?: string
  /** Before or after a top-level row, in the view's own order. */
  at?: ViewPlacement
}

/**
 * A drop across project groups, onto a task, or of a subtask out to the top level
 * (OpenSpec change view-project-drops): the task (with its subtasks) moves to the
 * target project without a section, or under the target parent, and takes its place
 * in the view's order, all in one undoable batch. Null when refused or a no-op:
 * a project the person may not edit, a parent that is the task or one of its
 * subtasks, a parent across sharing scopes, or nothing to change.
 */
export async function dropInViewGroup(host: OrderHost, tasks: readonly Task[], moved: string, drop: GroupDrop, now = Date.now()): Promise<UndoableResult | null> {
  const row = await hostRow(host)
  if (!row) return null
  const { tasks: picked, all } = await readTicked([moved])
  const task = picked[0]
  if (!task || task.completed_at) return null
  const memberships = await membershipMap()
  const from = task.project_id ?? null
  const to = drop.projectId
  if (!canEditTasks(roleOf(from, memberships)) || !canEditTasks(roleOf(to, memberships))) return null
  const cross = scopeOf(from, memberships) !== scopeOf(to, memberships)
  if (drop.parentId !== undefined) {
    const parent = all.find((x) => x.id === drop.parentId)
    if (!parent || parent.completed_at || (parent.project_id ?? null) !== to || parent.id === moved || isDescendant(parent.id, moved, all) || cross) return null
  }
  let changes: Change[] = []
  let id = moved
  if (from !== to) {
    changes = planMove([task], all, { projectId: to, sectionId: null }, memberships, await currentUserId(), now, await keepWorkspaceFor())
    // Across sharing scopes the task becomes a copy (as every project move): place the copy.
    id = changes.find((c) => c.entity === 'task' && c.patch.title !== undefined && !c.patch.deleted_at && c.entityId !== moved)?.entityId ?? moved
  }
  const own = changes.find((c) => c.entityId === id)
  const patch: Record<string, unknown> = { ...(own?.patch ?? {}) }
  const parent = drop.parentId ?? null
  if ((task.parent_id ?? null) !== parent || (own && own.patch.parent_id === null && parent !== null)) patch.parent_id = parent
  if (parent === null && task.section_id && from === to) patch.section_id = null
  // It lands last among its new siblings: the parent's subtasks, or the project's top-level tasks.
  if (patch.parent_id !== undefined || from !== to) {
    const siblings = all.filter((x) => x.id !== moved && !x.deleted_at && (x.project_id ?? null) === to && (x.parent_id ?? null) === parent)
    patch.position = positionAtEnd(siblings, moved, now)
  }
  const taskChanges: Change[] = [...changes.filter((c) => c.entityId !== id), ...(Object.keys(patch).length ? [{ entity: 'task' as const, entityId: id, patch }] : [])]
  // A subtask keeps its place under its parent; a top-level row takes the drop's place in the view's order.
  const order = parent === null && drop.at ? await orderPatch(host, row, tasks, id, drop.at) : null
  if (!taskChanges.length && !order) return null
  await getDeviceId()
  const label = from !== to ? t('Moved to {target}', { target: drop.projectName }) : t('Order changed')
  const proposed = await toProposed(taskChanges, memberships)
  const batch = order ? [...proposed, { entity: host.entity, entityId: host.id, patch: order, base: BASE[host.entity] }] : proposed
  const entry = await applyBatch(batch, { source: 'action', label })
  return { entry, label }
}

/**
 * A keyboard step within the task's group (design D4): `group` are the tasks of the
 * group its row is in. Null at the group's edge (nothing is written, as in a project).
 */
export async function stepInViewOrder(host: OrderHost, tasks: readonly Task[], group: readonly Task[], id: string, step: ViewStep): Promise<UndoableResult | null> {
  const row = await hostRow(host)
  if (!row) return null
  const at = stepAnchor(manualSequence(group, orderRank(storedOrder(row))), id, step)
  return at ? moveInViewOrder(host, tasks, id, at) : null
}
