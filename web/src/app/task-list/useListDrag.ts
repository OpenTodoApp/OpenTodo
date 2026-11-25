// Pointer drag of list rows and board cards (OpenSpec `manual-ordering`, board-view;
// task-list-presentation "Drag feedback"), split out of TaskListView. A row can also
// be dropped on a sidebar project, the Inbox or a label (ux-feedback-2 D4), in every
// list; placing it among other rows needs a manually ordered list.
import { useCallback, useRef, useState } from 'react'
import { beginDrag } from '../../lib/dnd'
import { COMPLETED_COLUMN, type ListGroup, type ListRow } from '../../lib/listGroups'
import type { TaskTarget } from '../../lib/move'
import { moveRowWithUndo } from '../undoable'
import { moveTasksUndoable } from '../../lib/undoActions'
import type { Section, Task } from '../../lib/types'
import { flattenTree, type Tree } from '../../lib/tree'
import { act } from '../actionError'
import { withListTransition } from '../motion'
import { dropTarget, sameDrop, zoneUnder, type DropAt } from '../listDrop'
import { gapAround, gapDepths, gapRow, gapTarget, indentStep, pointedDepth } from './dropDepth'
import { dropTasks } from '../taskDrop'
import { showBulkToast, showUndoToast } from '../bulk/toastStore'
import type { ViewPlacement } from '../../lib/viewOrder'
import { t } from '../../lib/i18n'
import type { DayDrop, GroupDrop } from '../../lib/viewOrderMove'
import type { DragDepth } from './projectGroupPlacement'

/** A drop Today or Upcoming plans: across project groups, or a line in the day order. */
export type TodayListDrop = GroupDrop | DayDrop

/** What a drag session reads at drop time; the latest render's values. */
export interface DragSource {
  rows: ListRow[]
  /** The list's groups: a drop between two rows of a tree list sees its neighbours in one group (drop-depth). */
  groups?: readonly ListGroup[]
  sectionOfRow: Map<string, string>
  tree: Tree<Task> | null
  board: boolean
  sectionMap: Map<string, Section>
  /** The bulk selection: a dragged row that is part of it carries every selected task to a sidebar target. */
  ticked?: ReadonlySet<string>
  /** Touch: a hold on the row's grip selects it (phone-v2 D8); the row body's hold opens the menu instead. */
  onHold?: (task: Task) => void
  /** Opens the row's actions menu for a task at a point (task-row-context-menu): a touch hold's release. */
  openRowMenu: (task: Task, x: number, y: number, row?: Element | null) => void
  /**
   * A list with its own order (a label page, view-manual-order D4): a drop among rows
   * places the task before or after a row of the same group (`groupOf`), never inside
   * it, and never writes a project position.
   */
  reorder?: (taskId: string, at: ViewPlacement) => void
  groupOf?: ReadonlyMap<string, string>
  /**
   * The page is grouped by Project (view-project-drops): a drop in another project's
   * group moves the task there and places it; a project the person may not edit
   * takes no drop.
   */
  across?: {
    projectOf: (groupKey: string) => { id: string | null; name: string } | null
    canEdit: (projectId: string | null) => boolean
    move: (taskId: string, at: ViewPlacement, groupKey: string) => void
  }
  /**
   * Today and Upcoming (today-project-drops, day-manual-order D2): where a drag over
   * `target` lands, worked out by the page, and its write. Over Upcoming's days the
   * target is the day (`drop:day:<date>`), so `x` and `y` find the row.
   */
  today?: {
    resolve: (task: Task, target: string | null, y: number, gesture: DragDepth, x: number) => { indicator?: DropAt; group?: string; drop: TodayListDrop } | null
    move: (id: string, drop: TodayListDrop) => Promise<string | undefined>
  }
  /** The project on screen: a task of one of its open sub-projects dropped on its section header moves into it (subproject-inline D5). */
  project?: string | null
  /** A task the user may not change: it can still be ordered in its own list, never dropped on the sidebar. */
  readOnly?: (task: Task) => boolean
}

/**
 * Onto another row a drag places the task before, after or (list only) inside it;
 * onto a section heading or column it moves the task to the end of that section;
 * onto a sidebar project, the Inbox or a label it moves or labels the task (and the
 * rest of the bulk selection with it). Escape or a drop elsewhere changes nothing.
 */
export function useListDrag({ manual, source, moveToSection, onDropped, onReorder, onDragStart }: {
  manual: boolean
  /** A drop among rows while another order is shown: switch the list to manual order first (list-display-options D4). */
  onReorder?: () => void
  source: DragSource
  /** Move a top-level task to a section ('' = none). */
  moveToSection: (task: Task, key: string) => void
  /** The dropped task, to select it. */
  onDropped: (id: string) => void
  /** A drag lifted: close anything the touch hold opened on the way (the row's menu). */
  onDragStart?: () => void
}) {
  const [dropAt, setDropAt] = useState<DropAt | null>(null)
  const [dropGroup, setDropGroup] = useState<string | null>(null)
  // The row being dragged lifts (task-list-presentation "Drag feedback").
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // On a board, the column under the pointer and the card's height (surfaces-v2 D7).
  const [placeholder, setPlaceholder] = useState<{ key: string; height: number } | null>(null)
  // The drag session outlives renders; it reads the latest rows through this ref.
  const dragState = useRef(source)
  dragState.current = source

  const startDrag = useCallback((e: React.PointerEvent, task: Task, grip = false) => {
    const st = dragState.current
    // The pressed row: the touch hold tints it while armed (feedback without a render).
    // A grip press starts on its button, but the tint and the board placeholder's
    // height belong to the row it sits in.
    const host = e.currentTarget instanceof HTMLElement ? (e.currentTarget.closest('li') ?? e.currentTarget) : null
    const row = host
    const node = st.tree?.nodes.get(task.id)
    // A ticked row dragged with other ticked rows of a tree list takes them all
    // along, in display order (drag-ticked-together D1); its rows and the subtrees
    // they carry take no drop, except a ticked row, which gathers them after it (D2).
    const group = manual && !st.board && !st.reorder && !st.today && !!st.tree && !!st.ticked?.has(task.id) && st.ticked.size > 1
      ? st.rows.filter((r) => st.ticked?.has(r.task.id)).map((r) => r.task.id) : null
    const own = new Set(group
      ? group.flatMap((id) => { const n = st.tree?.nodes.get(id); return n ? flattenTree([n]).map((x) => x.id) : [id] })
      : node ? flattenTree([node]).map((n) => n.id) : [task.id])
    const gather = new Set(group?.filter((id) => id !== task.id) ?? [])
    // A tree list's drop line takes a depth from the pointer's sideways movement (drop-depth).
    const startX = e.clientX
    const startDepth = st.rows.find((r) => r.task.id === task.id)?.depth ?? 0
    const contextual = st.rows.some((r) => r.task.id === task.id && r.contextual)
    // A project's list with open sub-projects: a task reorders among its own project's rows only (subproject-inline D5).
    const blocks = !st.reorder && !!st.groups?.some((g) => g.subProject && g.rows.length)
    const projectOfRow = (id: string) => st.rows.find((r) => r.task.id === id)?.task.project_id
    // Ticked tasks of several projects take no place among rows: each project keeps its own order.
    const mixed = !!group && blocks && group.some((id) => projectOfRow(id) !== task.project_id)
    const step = indentStep()
    const height = host?.offsetHeight ?? 0
    let column: string | null = null
    const showColumn = (key: string | null) => {
      if (key === column) return
      column = key
      setPlaceholder(key === null ? null : { key, height })
    }
    let current: DropAt | null = null
    const show = (d: DropAt | null) => {
      if (sameDrop(d, current)) return
      current = d
      setDropAt(d)
    }
    const hold = st.onHold
    beginDrag(e, {
      grip,
      label: group ? t('{n, plural, one {# task} other {# tasks}}', { n: group.length }) : task.title,
      taskDrops: !contextual,
      // Only the grip's hold selects (bulk-actions on touch); the row body's hold is the menu's.
      onHold: grip && hold ? () => hold(task) : undefined,
      onStart: () => {
        setDraggingId(task.id)
        // A hold may have opened the menu (a native touch context menu); the drag wins.
        onDragStart?.()
      },
      onHoldChange: (held) => row?.toggleAttribute('data-touch-hold', held),
      press: row,
      onHoldRelease: grip ? undefined : (x, y) => dragState.current.openRowMenu(task, x, y, row),
      onMove: (target, x, y) => {
        // Over a sidebar target the list shows no drop line (the target shows its ring).
        const now = dragState.current
        if (now.today) {
          const next = now.today.resolve(task, target, y, { start: startDepth, dx: x - startX, step }, x)
          setDropGroup(next?.group ?? null)
          show(next?.indicator ?? null)
          return
        }
        let id = manual && target?.startsWith('task:') ? target.slice('task:'.length) : null
        // An own order moves within the task's group only (view-manual-order D4), or into another project's group (view-project-drops).
        let note: string | undefined
        if (id && now.groupOf && now.groupOf.get(id) !== now.groupOf.get(task.id)) {
          const into = now.across?.projectOf(now.groupOf.get(id) ?? '')
          if (into && now.across?.canEdit(into.id)) note = t('Move to {project}', { project: into.name })
          else id = null
        }
        if (id && blocks && projectOfRow(id) !== task.project_id) id = null
        // The Completed column has no order of its own: a card over it, or a completed card anywhere, goes to the column (board-completed-column D3).
        const doneColumn = now.board && id ? completedMove(now.sectionOfRow, task.id, id) : null
        if (doneColumn !== null) id = null
        const tree = !now.board && !now.reorder
        // Over another ticked row the selection gathers right after it (D2).
        if (id && gather.has(id)) {
          show({ id, zone: 'after' })
          return
        }
        const zone = id && !own.has(id) ? zoneUnder('data-task-id', id, y, tree) : null
        const gap = tree && id && zone ? gapAround(now.groups, own, id, zone) : null
        const depth = gap ? pointedDepth(startDepth, x - startX, step, gapDepths(gap.above, gap.below)) : undefined
        show(id && zone ? { id, zone, ...(depth !== undefined ? { depth } : {}), ...(note ? { note } : {}) } : null)
        // A drop on a column lands last in it, so the placeholder follows its last card.
        const over = target?.startsWith('section:') ? target.slice('section:'.length) : doneColumn
        // A completed card's own column takes no drop: the column has no order (D3).
        showColumn(manual && now.board && !(over === COMPLETED_COLUMN && now.sectionOfRow.get(task.id) === COMPLETED_COLUMN) ? over : null)
      },
      onDrop: (target, x, y) => {
        const { rows: rs, groups, sectionOfRow: secs, board: b, ticked, reorder, readOnly, groupOf, across } = dragState.current
        const today = dragState.current.today
        // A line in one of Upcoming's days places the task there too (day-manual-order D2); without one the day takes the drop.
        const line = today && target.startsWith('drop:day:') ? today.resolve(task, target, y, { start: startDepth, dx: x - startX, step }, x) : null
        if (today && line) {
          act(today.move(task.id, line.drop).then((id) => { if (id) onDropped(id) }))
          return
        }
        if (target.startsWith('drop:')) {
          if (contextual || readOnly?.(task) || rs.some((r) => r.task.id === task.id && r.contextual)) return
          const ids = ticked?.has(task.id) ? [...ticked] : [task.id]
          act(withListTransition(ids.length, () => dropTasks(target.slice('drop:'.length), ids)))
          return
        }
        if (today) {
          const next = today.resolve(task, target, y, { start: startDepth, dx: x - startX, step }, x)
          if (next) act(today.move(task.id, next.drop).then((id) => { if (id) onDropped(id) }))
          return
        }
        if (!manual || contextual) return
        if (target.startsWith('task:') && reorder) {
          if (!current || current.zone === 'inside') return
          const at = current.zone === 'before' ? { before: current.id } : { after: current.id }
          const into = groupOf?.get(current.id)
          if (across && into !== undefined && into !== groupOf?.get(task.id)) across.move(task.id, at, into)
          else reorder(task.id, at)
        } else if (target.startsWith('task:') && b && completedMove(secs, task.id, target.slice('task:'.length)) !== null) {
          const key = completedMove(secs, task.id, target.slice('task:'.length))!
          if (key !== secs.get(task.id)) moveToSection(task, key)
        } else if (target.startsWith('task:')) {
          if (mixed) { showBulkToast(t('The tasks must be in one project'), null); return }
          const r = current ? rs.find((x) => x.task.id === current?.id) : undefined
          if (!r || !current) return
          // Between two rows of a tree list the line's depth decides the parent (drop-depth).
          const gap = current.depth !== undefined ? gapAround(groups, own, r.task.id, current.zone) : null
          const byId = gap ? new Map(rs.map((x) => [x.task.id, gapRow(x)])) : null
          const placed = gap && current.depth !== undefined ? gapTarget(gap.above, gap.below, current.depth, (id) => byId?.get(id)) : null
          const entry = gather.has(r.task.id) ? { parent_id: r.parent, at: { after: r.task.id } }
            : placed ?? dropTarget({ id: r.task.id, parent: r.parent, expanded: !b && r.hasChildren && !r.collapsed }, current.zone)
          // A top-level drop takes the section of the row it lands beside.
          const at = entry.at
          const beside = typeof at === 'object' ? ('before' in at ? at.before : at.after) : r.task.id
          const section = entry.parent_id === null ? secs.get(beside) : undefined
          onReorder?.()
          if (group) {
            const where: TaskTarget = { ...entry, ...(section !== undefined ? { section_id: section } : {}) }
            act(withListTransition(group.length, async () => {
              const res = await moveTasksUndoable(group, where)
              if (res?.entry) showUndoToast(res.label, res.entry.id)
            }))
            onDropped(task.id)
            return
          }
          // The row travels to its new place and the others make room (motion-v2 D4).
          act(moveRowWithUndo(task.id, { ...entry, ...(section !== undefined ? { section_id: section } : {}) }))
        } else if (target.startsWith('section:')) {
          const key = target.slice('section:'.length)
          const into = dragState.current.project
          if (into && task.project_id !== into) {
            // From an open sub-project into the project on screen, at that section, with Undo.
            if (!readOnly?.(task)) act(withListTransition(1, () => dropTasks(`project:${into}#${key}`, [task.id])))
            return
          }
          const row = rs.find((x) => x.task.id === task.id)
          if (row && row.parent === null) moveToSection(task, key)
          else act(moveRowWithUndo(task.id, { parent_id: null, section_id: key, at: 'bottom' }))
        } else return
        onDropped(task.id)
      },
      // A list without an order of its own (Today, Upcoming, a filter) takes no drop among
      // its rows: a release on one says why instead of doing nothing (#1507).
      onMiss: (x, y) => {
        if (manual || dragState.current.today) return
        if (document.elementFromPoint(x, y)?.closest('[data-task-id]')) showBulkToast(t('Lists sorted by date or priority keep their order.'), null)
      },
      onEnd: () => { show(null); setDropGroup(null); showColumn(null); setDraggingId(null) },
    })
  }, [manual, moveToSection, onDropped, onReorder, onDragStart])

  /** The section map of the latest render, for code that runs later (an `o` insertion). */
  const latestSectionMap = useCallback(() => dragState.current.sectionMap, [])
  return { dropAt, dropGroup, draggingId, placeholder, startDrag, latestSectionMap }
}

/**
 * On a board with a Completed column: the column a card dropped over the card `overId` goes to
 * when either card is in the Completed column (that column, or the other card's), else null.
 */
function completedMove(sectionOf: Map<string, string>, dragId: string, overId: string): string | null {
  const from = sectionOf.get(dragId), to = sectionOf.get(overId)
  if (to === undefined || (from !== COMPLETED_COLUMN && to !== COMPLETED_COLUMN)) return null
  return to
}
