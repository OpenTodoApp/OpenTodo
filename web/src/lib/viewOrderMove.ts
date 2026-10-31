// Writing a label page's or saved view's own manual order (OpenSpec change
// view-manual-order, design D2, D5, D6): one undoable batch on the label or the
// view, applied locally first, so a move works offline, converges as one
// last-writer-wins value and can be undone. No task row is written.
import { db } from './db'
import { getDeviceId } from './ops'
import { t } from './i18n'
import { applyBatch } from './undo'
import type { UndoableResult } from './undoActions'
import { manualSequence, orderRank, planViewOrder, stepAnchor, type ViewPlacement, type ViewStep } from './viewOrder'
import type { Label, Task, View } from './types'
import { listDisplayOf } from './listDisplay'
import { viewOptions } from './views'

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

/**
 * Move `moved` next to an anchor in the page's manual order. `tasks` are the tasks
 * the page shows. The page switches to Manual order ascending in the same batch
 * (design D5), so one Undo restores both. Null when nothing changes.
 */
export async function moveInViewOrder(host: OrderHost, tasks: readonly Task[], moved: string, at: ViewPlacement): Promise<UndoableResult | null> {
  const row = await hostRow(host)
  if (!row) return null
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
  await getDeviceId()
  const label = t('Order changed')
  const entry = await applyBatch([{ entity: host.entity, entityId: host.id, patch, base: BASE[host.entity] }], { source: 'action', label })
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
