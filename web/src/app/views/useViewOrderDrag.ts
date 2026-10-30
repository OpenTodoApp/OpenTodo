// Dragging rows and cards of a saved list view in its own manual order (OpenSpec
// change view-manual-order, design D4): a row lands before or after another row
// of the same group (a column on a board), never inside it; a drop on a sidebar
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
import { reorderInView } from '../viewOrderActions'

/** A row of the view: its key is `<group key>:<task id>` (a task may be in several groups). */
export interface ViewRow {
  key: string
  task: Task
}

/** The drop target key of a row. */
export const viewRowTarget = (key: string) => `vrow:${key}`

/** The group part of a row key. */
export const groupOfKey = (key: string) => key.slice(0, key.lastIndexOf(':'))

export function useViewOrderDrag(host: OrderHost | null, rows: readonly ViewRow[], opts: {
  /** The bulk selection: a dragged row that is part of it carries every ticked task to a sidebar target. */
  ticked: readonly string[]
  /** A touch hold's release: the row's menu at the finger (task-row-context-menu). */
  openRowMenu: (task: Task, x: number, y: number, row: HTMLElement) => void
  /** The dropped row, to select it. */
  onDropped: (key: string) => void
}) {
  const [dropAt, setDropAt] = useState<{ key: string; zone: DropZone } | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const latest = useRef({ rows, opts })
  latest.current = { rows, opts }

  const startDrag = useCallback((e: React.PointerEvent<HTMLElement>, key: string, task: Task) => {
    if (!host) return
    const el = e.currentTarget
    const group = groupOfKey(key)
    let current: { key: string; zone: DropZone } | null = null
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
        if (!k || k === key || groupOfKey(k) !== group) return show(null)
        const over = document.querySelector(`[data-drop-target="${CSS.escape(target!)}"]`)
        if (!over) return show(null)
        const r = over.getBoundingClientRect()
        show({ key: k, zone: dropZone(y, r.top, r.height, false) })
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
        act(reorderInView(host, rs.map((r) => r.task), task.id, at.zone === 'before' ? { before: anchor } : { after: anchor }))
        o.onDropped(key)
      },
      onEnd: () => { show(null); setDraggingKey(null) },
    })
  }, [host])

  return { dropAt, draggingKey, startDrag }
}
