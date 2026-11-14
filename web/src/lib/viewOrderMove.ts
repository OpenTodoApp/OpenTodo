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
import { manualSequence, MAX_VIEW_ORDER, orderRank, planViewOrder, stepAnchor, type ViewPlacement, type ViewStep } from './viewOrder'
import type { Task, UserPrefs, View } from './types'
import { listDisplayOf } from './listDisplay'
import { viewOptions } from './views'
import { planMove, readTicked, toProposed } from './bulk'
import { canEditTasks, currentUserId, membershipMap, roleOf, scopeOf } from './sharing'
import { isDescendant } from './tree'
import { compareDueThenPriority, planMove as planPosition, positionAtEnd, type Placement } from './ordering'
import { keepWorkspaceFor } from './workspaces'
import type { Change } from './ops'

/** The row whose personal order the page shows. */
export interface OrderHost {
  entity: 'label' | 'view' | 'user_prefs'
  id: string
}

/** The stored values a row without the fields reads as (the op schema's defaults). */
const BASE: Record<OrderHost['entity'], Record<string, unknown>> = {
  label: { manual_order: [], sort_by: '', sort_dir: '' },
  view: { manual_order: [], sort_by: 'due', sort_dir: 'asc' },
  user_prefs: { today_manual_order: [], today_sort_by: '', today_sort_dir: '' },
}

type OrderRow = { manual_order?: string[]; today_manual_order?: UserPrefs['today_manual_order'] }

async function hostRow(host: OrderHost): Promise<OrderRow | null> {
  if (host.entity === 'user_prefs') return await db.userPrefs.get(host.id) ?? {}
  const row = host.entity === 'label' ? await db.labels.get(host.id) : await db.views.get(host.id)
  return row && !row.deleted_at ? row : null
}

function storedOrder(row: OrderRow): string[] {
  const value = row.manual_order ?? row.today_manual_order
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

/** The order patch that places `moved` next to an anchor (null when nothing changes). */
async function orderPatch(host: OrderHost, row: OrderRow, tasks: readonly Task[], moved: string, at: ViewPlacement, previousId?: string): Promise<Record<string, unknown> | null> {
  const today = host.entity === 'user_prefs'
  const shown = today ? listDisplayOf('today', row) : host.entity === 'label' ? listDisplayOf('label', row) : viewOptions(row as View)
  const manual = shown.sortBy === 'position' && shown.sortDir === 'asc'
  const stored = storedOrder(row).map((id) => today && id === previousId ? moved : id)
  const visible = today && previousId && previousId !== moved ? tasks.map((task) => task.id === previousId ? { ...task, id: moved } : task) : tasks
  const seq = today && !manual ? [...new Set(visible.map((task) => task.id))] : manualSequence(visible, orderRank(stored), today ? compareDueThenPriority : undefined)
  const anchor = 'before' in at ? at.before : at.after
  if (today && (anchor === moved || !seq.includes(moved) || !seq.includes(anchor))) return null
  // Ids the page does not show now: an open task keeps its place; a deleted, completed or unknown one is dropped.
  const onPage = new Set(seq)
  const hidden = stored.filter((id) => !onPage.has(id))
  const rows = hidden.length ? await db.tasks.bulkGet(hidden) : []
  const alive = new Set(rows.filter((x): x is Task => !!x && !x.deleted_at && !x.completed_at).map((x) => x.id))
  // The first manual move keeps the displayed order of every other visible row.
  const seed = today && !manual ? [...seq, ...hidden.filter((id) => alive.has(id))] : stored
  let next = planViewOrder(seq, seed, moved, at, (id) => alive.has(id))
  if (today && !next) {
    if (!manual || (previousId && previousId !== moved && stored.includes(moved))) next = seed.slice(0, MAX_VIEW_ORDER)
    else if (previousId && !stored.includes(moved)) {
      // The drop already agrees with the fallback sequence. Pin it anyway, since
      // the structural move can change the task's position tie-breaker.
      const throughMoved = seq.slice(0, seq.indexOf(moved) + 1)
      const placed = new Set(throughMoved)
      next = [...throughMoved, ...stored.filter((id) => !placed.has(id) && (onPage.has(id) || alive.has(id)))].slice(0, MAX_VIEW_ORDER)
    }
  }
  if (!next && manual) return null
  const patch: Record<string, unknown> = {}
  if (next) patch[today ? 'today_manual_order' : 'manual_order'] = next
  if (!manual) Object.assign(patch, today ? { today_sort_by: 'position', today_sort_dir: 'asc' } : { sort_by: 'position', sort_dir: 'asc' })
  return patch
}

/**
 * Move `moved` next to an anchor in the page's manual order. `tasks` are the tasks
 * the page shows. The page switches to Manual order ascending in the same batch
 * (design D5), so one Undo restores both. Null when nothing changes.
 */
export async function moveInViewOrder(host: OrderHost, tasks: readonly Task[], moved: string, at: ViewPlacement): Promise<UndoableResult | null> {
  const row = await hostRow(host)
  if (!row || (host.entity === 'user_prefs' && listDisplayOf('today', row).groupBy !== 'project')) return null
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
  /** The position among the new parent's subtasks. Absent: append. */
  siblingAt?: Placement
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
export async function dropInViewGroup(host: OrderHost, tasks: readonly Task[], moved: string, drop: GroupDrop, now = Date.now()): Promise<(UndoableResult & { id: string }) | null> {
  const row = await hostRow(host)
  if (!row || (host.entity === 'user_prefs' && listDisplayOf('today', row).groupBy !== 'project')) return null
  const { tasks: picked, all } = await readTicked([moved])
  const task = picked[0]
  if (!task || task.completed_at) return null
  const memberships = await membershipMap()
  const from = task.project_id ?? null
  const to = drop.projectId
  if (host.entity === 'user_prefs' && to) {
    const project = await db.projects.get(to)
    if (!project || project.deleted_at || project.archived) return null
  }
  if (host.entity === 'user_prefs' && drop.at) {
    const anchorId = 'before' in drop.at ? drop.at.before : drop.at.after
    const anchor = all.find((task) => task.id === anchorId)
    if (!anchor || anchor.completed_at || (anchor.project_id ?? null) !== to) return null
  }
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
  let positions: Change[] = []
  if (parent !== null) {
    const siblings = all.filter((x) => (x.project_id ?? null) === to && x.parent_id === parent)
    const planned = planPosition(siblings, id, drop.siblingAt ?? 'bottom', { fallback: now })
    if (!planned) return null
    for (const { id: sibling, position } of planned) {
      if (sibling === id) patch.position = position
      else positions.push({ entity: 'task', entityId: sibling, patch: { position } })
    }
  } else if (patch.parent_id !== undefined || from !== to) {
    // A top-level move takes the last project position and uses the view order for its visible place.
    const siblings = all.filter((x) => x.id !== moved && (x.project_id ?? null) === to && !x.parent_id)
    patch.position = positionAtEnd(siblings, moved, now)
  }
  const taskChanges: Change[] = [...changes.filter((c) => c.entityId !== id), ...positions]
  if (Object.keys(patch).length) taskChanges.push({ entity: 'task', entityId: id, patch })
  // A subtask keeps its place under its parent; a top-level row takes the drop's place in the view's order.
  let order = parent === null && drop.at ? await orderPatch(host, row, tasks, id, drop.at, moved) : null
  if (host.entity === 'user_prefs' && !drop.at && id !== moved) {
    const stored = storedOrder(row)
    if (stored.includes(moved)) order = { today_manual_order: stored.map((key) => key === moved ? id : key) }
  }
  if (!taskChanges.length && !order) return null
  await getDeviceId()
  const label = from !== to ? t('Moved to {target}', { target: drop.projectName }) : t('Order changed')
  const proposed = await toProposed(taskChanges, memberships)
  const batch = order ? [...proposed, { entity: host.entity, entityId: host.id, patch: order, base: BASE[host.entity] }] : proposed
  const entry = await applyBatch(batch, { source: 'action', label })
  return { entry, label, id }
}

/**
 * A keyboard step within the task's group (design D4): `group` are the tasks of the
 * group its row is in. Null at the group's edge (nothing is written, as in a project).
 */
export async function stepInViewOrder(host: OrderHost, tasks: readonly Task[], group: readonly Task[], id: string, step: ViewStep): Promise<UndoableResult | null> {
  const row = await hostRow(host)
  if (!row) return null
  const at = stepAnchor(host.entity === 'user_prefs' ? group.map((task) => task.id) : manualSequence(group, orderRank(storedOrder(row))), id, step)
  return at ? moveInViewOrder(host, tasks, id, at) : null
}
