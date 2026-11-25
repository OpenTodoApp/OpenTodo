import { t } from '../../lib/i18n'
import { isTodayProjectGroup, type ListGroup, type ListRow } from '../../lib/listGroups'
import { canEditTasks, roleOf, scopeOf } from '../../lib/sharing'
import type { Membership, Task } from '../../lib/types'
import { ancestors } from '../../lib/tree'
import { dropZone, type DropAt } from '../listDrop'
import type { ActionItem } from '../menus/ActionMenu'
import { gapRow } from './dropDepth'
import { projectGroupPlacement, type DragDepth } from './projectGroupPlacement'
import type { GroupDrop, OrderHost } from '../../lib/viewOrderMove'
import { offerUndo, reorderInView } from '../viewOrderActions'
import { withListTransition } from '../motion'

export async function applyTodayDrop(host: OrderHost, roots: readonly Task[], groups: readonly ListGroup[], id: string, drop: GroupDrop) {
  const source = groups.flatMap((g) => g.rows).find((r) => r.task.id === id)
  if (!source || !!source.contextual !== !!drop.contextParent || (source.contextual && source.parent !== drop.contextParent)) return undefined
  if (drop.contextParent && !groups.some((g) => isTodayProjectGroup(g) && (g.project ?? null) === drop.projectId &&
    (!drop.parentId || g.rows.some((r) => r.task.id === drop.parentId && !r.contextual)))) return undefined
  if (drop.at && source.task.project_id === drop.projectId && source.depth === 0)
    return await reorderInView(host, roots, id, drop.at) ? id : undefined
  const { dropInViewGroup } = await import('../../lib/viewOrderMove')
  const tasks = source.depth > 0 ? [...roots, source.task] : roots
  const result = await withListTransition(1, () => dropInViewGroup(host, tasks, id, drop))
  if (offerUndo(result)) return result?.id
}

const PROMOTE_TARGET = 'today-context-promote:'

function intoGroup(group: ListGroup): GroupDrop {
  return { projectId: group.project ?? null, projectName: group.heading ?? t('Inbox') }
}

function contextualParent(source: Task, parent: ListRow, group: ListGroup, members: Map<string, Membership>, taskMap: Map<string, Task>): boolean {
  return !parent.contextual && !parent.task.completed_at && parent.task.id !== source.parent_id && parent.task.id !== source.id
    && scopeOf(source.project_id, members) === scopeOf(group.project, members)
    && !ancestors(parent.task.id, taskMap).some((task) => task.id === source.id)
}

export function todayGroupDrop(groups: readonly ListGroup[], members: Map<string, Membership>, nest: boolean, task: Task, target: string | null, y: number, gesture: DragDepth, taskMap: Map<string, Task>) {
  if (!target || task.completed_at || !canEditTasks(roleOf(task.project_id, members))) return null
  const origin = groups.find((group) => group.rows.some((row) => row.task.id === task.id))
  if (!origin || !isTodayProjectGroup(origin)) return null
  const context = origin.rows.find((row) => row.task.id === task.id && row.contextual)
  const rowId = target.startsWith('task:') ? target.slice(5) : null
  const promote = target.startsWith(PROMOTE_TARGET)
  const group = rowId ? groups.find((g) => g.rows.some((row) => row.task.id === rowId))
    : promote ? groups.find((g) => g.key === target.slice(PROMOTE_TARGET.length))
    : target.startsWith('today-group:') ? groups.find((g) => g.key === target.slice('today-group:'.length)) : undefined
  if (!group || !isTodayProjectGroup(group) || !canEditTasks(roleOf(group.project, members))) return null
  const moved = group !== origin
  const drop = intoGroup(group)
  const note = moved ? t('Move to {project}', { project: drop.projectName }) : undefined
  if (promote) return nest && context?.parent ? { group: group.key, drop: { ...drop, contextParent: context.parent } } : null
  if (context && (!rowId || !nest || !context.parent)) return null
  if (!rowId) return moved ? { group: group.key, drop } : null
  const anchor = group.rows.find((row) => row.task.id === rowId)
  if (!anchor || anchor.contextual || anchor.task.completed_at) return null
  const el = document.querySelector(`[data-drop-target="task:${CSS.escape(rowId)}"]`)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (context?.parent) {
    if (dropZone(y, rect.top, rect.height, true) !== 'inside' || !contextualParent(task, anchor, group, members, taskMap)) return null
    const indicator: DropAt = { id: rowId, zone: 'inside', note }
    return { indicator, group: moved ? group.key : undefined, drop: { ...drop, contextParent: context.parent, parentId: rowId } }
  }
  const canNest = scopeOf(task.project_id, members) === scopeOf(group.project, members)
  const next = projectGroupPlacement(group.rows.filter((r) => !r.contextual).map(gapRow), rowId, task.id, nest, canNest, rect, y, gesture)
  if (!next) return null
  const indicator: DropAt = { id: rowId, zone: next.zone, note, depth: next.depth }
  return { indicator, group: moved ? group.key : undefined, drop: { ...drop, ...next.placement } }
}

/** The same allowed destinations as the contextual drag, for the keyboard's Actions menu. */
export function contextualMoveItems(task: Task, groups: readonly ListGroup[], members: Map<string, Membership>, taskMap: Map<string, Task>,
  move: (id: string, drop: GroupDrop) => Promise<string | undefined>): ActionItem[] {
  if (task.completed_at || !canEditTasks(roleOf(task.project_id, members))) return []
  const eligible = groups.filter((g) => isTodayProjectGroup(g) && canEditTasks(roleOf(g.project, members)))
  const origin = eligible.find((g) => g.rows.some((r) => r.task.id === task.id && r.contextual))
  if (!origin || !task.parent_id) return []
  const contextParent = task.parent_id
  const parents = eligible.flatMap((group) => group.rows.filter((r) => contextualParent(task, r, group, members, taskMap))
    .map((r) => ({ task: r.task, group })))
  const reparent = t('Move under task')
  const promote = t('Make top-level for today')
  return [
    { kind: 'picker', id: 'today-reparent-context', label: reparent, icon: 'corner-down-right', disabled: parents.length === 0,
      picker: { title: reparent, source: parents, getKey: (p) => p.task.id, getLabel: (p) => p.task.title || t('Untitled'),
        getSecondary: (p) => intoGroup(p.group).projectName,
        onPick: async (p) => { await move(task.id, { ...intoGroup(p.group), parentId: p.task.id, contextParent }) } } },
    { kind: 'picker', id: 'today-promote-context', label: promote, icon: 'calendar-check',
      picker: { title: promote, source: eligible, pinned: [origin.key], getKey: (g) => g.key, getLabel: (g) => intoGroup(g).projectName,
        onPick: async (g) => { await move(task.id, { ...intoGroup(g), contextParent }) } } },
  ]
}
