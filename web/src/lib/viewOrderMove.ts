// Writing a label page's or saved view's own manual order (OpenSpec change
// view-manual-order, design D2, D5, D6): one undoable batch on the label or the
// view, applied locally first, so a move works offline, converges as one
// last-writer-wins value and can be undone. A plain reorder writes no task row;
// a drop across project groups or onto a task (view-project-drops) moves the
// task in the same batch. Today and Upcoming share the user's day order
// (day-manual-order D1); a line in another day or part writes the date or the
// part in the same batch (D2).
import { db } from './db'
import { getDeviceId } from './ops'
import { t } from './i18n'
import { applyBatch } from './undo'
import type { UndoableResult } from './undoActions'
import { boundOrder, manualSequence, orderRank, planViewOrder, stepAnchor, type ViewPlacement, type ViewStep } from './viewOrder'
import type { Task, UserPrefs, View } from './types'
import { listDisplayOf } from './listDisplay'
import { inToday, isSomeday, overdueInToday, viewOptions } from './views'
import { planDue, planMove, readTicked, toProposed } from './bulk'
import { logicalToday } from './dates'
import { canEditTasks, currentUserId, membershipMap, roleOf, scopeOf } from './sharing'
import { isDescendant } from './tree'
import { compareDueThenPriority, planMove as planPosition, positionAtEnd, type Placement } from './ordering'
import { keepWorkspaceFor } from './workspaces'
import type { Change } from './ops'
import { compareDueWithParts } from './dayLists'
import { dayPartFields, dayPartName, dayPartOf, dayPartsOn, type DayPart } from './dayParts'
import { dayDropPatch } from './dayDrop'
import { refusedSeries, seriesDateRefusal } from './seriesDates'

/** The row whose personal order the page shows; the day order's page names the sort a first move switches. */
export interface OrderHost {
  entity: 'label' | 'view' | 'user_prefs'
  id: string
  /** user_prefs: Today (default) or Upcoming, which share the day order (day-manual-order D1). */
  page?: 'today' | 'upcoming'
}

type DayPage = NonNullable<OrderHost['page']>

/** The sort fields of the day order's page. */
const sortFields = (page: DayPage) => ({ by: `${page}_sort_by`, dir: `${page}_sort_dir` })

/** The stored values a row without the fields reads as (the op schema's defaults). */
function baseOf(host: OrderHost): Record<string, unknown> {
  if (host.entity === 'label') return { manual_order: [], sort_by: '', sort_dir: '' }
  if (host.entity === 'view') return { manual_order: [], sort_by: 'due', sort_dir: 'asc' }
  const f = sortFields(host.page ?? 'today')
  return { today_manual_order: [], [f.by]: '', [f.dir]: '' }
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
  const page = host.page ?? 'today'
  const shown = today ? listDisplayOf(page, row) : host.entity === 'label' ? listDisplayOf('label', row) : viewOptions(row as View)
  const manual = shown.sortBy === 'position' && shown.sortDir === 'asc'
  const stored = storedOrder(row).map((id) => today && id === previousId ? moved : id)
  const visible = today && previousId && previousId !== moved ? tasks.map((task) => task.id === previousId ? { ...task, id: moved } : task) : tasks
  // The day order's unplaced tasks follow Due date, by part while day parts are on (day-manual-order D4).
  const unplaced = dayPartsOn(row as Partial<UserPrefs>) ? compareDueWithParts() : compareDueThenPriority
  const seq = today && !manual ? [...new Set(visible.map((task) => task.id))] : today ? manualSequence(visible, orderRank(stored), unplaced) : manualSequence(visible, orderRank(stored))
  const anchor = 'before' in at ? at.before : at.after
  if (today && (anchor === moved || !seq.includes(moved) || !seq.includes(anchor))) return null
  // Ids the page does not show now: an open task keeps its place; a deleted, completed or unknown one is dropped.
  const onPage = new Set(seq)
  const hidden = stored.filter((id) => !onPage.has(id))
  const rows = hidden.length ? await db.tasks.bulkGet(hidden) : []
  const alive = new Set(rows.filter((x): x is Task => !!x && !x.deleted_at && !x.completed_at).map((x) => x.id))
  // The first manual move seeds the shown order only through the moved task and its
  // anchor; the rows below read as unplaced, and every placement already stored stays.
  const explicit = new Set(stored)
  const keep = (id: string) => onPage.has(id) || alive.has(id)
  const through = Math.max(seq.indexOf(moved), seq.indexOf(anchor)) + 1
  const prefix = seq.slice(0, through)
  const seeded = new Set(prefix)
  const seed = today && !manual ? [...prefix, ...stored.filter((id) => !seeded.has(id) && keep(id))] : stored
  const planned = today && !manual ? manualSequence(visible, orderRank(seed), unplaced) : seq
  let next = planViewOrder(planned, seed, moved, at, (id) => alive.has(id), explicit)
  if (today && !next) {
    if (!manual || (previousId && previousId !== moved && stored.includes(moved))) next = boundOrder(seed, [moved, anchor], explicit, new Set(hidden))
    else if (previousId && !stored.includes(moved)) {
      // The drop already agrees with the fallback sequence. Pin it anyway, since
      // the structural move can change the task's position tie-breaker.
      const throughMoved = seq.slice(0, seq.indexOf(moved) + 1)
      const placed = new Set(throughMoved)
      next = boundOrder([...throughMoved, ...stored.filter((id) => !placed.has(id) && keep(id))], [moved, anchor], explicit, new Set(hidden))
    }
  }
  if (!next && manual) return null
  const patch: Record<string, unknown> = {}
  if (next) patch[today ? 'today_manual_order' : 'manual_order'] = next
  if (!manual) Object.assign(patch, today ? { [sortFields(page).by]: 'position', [sortFields(page).dir]: 'asc' } : { sort_by: 'position', sort_dir: 'asc' })
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
  const entry = await applyBatch([{ entity: host.entity, entityId: host.id, patch, base: baseOf(host) }], { source: 'action', label })
  return { entry, label }
}

/** A line in another group of Today or Upcoming (day-manual-order D2): the place, and the date or part it writes. */
export interface DayDrop {
  kind: 'day'
  at: ViewPlacement
  /** Upcoming: the line's day, when it is not the task's. */
  date?: string
  /** The line's part of the day, when it is not the task's (null: none). */
  part?: DayPart | null
}

const movedToPart = (part: DayPart | null) => (part ? t('Moved to {part}', { part: dayPartName(part) }) : t('Moved to Any time'))

/**
 * Place `moved` at a line of Today or Upcoming and give it the line's day or part, in one
 * batch with one Undo (day-manual-order D2): the date as a drop on that day writes it
 * (time, zone and span kept), the part as `dayPartFields` (any due time kept). The order
 * is personal, so a viewer may place a task; the date and the part need the right to edit
 * it. A series' date already taken by one of its records is refused, as in a day drop.
 * Null when nothing changes or the drop is refused.
 */
export async function dropInDay(host: OrderHost, tasks: readonly Task[], moved: string, drop: DayDrop, today = logicalToday()): Promise<UndoableResult | null> {
  const row = await hostRow(host)
  if (!row || host.entity !== 'user_prefs') return null
  const { tasks: picked, all } = await readTicked([moved])
  const task = picked[0]
  if (!task || task.completed_at) return null
  const patch: Record<string, unknown> = {}
  let label = t('Order changed')
  if (drop.part !== undefined) {
    const fields = dayPartFields(drop.part)
    if (dayPartOf(task) !== drop.part || (task.day_part ?? null) !== fields.day_part) {
      Object.assign(patch, fields)
      label = movedToPart(drop.part)
    }
  }
  const dated = drop.date ? dayDropPatch(task, drop.date, today) : null
  if (dated) {
    Object.assign(patch, dated)
    label = t('Date changed')
  }
  const memberships = await membershipMap()
  const writes = Object.keys(patch).length > 0
  if (writes && !canEditTasks(roleOf(task.project_id ?? null, memberships))) return null
  const taskChanges: Change[] = writes ? [{ entity: 'task', entityId: moved, patch }] : []
  if (dated && !refusedSeries(taskChanges, all).changes.length) {
    return { entry: null, label: await seriesDateRefusal(moved, dated.due) ?? t('Lists sorted by date or priority keep their order.') }
  }
  // A task that changes group is pinned at the line even where the sequence already agrees.
  const order = await orderPatch(host, row, tasks, moved, drop.at, writes ? moved : undefined)
  if (!order && !writes) return null
  await getDeviceId()
  const proposed = writes ? await toProposed(taskChanges, memberships) : []
  const batch = order ? [...proposed, { entity: host.entity, entityId: host.id, patch: order, base: baseOf(host) }] : proposed
  const entry = await applyBatch(batch, { source: 'action', label })
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
  /** The contextual row's current parent. Omitting a new parent explicitly promotes it for today. */
  contextParent?: string
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
  const contextDay = drop.contextParent ? logicalToday(undefined, now) : null
  if (contextDay) {
    if (host.entity !== 'user_prefs' || !listDisplayOf('today', row).subtasks || task.parent_id !== drop.contextParent ||
      isSomeday(task) || inToday(task, contextDay) || drop.at || drop.siblingAt) return null
    const previousParent = all.find((x) => x.id === drop.contextParent)
    if (!previousParent || !inToday(previousParent, contextDay) || overdueInToday(previousParent, contextDay)) return null
  }
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
    if (contextDay && (!inToday(parent, contextDay) || overdueInToday(parent, contextDay))) return null
  }
  let changes: Change[] = []
  let id = moved
  if (from !== to) {
    changes = planMove([task], all, { projectId: to, sectionId: null }, memberships, await currentUserId(), now, await keepWorkspaceFor())
    if (!changes.length) return null
    // Across sharing scopes the task becomes a copy (as every project move): place the copy.
    id = changes.find((c) => c.entity === 'task' && c.patch.title !== undefined && !c.patch.deleted_at && c.entityId !== moved)?.entityId ?? moved
  }
  const own = changes.find((c) => c.entityId === id)
  const patch: Record<string, unknown> = { ...(own?.patch ?? {}) }
  const parent = drop.parentId ?? null
  if (contextDay && parent === null) Object.assign(patch, planDue([task], 'today', contextDay)[0].patch)
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
  const label = contextDay && parent === null ? t('Scheduled for today')
    : from !== to ? t('Moved to {target}', { target: drop.projectName }) : t('Order changed')
  const proposed = await toProposed(taskChanges, memberships)
  const batch = order ? [...proposed, { entity: host.entity, entityId: host.id, patch: order, base: baseOf(host) }] : proposed
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
