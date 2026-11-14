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
import type { OrderHost } from '../../lib/viewOrderMove'
import { act } from '../actionError'
import { dropZone, type DropZone } from '../listDrop'
import { dropTasks } from '../taskDrop'
import { withListTransition } from '../motion'
import { dropInView, reorderInView } from '../viewOrderActions'
import { t } from '../../lib/i18n'

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
  /** Nest subtasks is on: a drop onto a task nests (D3). */
  nest: boolean
  /** A row's depth under Nest subtasks (0: top level). */
  depthOf: (rowKey: string) => number
}

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
  const [dropAt, setDropAt] = useState<{ key: string; zone: DropZone; note?: string } | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const latest = useRef({ rows, opts })
  latest.current = { rows, opts }

  const startDrag = useCallback((e: React.PointerEvent<HTMLElement>, key: string, task: Task) => {
    if (!host) return
    const el = e.currentTarget
    const group = groupOfKey(key)
    let current: { key: string; zone: DropZone; note?: string } | null = null
    const show = (d: typeof current) => {
      if (d?.key === current?.key && d?.zone === current?.zone) return
      current = d
      setDropAt(d)
    }
    beginDrag(e, {
      label: task.title,
      taskDrops: true,
      onStart: () => setDraggingKey(key),
      onHoldChange: (held) => el.toggleAttribute('data-touch-hold', held),
      onHoldRelease: (x, y) => latest.current.opts.openRowMenu(task, x, y, el),
      onMove: (target, _x, y) => {
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
        const into = pg.projectOf(groupOfKey(k))
        if (!into || !pg.canEdit(into.id)) return show(null)
        const onto = latest.current.rows.find((x) => x.key === k)?.task
        const inside = pg.nest && !!onto && !withinTask(onto, task.id, latest.current.rows)
        const zone = dropZone(y, r.top, r.height, inside)
        // Before or after a subtask's row there is no place of the view's own order.
        if (zone !== 'inside' && pg.depthOf(k) > 0) return show(null)
        const moves = groupOfKey(k) !== group
        show({ key: k, zone, ...(moves ? { note: t('Move to {project}', { project: into.name }) } : {}) })
      },
      onDrop: (target) => {
        const { rows: rs, opts: o } = latest.current
        if (target.startsWith('drop:')) {
          const ids = o.ticked.includes(task.id) ? [...o.ticked] : [task.id]
          act(withListTransition(ids.length, () => dropTasks(target.slice('drop:'.length), ids)))
          return
        }
        const at = current
        if (!at || !target.startsWith('vrow:')) return
        const anchor = rs.find((r) => r.key === at.key)?.task.id
        if (!anchor || anchor === task.id) return
        const tasks = rs.map((r) => r.task)
        const pg = o.projectGroups
        const into = pg?.projectOf(groupOfKey(at.key))
        // A plain reorder within a group keeps D4 of view-manual-order; a move, a nest or a subtask let out goes through the move batch.
        if (pg && into && (groupOfKey(at.key) !== group || at.zone === 'inside' || pg.depthOf(key) > 0)) {
          act(dropInView(host, tasks, task.id, { projectId: into.id, projectName: into.name,
            ...(at.zone === 'inside' ? { parentId: anchor } : { at: at.zone === 'before' ? { before: anchor } : { after: anchor } }) }))
        } else if (at.zone !== 'inside') {
          act(reorderInView(host, tasks, task.id, at.zone === 'before' ? { before: anchor } : { after: anchor }))
        } else return
        o.onDropped(key)
      },
      onEnd: () => { show(null); setDraggingKey(null) },
    })
  }, [host])

  return { dropAt, draggingKey, startDrag }
}

/** Whether `task` is `id` or one of its subtasks among the view's rows: a task never nests under itself. */
function withinTask(task: Task, id: string, rows: readonly ViewRow[]): boolean {
  const byId = new Map(rows.map((r) => [r.task.id, r.task]))
  for (let cur: Task | undefined = task; cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) if (cur.id === id) return true
  return false
}
