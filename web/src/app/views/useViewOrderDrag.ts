// Dragging rows and cards of a saved list view in its own manual order (OpenSpec
// change view-manual-order, design D4): a row lands before or after another row
// of the same group (a column on a board), never inside it. Grouped by Project in
// the List layout (view-project-drops), a row may also land in another project's
// group, which moves it there, and with Nest subtasks onto a task, which makes it
// that task's subtask; a project the person may not edit takes no drop. A drop on a sidebar
// project, the Inbox or a label acts as in every list (ux-feedback-2 D4). Mouse
// and pen lift after a few pixels, touch after the short hold of lib/dnd, whose
// release without moving still opens the row's menu.
import { useCallback, useRef, useState } from 'react'
import { beginDrag } from '../../lib/dnd'
import type { Task } from '../../lib/types'
import type { GroupDrop, OrderHost } from '../../lib/viewOrderMove'
import { act } from '../actionError'
import { dropZone, type DropZone } from '../listDrop'
import { dropTasks } from '../taskDrop'
import { withListTransition } from '../motion'
import { dropInView, reorderInView } from '../viewOrderActions'
import { indentStep } from '../task-list/dropDepth'
import { t } from '../../lib/i18n'
import { projectGroupPlacement, type DragDepth } from '../task-list/projectGroupPlacement'

/** A row of the view: its key is `<group key>:<task id>` (a task may be in several groups). */
export interface ViewRow {
  key: string
  task: Task
}

/** The drop target key of a row. */
export const viewRowTarget = (key: string) => `vrow:${key}`

/** The group part of a row key. */
export const groupOfKey = (key: string) => key.slice(0, key.lastIndexOf(':'))

/** A view grouped by Project in the List layout (view-project-drops D1). */
export interface ProjectGroups {
  /** The project a group stands for (null id: the Inbox); null for a group that is none ("unknown"). */
  projectOf: (groupKey: string) => { id: string | null; name: string } | null
  /** Whether the person may change tasks in that project (D4). */
  canEdit: (projectId: string | null) => boolean
  canNest: (from: string | null, to: string | null) => boolean
  /** Nest subtasks is on: a drop onto a task nests (D3). */
  nest: boolean
  /** A row's depth under Nest subtasks (0: top level). */
  depthOf: (rowKey: string) => number
}

type ViewDrop = { key: string; zone: DropZone; depth?: number; note?: string; move?: GroupDrop }

export function useViewOrderDrag(host: OrderHost | null, rows: readonly ViewRow[], opts: {
  /** Grouped by Project in the List layout: drops across groups and onto tasks. */
  projectGroups?: ProjectGroups | null
  /** The bulk selection: a dragged row that is part of it carries every ticked task to a sidebar target. */
  ticked: readonly string[]
  /** A touch hold's release: the row's menu at the finger (task-row-context-menu). */
  openRowMenu: (task: Task, x: number, y: number, row: HTMLElement) => void
  /** The dropped row, to select it. */
  onDropped: (key: string) => void
}) {
  const [dropAt, setDropAt] = useState<ViewDrop | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const latest = useRef({ rows, opts })
  latest.current = { rows, opts }

  const startDrag = useCallback((e: React.PointerEvent<HTMLElement>, key: string, task: Task) => {
    if (!host) return
    const el = e.currentTarget
    const group = groupOfKey(key)
    const start = latest.current.opts.projectGroups?.depthOf(key) ?? 0
    const step = indentStep()
    let current: ViewDrop | null = null
    const show = (d: ViewDrop | null) => {
      const unchanged = d?.key === current?.key && d?.zone === current?.zone && d?.depth === current?.depth && d?.note === current?.note
      current = d
      if (!unchanged) setDropAt(d)
    }
    beginDrag(e, {
      label: task.title,
      taskDrops: true,
      onStart: () => setDraggingKey(key),
      onHoldChange: (held) => el.toggleAttribute('data-touch-hold', held),
      onHoldRelease: (x, y) => latest.current.opts.openRowMenu(task, x, y, el),
      onMove: (target, x, y) => {
        const k = target?.startsWith('vrow:') ? target.slice('vrow:'.length) : null
        if (!k || k === key) return show(null)
        const pg = latest.current.opts.projectGroups
        const over = document.querySelector(`[data-drop-target="${CSS.escape(target!)}"]`)
        if (!over) return show(null)
        const r = over.getBoundingClientRect()
        if (!pg) {
          if (groupOfKey(k) !== group) return show(null)
          return show({ key: k, zone: dropZone(y, r.top, r.height, false) })
        }
        show(viewProjectDrop(pg, latest.current.rows, task, group, k, r, y, { start, dx: x - e.clientX, step }))
      },
      onDrop: (target) => {
        const { rows: rs, opts: o } = latest.current
        if (target.startsWith('drop:')) {
          const ids = o.ticked.includes(task.id) ? [...o.ticked] : [task.id]
          act(withListTransition(ids.length, () => dropTasks(target.slice('drop:'.length), ids)))
          return
        }
        const at = current
        if (!at || target !== viewRowTarget(at.key)) return
        const anchor = rs.find((r) => r.key === at.key)?.task.id
        if (!anchor || anchor === task.id) return
        const tasks = rs.map((r) => r.task)
        const pg = o.projectGroups
        // A plain reorder within a group keeps D4 of view-manual-order; a move, a nest or a subtask let out goes through the move batch.
        if (pg && at.move && (groupOfKey(at.key) !== group || at.move.parentId !== undefined || pg.depthOf(key) > 0)) {
          act(dropInView(host, tasks, task.id, at.move))
        } else if (at.zone !== 'inside') {
          act(reorderInView(host, tasks, task.id, at.move?.at ?? (at.zone === 'before' ? { before: anchor } : { after: anchor })))
        } else return
        o.onDropped(key)
      },
      onEnd: () => { show(null); setDraggingKey(null) },
    })
  }, [host])

  function feedback(key: string) {
    if (dropAt?.key !== key) return {}
    return { dropIndicator: dropAt.zone, dropDepth: dropAt.depth, dropNote: dropAt.note }
  }
  return { feedback, draggingKey, startDrag }
}

function viewProjectDrop(pg: ProjectGroups, rows: readonly ViewRow[], task: Task, group: string,
  key: string, rect: Pick<DOMRect, 'top' | 'height'>, y: number, gesture: DragDepth): ViewDrop | null {
  const destination = groupOfKey(key)
  const into = pg.projectOf(destination)
  const onto = rows.find((row) => row.key === key)?.task
  if (!into || !onto || !pg.canEdit(into.id)) return null
  const from = task.project_id ?? null
  if (pg.nest && (task.completed_at || onto.completed_at || !pg.canEdit(from))) return null
  const tree = rows.filter((row) => groupOfKey(row.key) === destination).map((row) => {
    const depth = pg.depthOf(row.key)
    return { id: row.task.id, parent: depth ? row.task.parent_id ?? null : null, depth }
  })
  const next = projectGroupPlacement(tree, onto.id, task.id, pg.nest, pg.canNest(from, into.id), rect, y, gesture)
  if (!next) return null
  return { key, zone: next.zone, depth: next.depth,
    ...(destination !== group ? { note: t('Move to {project}', { project: into.name }) } : {}),
    move: { projectId: into.id, projectName: into.name, ...next.placement } }
}
