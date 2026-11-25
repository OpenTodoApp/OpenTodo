// A task list's row on a phone (OpenSpec change phone-lists, design D2, D4): the
// list's shared renderer draws this in place of the desktop row, with the same
// props. It turns them into the phone row: the facts in words, the fold of a task
// with subtasks, the tick box in selection, the swipes, and the press the list's
// own drag and hold read (the 350 ms hold, the menu on release, the drag on a move).
import { memo, useCallback, useState } from 'react'
import { useDateTimeFormat } from '../../app/DateTimePrefsProvider'
import { dragFeedback } from '../../app/listDrop'
import { isGhost, prefersReducedMotion, useDeparture } from '../../app/motion'
import { rowMotion, type TaskListRowProps } from '../../app/task-list/TaskListRow'
import { useRowSwipe } from '../../app/task-list/RowSwipe'
import { holdForRow } from '../../app/task-list/rowHold'
import { useToday, useViewerZone } from '../../app/useViews'
import { PhoneRow } from '../components/PhoneRow'
import { rowOf } from '../rowModel'
import { openTaskFromList } from '../transition'
import { TaskDateSheet } from './TaskDateSheet'

export const PhoneListRow = memo(function PhoneListRow({ task, contextual, depth = 0, project, showProject = true, progress, implied, hasChildren, collapsed, readOnly = false, draggable, reorderable, collapsible, swipe = false, selectMode = false, ticked = false, dragging = false, dropIndicator, dropDepth, dropNote, inline, treeItem, handlers: actions }: TaskListRowProps) {
  const today = useToday()
  const zone = useViewerZone()
  const dateTime = useDateTimeFormat().resolved
  const departure = useDeparture(task.id)
  const [dating, setDating] = useState(false)
  const toggle = useCallback(() => actions.toggle(task), [actions, task])
  const schedule = useCallback(() => setDating(true), [])
  const motion = rowMotion(task, departure)
  const departing = motion === 'leave'
  const swiping = useRowSwipe({ task, enabled: swipe && !readOnly && !inline && !departing, onComplete: toggle, onSchedule: schedule })
  // A departing row leaves by itself when its moment ends, as the desktop row does (TaskListRow).
  if (isGhost(task) && departure !== 'leave') return null

  const row = rowOf(task, implied, { today, zone, dateTime, project: showProject ? project : undefined, progress })
  const feedback = dragFeedback(prefersReducedMotion())
  const drag = draggable && !departing ? (e: React.PointerEvent<HTMLLIElement>) => actions.drag(e, task) : undefined
  return (
    <>
      <PhoneRow row={row} readOnly={readOnly || departing} depth={depth} lifted={dragging}
        swipe={swipe && !readOnly && !inline && !departing ? swiping : undefined}
        fold={collapsible && hasChildren ? { open: !collapsed, onToggle: () => actions.toggleCollapse(task.id) } : undefined}
        selecting={selectMode} ticked={ticked} onTick={contextual ? undefined : () => actions.tick(task.id, false)}
        inline={inline} onToggle={toggle} onOpen={openTaskFromList}
        overlay={(dropIndicator === 'before' || dropIndicator === 'after') ? (
          <>
            <span aria-hidden="true" data-drop-indicator={dropIndicator} data-drop-depth={dropDepth} className={`${feedback.line} ${dropIndicator === 'before' ? '-top-px' : '-bottom-px'}`} />
            {dropNote && <span data-drop-note className={`pointer-events-none absolute end-2 z-10 rounded-control bg-accent px-1.5 text-meta text-on-accent ${dropIndicator === 'after' ? '-bottom-2.5' : '-top-2.5'}`}>{dropNote}</span>}
          </>
        ) : undefined}
        attrs={{
          'data-task-id': departing ? undefined : task.id,
          'data-departing': departing ? task.id : undefined,
          'data-contextual': contextual ? '' : undefined,
          'data-drop-target': reorderable ? `task:${task.id}` : undefined,
          'data-draggable': drag ? '' : undefined,
          'data-swipeable': swipe && !readOnly && !inline && !departing ? '' : undefined,
          'data-dragging': dragging ? '' : undefined,
          'aria-level': treeItem ? depth + 1 : undefined,
          'aria-hidden': departing || undefined,
          // The list's drag owns the hold on a row it can lift; elsewhere the row's own hold opens the menu.
          onPointerDown: selectMode || departing ? undefined : (e) => holdForRow(e, drag, (x, y, el) => actions.contextAt(task, x, y, el)),
          onContextMenu: (e) => actions.context(e, task),
        }} />
      {dating && <TaskDateSheet task={task} someday onClose={() => setDating(false)} />}
    </>
  )
})
