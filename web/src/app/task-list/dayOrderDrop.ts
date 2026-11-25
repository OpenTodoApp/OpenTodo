// The drop line in Today's and Upcoming's day order (OpenSpec change day-manual-order,
// design D2): a drag over a row of a group that carries a `daySlot` places the task
// before or after that row's top-level task; a line in another day or part also writes
// that day or part. Loaded with the first drag, with the move writer (bundle budget).
import { placedPart, dayPartName, type DayPart } from '../../lib/dayParts'
import { t } from '../../lib/i18n'
import { dayOrderMovable as movable, type ListGroup } from '../../lib/listGroups'
import type { Task } from '../../lib/types'
import type { DayDrop, OrderHost } from '../../lib/viewOrderMove'
import { zoneUnder, type DropAt } from '../listDrop'
import { offerUndo } from '../viewOrderActions'
import { withListTransition } from '../motion'
import { showBulkToast } from '../bulk/toastStore'

/** The task's part as the day order reads it: its placed part with day parts on, else This Evening or none. */
function partOf(task: Task, parts: boolean): DayPart | null {
  return parts ? placedPart(task) : task.evening ? 'evening' : null
}

/** The row under the pointer: Upcoming's day groups answer as `drop:day:<date>`, so the row is read from the point. */
function rowIdAt(target: string, x: number, y: number): string | null {
  if (target.startsWith('task:')) return target.slice('task:'.length)
  if (!target.startsWith('drop:day:')) return null
  const el = document.elementFromPoint?.(x, y)?.closest('[data-task-id]')
  return el?.getAttribute('data-task-id') ?? null
}

export interface DayOrderContext {
  groups: readonly ListGroup[]
  /** Day parts are on. */
  parts: boolean
  /** The user may change the task's date or part (an editor of its project). */
  canEdit: (task: Task) => boolean
}

/**
 * Where a drag over `target` lands in the day order: the line, its note when it writes a
 * day or part, and the drop. Null over a row outside the day order's groups, over the task
 * itself, between the rows of another priority or label group, for a timed task over the
 * group of tasks with no part (its time would place it elsewhere) and for a date or part
 * the user may not change.
 */
export function dayOrderDrop(c: DayOrderContext, task: Task, target: string | null, x: number, y: number): { indicator: DropAt; drop: DayDrop } | null {
  if (!target || task.completed_at) return null
  const rowId = rowIdAt(target, x, y)
  if (!rowId) return null
  const origin = c.groups.find((g) => g.daySlot && g.rows.some((r) => r.task.id === task.id && movable(r)))
  const group = c.groups.find((g) => g.daySlot && g.rows.some((r) => r.task.id === rowId))
  if (!origin?.daySlot || !group?.daySlot) return null
  const rows = group.rows
  const i = rows.findIndex((r) => r.task.id === rowId)
  // A subtask row stands for its top-level task: the line goes after the whole subtree.
  let root = i
  while (root > 0 && rows[root].depth > 0) root--
  let end = root
  while (end + 1 < rows.length && rows[end + 1].depth > 0) end++
  const anchor = rows[root]
  if (!movable(anchor) || anchor.task.id === task.id || anchor.task.completed_at) return null
  const zone = i === root ? zoneUnder('data-task-id', rowId, y, false) : 'after'
  if (zone !== 'before' && zone !== 'after') return null
  const from = origin.daySlot
  const to = group.daySlot
  if (group !== origin && to.date === undefined && to.part === undefined) return null
  const drop: DayDrop = { kind: 'day', at: zone === 'before' ? { before: anchor.task.id } : { after: anchor.task.id } }
  if (to.date !== undefined && to.date !== from.date) drop.date = to.date
  const part = to.part !== undefined ? to.part : to.byPart ? placedPart(anchor.task) : undefined
  if (part !== undefined && part !== partOf(task, c.parts)) drop.part = part
  if (drop.part === null && c.parts && task.due?.time) return null
  if ((drop.date !== undefined || drop.part !== undefined) && !c.canEdit(task)) return null
  const id = zone === 'before' ? anchor.task.id : rows[end].task.id
  const name = drop.date !== undefined
    ? [group.heading, drop.part !== undefined ? dayPartName(drop.part) : null].filter(Boolean).join(' · ')
    : drop.part !== undefined ? dayPartName(drop.part) : ''
  return { indicator: { id, zone, ...(name ? { note: t('Move to {name}', { name }) } : {}) }, drop }
}

/** Apply a drop line: the place, and the day or part it writes, with Undo. The dropped task's id, or undefined. */
export async function applyDayOrderDrop(host: OrderHost, tasks: readonly Task[], id: string, drop: DayDrop): Promise<string | undefined> {
  const { dropInDay } = await import('../../lib/viewOrderMove')
  const result = await withListTransition(1, () => dropInDay(host, tasks, id, drop))
  if (offerUndo(result)) return id
  // A refusal (a series' date already taken) says why.
  if (result && !result.entry && result.label) showBulkToast(result.label, null)
  return undefined
}
