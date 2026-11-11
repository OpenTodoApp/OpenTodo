import { type FormEvent, memo, use, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../lib/i18n'
import { resolveLabels } from '../../lib/labels'
import { createSubtask } from '../../lib/ops'
import type { Label, Task } from '../../lib/types'
import { act } from '../actionError'
import { isGhost, useDeparture } from '../motion'
import { MAX_INDENT, TaskRow, type RowMotion, type TaskRowProps } from '../TaskRow'
import { UrgencyChip, UrgencyContext } from '../useUrgency'

/** The list's row handlers, stable for the life of the list (large-list-performance D1). */
export interface RowActions {
  toggle: (task: Task) => void
  toggleCollapse: (id: string) => void
  /** Opens the task: inline (a click, inline-task-editing) or in the panel. */
  open: (id: string, e?: React.MouseEvent) => void
  /** A double-click: the task's page (row-click-modes D2). */
  openPage: (id: string) => void
  tick: (id: string, range: boolean) => void
  drag: (e: React.PointerEvent, task: Task) => void
  /** A press on the row's touch grip: hold selects, hold then move drags (bulk-actions on touch). */
  grip: (e: React.PointerEvent, task: Task) => void
  /** A tap on the grip: tick the row and enter Select mode. */
  gripTap: (task: Task) => void
  /** Opens the row menu for the task, as `.` does (rows-v2: the revealed More action). */
  more: (id: string, from: HTMLElement) => void
  /** Shows or hides the task's details under its row (row-expand D4). */
  expand: (id: string) => void
  /** A right-click on this row: the actions menu at the pointer (task-row-context-menu). */
  context: (e: React.MouseEvent, task: Task) => void
  /** A touch hold's release: the same menu at the finger, with no event to guard (task-row-context-menu). */
  contextAt: (task: Task, x: number, y: number, row: HTMLElement) => void
}

type TaskListRowProps = Omit<TaskRowProps, 'motion' | 'labels' | 'onToggle' | 'onOpen' | 'onOpenPage' | 'onTick' | 'onToggleCollapse' | 'onPointerDown' | 'onGripDown' | 'onGripClick' | 'dropKey' | 'actions' | 'onMore' | 'onExpand'> & {
  labelMap: Map<string, Label>
  /** The row can be picked up (to a sidebar project or label, ux-feedback-2 D4). */
  draggable: boolean
  /** Other rows can be dropped on it (a manually ordered list). */
  reorderable: boolean
  /** Tree list: rows with children get the collapse chevron. */
  collapsible: boolean
  /** The row can show its details under it (row-expand): list rows, not cards or departing rows. */
  expandable: boolean
  handlers: RowActions
}

/**
 * The sequence a row plays: a ghost departs, a completed row that stayed rolled forward,
 * Undo restores (motion-v2 D2, D3).
 */
export function rowMotion(task: Task, departure: ReturnType<typeof useDeparture>): RowMotion | undefined {
  if (isGhost(task)) return 'leave'
  if (departure === 'restored') return 'restored'
  if (departure === 'leave' && !task.completed_at) return 'rolled'
  return undefined
}

/**
 * One list row, memoized: every prop is a primitive, a stable object from the
 * list's maps, or the stable `handlers`, so moving the cursor re-renders only the
 * rows whose `selected` changed. The row follows its own task's completion sequence,
 * so a click on its checkbox draws this row only (list-rendering-at-scale D7).
 */
export const TaskListRow = memo(function TaskListRow({ task, labelMap, draggable, reorderable, collapsible, expandable, handlers: actions, ...rest }: TaskListRowProps) {
  const labels = useMemo(() => resolveLabels(task.labels, labelMap), [task.labels, labelMap])
  const departure = useDeparture(task.id)
  // Under the urgency order a top-level row shows its score (urgency-sort D4).
  const urgency = use(UrgencyContext)
  // A departing row leaves by itself when its moment ends (or Undo turns it into a
  // restore): the list does not draw again for it, so a completion draws the list
  // once, when the task leaves its data (incremental-list-updates D4).
  if (isGhost(task) && departure !== 'leave') return null
  const motion = rowMotion(task, departure)
  return (
    <TaskRow
      {...rest}
      motion={motion}
      task={task}
      labels={labels}
      onPointerDown={draggable ? (e) => actions.drag(e, task) : undefined}
      onGripDown={draggable ? (e) => actions.grip(e, task) : undefined}
      onGripClick={draggable ? () => actions.gripTap(task) : undefined}
      onContextMenu={(e) => actions.context(e, task)}
      onRowMenu={(x, y, row) => actions.contextAt(task, x, y, row)}
      dropKey={reorderable ? `task:${task.id}` : undefined}
      onToggle={() => actions.toggle(task)}
      onToggleCollapse={collapsible ? () => actions.toggleCollapse(task.id) : undefined}
      onOpen={(e) => actions.open(task.id, e)}
      onOpenPage={() => actions.openPage(task.id)}
      onTick={(range) => actions.tick(task.id, range)}
      onMore={(from) => actions.more(task.id, from)}
      onExpand={expandable ? () => actions.expand(task.id) : undefined}
      score={urgency && !rest.depth && rest.shape !== 'card' ? <UrgencyChip of={urgency} task={task} /> : undefined}
    />
  )
})

/**
 * An inline add line in a tree list: stays focused for the next entry, Escape (or
 * leaving it empty) closes it. `add` writes one task from the typed title.
 */
export function AddLine({ depth, placeholder, label, add, onClose }: { depth: number; placeholder: string; label: string; add: (title: string) => Promise<unknown>; onClose: () => void }) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  async function submit(e: FormEvent) {
    e.preventDefault()
    const title = value.trim()
    if (!title) return
    setValue('')
    await add(title)
    ref.current?.focus()
  }
  return (
    <form data-add-line onSubmit={(e) => act(submit(e))} className="flex items-center gap-2 py-1 pr-2" style={{ paddingLeft: `${Math.min(depth, MAX_INDENT) * 1.5 + 2}rem` }}>
      <span className="text-accent">+</span>
      <input
        ref={ref}
        className="ui-input py-1"
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
        // Left empty, it closes; not when focus went to the line that took its place
        // (the "Add task below" line moves down after each add).
        onBlur={() => { if (!value) requestAnimationFrame(() => { if (!document.activeElement?.closest('[data-add-line]')) onClose() }) }}
      />
    </form>
  )
}

/** Inline "Add subtask" line under a row; each entry is the parent's last subtask. */
export function SubtaskInput({ parent, depth, onClose }: { parent: Task; depth: number; onClose: () => void }) {
  return <AddLine depth={depth} onClose={onClose} label={t('Add a subtask')} add={(title) => createSubtask(parent.id, title)}
    placeholder={parent.title ? t('Add a subtask to {title}…', { title: parent.title }) : t('Add a subtask to this task…')} />
}

/**
 * The muted "Add a subtask" line at the end of a parent's visible subtasks
 * (quick-subtask-add): a ghost that swaps to the same input `a` opens.
 */
export function SubtaskAddLine({ parent, depth, open, onOpen, onClose }: { parent: Task; depth: number; open: boolean; onOpen: () => void; onClose: () => void }) {
  if (open) return <SubtaskInput parent={parent} depth={depth} onClose={onClose} />
  return (
    <button
      type="button"
      data-subtask-add-line
      aria-label={parent.title ? t('Add a subtask to {title}…', { title: parent.title }) : t('Add a subtask to this task…')}
      className="flex min-h-8 w-full items-center gap-2 py-1 pr-2 text-left text-faint hover:text-default pointer-coarse:min-h-11"
      style={{ paddingLeft: `${Math.min(depth, MAX_INDENT) * 1.5 + 2}rem` }}
      onClick={onOpen}
    >
      <span className="text-faint">+</span>
      <span className="text-meta">{t('Add a subtask')}</span>
    </button>
  )
}
