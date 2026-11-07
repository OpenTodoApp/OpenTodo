// The sidebar's counts over the open tasks (OpenSpec change incremental-list-updates D2):
// Inbox, Today, Assigned to me and each project's own open tasks, worked out in one pass,
// and after a write from the rows it changed. The same numbers as the Inbox and Today
// lists and the app badge (inbox-means-unplaced, app-icon-badge).
import { assignedToSomeoneElse, type TodayAssigneeFilter } from './dayLists'
import { isInboxTask, isPlaced, type InboxParentOf } from './inbox'
import type { TaskChange } from './taskDelta'
import type { Task } from './types'
import { inToday, openCount } from './views'

export interface SidebarCounts {
  /** The open tasks in the Inbox. */
  inbox: ReadonlySet<string>
  today: number
  assigned: number
  /** Open, active tasks of each project (deferred and parked ones are not counted). */
  own: ReadonlyMap<string, number>
}

/** What the counts read beyond each task: its parents and whether it has subtasks (the Inbox walks parents). */
export interface CountLookups {
  parentOf: InboxParentOf
  hasChildren: (id: string) => boolean
}

/** The counts over the open tasks of `live` (every visible task: the Inbox walks parents that are done too). */
export function sidebarCounts(live: readonly Task[], today: string, hide: TodayAssigneeFilter | null, userId: string, look: CountLookups): SidebarCounts {
  const inbox = new Set<string>()
  let todayN = 0
  let assigned = 0
  const own = new Map<string, number>()
  for (const task of live) {
    if (task.completed_at) continue
    if (isInboxTask(task, look.parentOf)) inbox.add(task.id)
    if (inToday(task, today) && !assignedToSomeoneElse(task, hide)) todayN++
    if (!openCount(task, today)) continue
    if (task.assignee_id === userId) assigned++
    if (task.project_id) own.set(task.project_id, (own.get(task.project_id) ?? 0) + 1)
  }
  return { inbox, today: todayN, assigned, own }
}

/**
 * sidebarCounts after `changes` to the visible tasks: plus and minus per changed open row.
 * Null (worked out in full) when a task with subtasks, open or done, changed its placement
 * or parent, or came or went: its subtasks may enter or leave the Inbox.
 */
export function patchSidebarCounts(prev: SidebarCounts, changes: readonly TaskChange[], _live: readonly Task[], today: string, hide: TodayAssigneeFilter | null, userId: string, look: CountLookups): SidebarCounts | null {
  const inbox = new Set(prev.inbox)
  let todayN = prev.today
  let assigned = prev.assigned
  const own = new Map(prev.own)
  const count = (task: Task | undefined, n: number) => {
    if (!task || task.completed_at) return
    if (inToday(task, today) && !assignedToSomeoneElse(task, hide)) todayN += n
    if (!openCount(task, today)) return
    if (task.assignee_id === userId) assigned += n
    if (task.project_id) {
      const v = (own.get(task.project_id) ?? 0) + n
      if (v > 0) own.set(task.project_id, v)
      else own.delete(task.project_id)
    }
  }
  for (const c of changes) {
    const a = c.before
    const b = c.after
    const same = a && b && isPlaced(a) === isPlaced(b) && (a.parent_id ?? null) === (b.parent_id ?? null)
    if (!same && look.hasChildren(c.id)) return null
    count(a, -1)
    count(b, 1)
    inbox.delete(c.id)
    if (b && isInboxTask(b, look.parentOf)) inbox.add(c.id)
  }
  return { inbox, today: todayN, assigned, own }
}

/** Open tasks of each label (the sidebar and the Labels page), tasks of archived projects left out. */
export function labelCounts(open: readonly Task[], archived: ReadonlySet<string>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const task of open) {
    if (task.deleted_at || task.completed_at || (task.project_id && archived.has(task.project_id))) continue
    for (const id of new Set(task.labels)) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

/** labelCounts after `changes`: plus and minus per changed row. */
export function patchLabelCounts(prev: Map<string, number>, changes: readonly TaskChange[], _open: readonly Task[], archived: ReadonlySet<string>): Map<string, number> {
  const next = new Map(prev)
  const count = (task: Task | undefined, n: number) => {
    if (!task || task.deleted_at || task.completed_at || (task.project_id && archived.has(task.project_id))) return
    for (const id of new Set(task.labels)) {
      const v = (next.get(id) ?? 0) + n
      if (v > 0) next.set(id, v)
      else next.delete(id)
    }
  }
  for (const c of changes) { count(c.before, -1); count(c.after, 1) }
  return next
}
