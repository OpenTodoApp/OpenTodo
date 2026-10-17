// Pointer drag of list rows and board cards (OpenSpec `manual-ordering`, board-view;
// task-list-presentation "Drag feedback"), split out of TaskListView.
import { useCallback, useRef, useState } from 'react'
import { beginDrag } from '../../lib/dnd'
import type { ListRow } from '../../lib/listGroups'
import { moveTask } from '../../lib/move'
import type { Section, Task } from '../../lib/types'
import { flattenTree, type Tree } from '../../lib/tree'
import { act } from '../actionError'
import { dropTarget, sameDrop, zoneUnder, type DropAt } from '../listDrop'

/** What a drag session reads at drop time; the latest render's values. */
export interface DragSource {
  rows: ListRow[]
  sectionOfRow: Map<string, string>
  tree: Tree<Task> | null
  board: boolean
  sectionMap: Map<string, Section>
}

/**
 * Onto another row a drag places the task before, after or (list only) inside it;
 * onto a section heading or column it moves the task to the end of that section.
 * Escape or a drop outside any list changes nothing.
 */
export function useListDrag({ manual, source, moveToSection, onDropped }: {
  manual: boolean
  source: DragSource
  /** Move a top-level task to a section ('' = none). */
  moveToSection: (task: Task, key: string) => void
  /** The dropped task, to select it. */
  onDropped: (id: string) => void
}) {
  const [dropAt, setDropAt] = useState<DropAt | null>(null)
  // The row being dragged lifts (task-list-presentation "Drag feedback").
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // The drag session outlives renders; it reads the latest rows through this ref.
  const dragState = useRef(source)
  dragState.current = source

  const startDrag = useCallback((e: React.PointerEvent, task: Task) => {
    if (!manual) return
    const st = dragState.current
    const node = st.tree?.nodes.get(task.id)
    const own = new Set(node ? flattenTree([node]).map((n) => n.id) : [task.id])
    let current: DropAt | null = null
    const show = (d: DropAt | null) => {
      if (sameDrop(d, current)) return
      current = d
      setDropAt(d)
    }
    beginDrag(e, {
      label: task.title,
      onStart: () => setDraggingId(task.id),
      onMove: (target, _x, y) => {
        const id = target?.startsWith('task:') ? target.slice('task:'.length) : null
        const zone = id && !own.has(id) ? zoneUnder('data-task-id', id, y, !dragState.current.board) : null
        show(id && zone ? { id, zone } : null)
      },
      onDrop: (target) => {
        const { rows: rs, sectionOfRow: secs, board: b } = dragState.current
        if (target.startsWith('task:')) {
          const r = current ? rs.find((x) => x.task.id === current?.id) : undefined
          if (!r || !current) return
          const entry = dropTarget({ id: r.task.id, parent: r.parent, expanded: !b && r.hasChildren && !r.collapsed }, current.zone)
          const section = entry.parent_id === null ? secs.get(r.task.id) : undefined
          act(moveTask(task.id, { ...entry, ...(section !== undefined ? { section_id: section } : {}) }))
        } else if (target.startsWith('section:')) {
          const key = target.slice('section:'.length)
          const row = rs.find((x) => x.task.id === task.id)
          if (row && row.parent === null) moveToSection(task, key)
          else act(moveTask(task.id, { parent_id: null, section_id: key, at: 'bottom' }))
        } else return
        onDropped(task.id)
      },
      onEnd: () => { show(null); setDraggingId(null) },
    })
  }, [manual, moveToSection, onDropped])

  /** The section map of the latest render, for code that runs later (an `o` insertion). */
  const latestSectionMap = useCallback(() => dragState.current.sectionMap, [])
  return { dropAt, draggingId, startDrag, latestSectionMap }
}
