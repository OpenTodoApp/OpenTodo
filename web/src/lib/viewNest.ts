// Nest subtasks in a saved view's List layout (GitHub issue 1108): the same tree as
// Today's and Upcoming's Nest subtasks (builtin-view-options D5). Within one group, a
// match whose parent is also in the group goes under it; the top-level rows keep the
// view's order and subtasks their manual order under their parent. A match whose
// parent is not in the group stays top-level and shows its parent's path.
import type { Task } from './types'
import { buildTaskTree } from './subtasks'
import { flattenTree } from './tree'

/** How a nested row draws: its depth, whether it has subtasks in the group, folded or not. */
export interface NestedRow {
  depth: number
  hasChildren: boolean
  collapsed: boolean
}

/** A group's tasks as a tree in depth-first order, the subtasks of a folded row left out. */
export function nestGroup(tasks: readonly Task[], isCollapsed: (id: string) => boolean): { tasks: Task[]; rows: Map<string, NestedRow> } {
  const rank = new Map(tasks.map((tk, i) => [tk.id, i]))
  const roots = buildTaskTree([...tasks]).roots.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  const rows = new Map<string, NestedRow>()
  const out: Task[] = []
  for (const n of flattenTree(roots, isCollapsed)) {
    out.push(n.item)
    rows.set(n.id, { depth: n.depth, hasChildren: n.children.length > 0, collapsed: n.children.length > 0 && isCollapsed(n.id) })
  }
  return { tasks: out, rows }
}
