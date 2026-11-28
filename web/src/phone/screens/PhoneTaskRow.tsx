// The app's task row on a phone (OpenSpec changes phone-lists D4 and phone-all-screens
// D3): wherever a screen lists tasks with TaskRow, the phone UI draws this in its
// place, from the same props. It turns them into the phone row: the facts in words,
// the fold of a task with subtasks, the tick box in selection, the swipes, and the
// press the screen's own drag and hold read. What a screen does not give its rows
// (a swipe, a menu, a tick), the phone row does not have there either.
import { useCallback, useState } from 'react'
import { usePendingDone } from '../../lib/pendingDone'
import { useDateTimeFormat } from '../../app/DateTimePrefsProvider'
import { dragFeedback } from '../../app/listDrop'
import { prefersReducedMotion } from '../../app/motion'
import { holdForRow } from '../../app/task-list/rowHold'
import { useRowSwipe } from '../../app/task-list/RowSwipe'
import type { TaskRowProps } from '../../app/task-list/rowDraw'
import { useToday, useViewerZone } from '../../app/useViews'
import { PhoneRow } from '../components/PhoneRow'
import { rowOf } from '../rowModel'
import { openTaskFromList } from '../transition'
import { TaskDateSheet } from './TaskDateSheet'

export function PhoneTaskRow({ task, selected = false, contextual, depth = 0, project, showProject = true, progress, implied, hasChildren, collapsed, readOnly = false, swipe = false, selectMode = false, ticked = false, dragging = false,
  dropIndicator, dropDepth, dropNote, dropKey, inline, treeItem, motion, onToggle, onTick, onToggleCollapse, onPointerDown, onRowMenu, onContextMenu, onEditTitle }: TaskRowProps) {
  const today = useToday()
  const zone = useViewerZone()
  const dateTime = useDateTimeFormat().resolved
  const [dating, setDating] = useState(false)
  const schedule = useCallback(() => setDating(true), [])
  const departing = motion === 'leave'
  const swipes = swipe && !readOnly && !inline && !departing
  const swiping = useRowSwipe({ task, enabled: swipes, onComplete: onToggle, onEditTitle, onSchedule: schedule })
  // The tick shows with the tap, before the write has come back through the list, as the desktop row's does
  // (a completion draws only its own row; found by the phone profile of the time benchmark).
  const checked = usePendingDone(task) || departing
  const row = { ...rowOf(task, implied, { today, zone, dateTime, project: showProject ? project : undefined, progress }), done: checked }
  const feedback = dragFeedback(prefersReducedMotion())
  const drag = departing ? undefined : onPointerDown
  return (
    <>
      <PhoneRow row={row} readOnly={readOnly || departing} depth={depth} lifted={dragging}
        swipe={swipes ? swiping : undefined}
        fold={onToggleCollapse && hasChildren ? { open: !collapsed, onToggle: onToggleCollapse } : undefined}
        selecting={selectMode} ticked={ticked} onTick={onTick ? () => onTick(false) : undefined}
        inline={inline} onToggle={onToggle} onOpen={openTaskFromList}
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
          'data-drop-target': dropKey,
          'data-draggable': drag ? '' : undefined,
          'data-swipeable': swipes ? '' : undefined,
          'data-dragging': dragging ? '' : undefined,
          // The keyboard's cursor row, for a phone with a keyboard: marked as the list marks it.
          'aria-current': selected && !departing ? true : undefined,
          'aria-level': treeItem ? depth + 1 : undefined,
          'aria-hidden': departing || undefined,
          // The screen's drag owns the hold on a row it can lift; elsewhere the row's own hold opens the menu.
          onPointerDown: selectMode || departing ? undefined : (e) => holdForRow(e, drag, onRowMenu),
          onContextMenu,
        }} />
      {dating && <TaskDateSheet task={task} someday onClose={() => setDating(false)} />}
    </>
  )
}
