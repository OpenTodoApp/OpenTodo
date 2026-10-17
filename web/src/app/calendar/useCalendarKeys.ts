// Keyboard of the Day and Week views (time-blocking design D4; keyboard-shortcuts
// "One shortcut registry with scopes"): the `calendar` scope. In placement mode the
// arrows, Enter and Esc drive the ghost and every other key waits; otherwise
// selection, moves, estimate. Split out of CalendarView (web-component-structure).
import { type Dispatch, type SetStateAction, useCallback, useRef } from 'react'
import { addDaysISO, dueFromView, viewedTask } from '../../lib/dates'
import { clamp, LAST_SLOT, nudgeDue, placementStart, SLOT_MINUTES, stepEstimate, type GridPrefs } from '../../lib/calendar'
import type { DayData } from '../../lib/calendarDays'
import { getTask } from '../../lib/liveData'
import { updateTask } from '../../lib/ops'
import type { Task } from '../../lib/types'
import { act, reportActionError } from '../actionError'
import type { DropTarget } from '../calendarDrag'
import { isActivationTarget, isTypingTarget, useShortcutScope } from '../shortcuts'
import { estimateFocus } from '../signals'
import { completeWithUndo } from '../undoable'
import type { Placement } from './grid'

type Patch = Partial<Omit<Task, 'id' | '_clock'>>

/**
 * Keyboard edits run one after another on the freshest row, so two quick presses
 * move a block two slots even before the live query has re-rendered.
 */
export function useQueuedEdit() {
  const queue = useRef<Promise<void>>(Promise.resolve())
  return useCallback((id: string, fn: (task: Task) => Patch | null, after?: (task: Task, patch: Partial<Task>) => void) => {
    queue.current = queue.current.then(async () => {
      const raw = await getTask(id)
      if (!raw || raw.deleted_at) return
      const task = viewedTask(raw)
      const patch = fn(task)
      if (!patch) return
      await updateTask(id, 'due' in patch ? { ...patch, due: dueFromView(raw.due, patch.due ?? null) } : patch)
      after?.(task, patch)
    }).catch(reportActionError)
  }, [])
}

export interface CalendarKeyContext {
  mode: 'day' | 'week'
  anchor: string
  today: string
  nowMinutes: number
  prefs: GridPrefs
  days: DayData[]
  order: string[]
  taskMap: Map<string, Task>
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  openId: string | null
  setOpenId: (id: string | null) => void
  placing: Placement | null
  setPlacing: Dispatch<SetStateAction<Placement | null>>
  expanded: string | null
  setExpanded: (key: string | null) => void
  commit: (taskId: string, target: DropTarget) => void
  startPlacing: (task: Task, onDate?: string) => void
  goTo: (date: string) => void
  /** Keep a moved task in view: follow it to another day or week. */
  follow: (date: string) => void
}

export function useCalendarKeys(c: CalendarKeyContext) {
  const { placing, setPlacing, selectedId, setSelectedId, order, mode, anchor, today } = c
  const edit = useQueuedEdit()
  const idx = selectedId ? order.indexOf(selectedId) : -1
  const task = selectedId ? c.taskMap.get(selectedId) : undefined
  const block = task ? c.days.find((d) => d.date === task.due?.date)?.blocks.get(task.id) : undefined
  const ghost = (next: Placement) => {
    setPlacing(next)
    c.follow(next.date)
  }
  /** Arrows with no selection pick the first item; with a dated task they run `move`. */
  const arrows = (move: (task: Task, due: NonNullable<Task['due']>, e: KeyboardEvent) => void) => (e: KeyboardEvent) => {
    if (placing) return false
    if (!task || !task.due) {
      if (!task && order.length) { setSelectedId(order[0]); return }
      return false
    }
    move(task, task.due, e)
  }
  const unlessPlacing = (fn: () => boolean | void) => () => (placing ? false : fn())
  useShortcutScope('calendar', {
    'calendar.escape': (e) => {
      const target = e.target as HTMLElement | null
      if (isTypingTarget(target)) { target!.blur(); return }
      if (placing) setPlacing(null)
      else if (c.expanded) c.setExpanded(null)
      else if (c.openId) c.setOpenId(null)
      else setSelectedId(null)
    },
    'calendar.open': (e) => {
      if (placing) { c.commit(placing.taskId, { type: 'slot', date: placing.date, start: placing.start }); setPlacing(null); return }
      if (!task || isActivationTarget(e.target)) return false
      c.setOpenId(task.id)
    },
    'calendar.nudge': (e) => {
      const dir = e.key === 'ArrowUp' ? -1 : 1
      if (placing) { ghost({ ...placing, start: clamp(placing.start + dir * SLOT_MINUTES, 0, LAST_SLOT) }); return }
      return arrows((tk) => {
        edit(tk.id, (x) => x.due ? { due: nudgeDue(x.due, { minutes: dir * SLOT_MINUTES, fallbackStart: placementStart(x, x.due.date, today, c.nowMinutes, c.prefs) }) } : null)
      })(e)
    },
    'calendar.shift-day': (e) => {
      const days = e.key === 'ArrowLeft' ? -1 : 1
      if (placing) { ghost({ ...placing, date: addDaysISO(placing.date, days) }); return }
      return arrows((tk) => {
        edit(tk.id, (x) => (x.due ? { due: nudgeDue(x.due, { days }) } : null), (_, patch) => patch.due && c.follow(patch.due.date))
      })(e)
    },
    // Shift+Up shortens, Shift+Down lengthens: the block's lower edge follows the arrow.
    'calendar.estimate': arrows((tk, _due, e) => edit(tk.id, (x) => ({ estimate_minutes: stepEstimate(x.estimate_minutes, (e.key === 'ArrowUp' ? -1 : 1) * SLOT_MINUTES) }))),
    'calendar.next': unlessPlacing(() => setSelectedId(order[Math.min(order.length - 1, idx + 1)] ?? null)),
    'calendar.prev': unlessPlacing(() => setSelectedId(order[Math.max(0, idx - 1)] ?? null)),
    'calendar.range-prev': unlessPlacing(() => c.goTo(addDaysISO(anchor, mode === 'day' ? -1 : -7))),
    'calendar.range-next': unlessPlacing(() => c.goTo(addDaysISO(anchor, mode === 'day' ? 1 : 7))),
    'calendar.today': unlessPlacing(() => c.goTo(today)),
    // Keyboard twin of dropping on the lane: keep the date, clear the time.
    'calendar.unschedule': unlessPlacing(() => { if (!task?.due || !block) return false; edit(task.id, (tk) => (tk.due ? { due: { date: tk.due.date } } : null)) }),
    'calendar.place': unlessPlacing(() => { if (!task?.due) return false; c.startPlacing(task, task.due.date) }),
    'calendar.edit-estimate': unlessPlacing(() => { if (!task?.due) return false; estimateFocus.request(task.id); c.setOpenId(task.id) }),
    'calendar.complete': unlessPlacing(() => {
      if (!task?.due) return false
      act(completeWithUndo(task.id, true))
      setSelectedId(order[idx + 1] ?? order[idx - 1] ?? null)
    }),
  })
}
