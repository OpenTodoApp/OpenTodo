import { t } from '../../lib/i18n'
import { isTodayProjectGroup, type ListGroup } from '../../lib/listGroups'
import { canEditTasks, roleOf, scopeOf } from '../../lib/sharing'
import type { Membership, Task } from '../../lib/types'
import type { DropAt } from '../listDrop'
import { gapRow } from './dropDepth'
import { projectGroupPlacement, type DragDepth } from './projectGroupPlacement'
import type { GroupDrop, OrderHost } from '../../lib/viewOrderMove'
import { offerUndo, reorderInView } from '../viewOrderActions'
import { withListTransition } from '../motion'

export async function applyTodayDrop(host: OrderHost, roots: readonly Task[], groups: readonly ListGroup[], id: string, drop: GroupDrop) {
  const source = groups.flatMap((g) => g.rows).find((r) => r.task.id === id)
  if (!source) return undefined
  if (drop.at && source.task.project_id === drop.projectId && source.depth === 0)
    return await reorderInView(host, roots, id, drop.at) ? id : undefined
  const { dropInViewGroup } = await import('../../lib/viewOrderMove')
  const tasks = source.depth > 0 ? [...roots, source.task] : roots
  const result = await withListTransition(1, () => dropInViewGroup(host, tasks, id, drop))
  if (offerUndo(result)) return result?.id
}

export function todayGroupDrop(groups: readonly ListGroup[], members: Map<string, Membership>, nest: boolean, task: Task, target: string | null, y: number, gesture: DragDepth) {
  if (!target || task.completed_at || !canEditTasks(roleOf(task.project_id, members))) return null
  const origin = groups.find((group) => group.rows.some((row) => row.task.id === task.id))
  if (!origin || !isTodayProjectGroup(origin)) return null
  const rowId = target.startsWith('task:') ? target.slice(5) : null
  const group = rowId ? groups.find((g) => g.rows.some((row) => row.task.id === rowId))
    : target.startsWith('today-group:') ? groups.find((g) => g.key === target.slice('today-group:'.length)) : undefined
  if (!group || !isTodayProjectGroup(group) || !canEditTasks(roleOf(group.project, members))) return null
  const moved = group !== origin
  const projectName = group.heading ?? t('Inbox')
  const drop: GroupDrop = { projectId: group.project ?? null, projectName }
  const note = moved ? t('Move to {project}', { project: projectName }) : undefined
  if (!rowId) return moved ? { group: group.key, drop } : null
  const anchor = group.rows.find((row) => row.task.id === rowId)
  if (!anchor || anchor.task.completed_at) return null
  const el = document.querySelector(`[data-drop-target="task:${CSS.escape(rowId)}"]`)
  if (!el) return null
  const canNest = scopeOf(task.project_id, members) === scopeOf(group.project, members)
  const next = projectGroupPlacement(group.rows.map(gapRow), rowId, task.id, nest, canNest, el.getBoundingClientRect(), y, gesture)
  if (!next) return null
  const indicator: DropAt = { id: rowId, zone: next.zone, note, depth: next.depth }
  return { indicator, group: moved ? group.key : undefined, drop: { ...drop, ...next.placement } }
}
