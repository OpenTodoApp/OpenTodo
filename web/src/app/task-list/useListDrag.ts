// Pointer drag of list rows and board cards (OpenSpec `manual-ordering`, board-view;
// task-list-presentation "Drag feedback"), split out of TaskListView. A row can also
// be dropped on a sidebar project, the Inbox or a label (ux-feedback-2 D4), in every
// list; placing it among other rows needs a manually ordered list.
import { useCallback, useRef, useState } from 'react'
import { beginDrag } from '../../lib/dnd'
import type { ListRow } from '../../lib/listGroups'
import { moveTask } from '../../lib/move'
import type { Section, Task } from '../../lib/types'
import { flattenTree, type Tree } from '../../lib/tree'
import { act } from '../actionError'
import { dropTarget, sameDrop, zoneUnder, type DropAt } from '../listDrop'
import { dropTasks } from '../taskDrop'

/** What a drag session reads at drop time; the latest render's values. */
export interface DragSource {
  rows: ListRow[]
  sectionOfRow: Map<string, string>
  tree: Tree<Task> | null
  board: boolean
  sectionMap: Map<string, Section>
  /** The bulk selection: a dragged row that is part of it carries every selected task to a sidebar target. */
  ticked?: ReadonlySet<string>
}

/**
 * Onto another row a drag places the task before, after or (list only) inside it;
 * onto a section heading or column it moves the task to the end of that section;
 * onto a sidebar project, the Inbox or a label it moves or labels the task (and the
 * rest of the bulk selection with it). Escape or a drop elsewhere changes nothing.
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
      taskDrops: true,
      onStart: () => setDraggingId(task.id),
      onMove: (target, _x, y) => {
        // Over a sidebar target the list shows no drop line (the target shows its ring).
        const id = manual && target?.startsWith('task:') ? target.slice('task:'.length) : null
        const zone = id && !own.has(id) ? zoneUnder('data-task-id', id, y, !dragState.current.board) : null
        show(id && zone ? { id, zone } : null)
      },
      onDrop: (target) => {
        const { rows: rs, sectionOfRow: secs, board: b, ticked } = dragState.current
        if (target.startsWith('drop:')) {
          const ids = ticked?.has(task.id) ? [...ticked] : [task.id]
          act(dropTasks(target.slice('drop:'.length), ids))
          return
        }
        if (!manual) return
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
