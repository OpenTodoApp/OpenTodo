// Keyboard of the Day and Week views (time-blocking design D4; keyboard-shortcuts
// "One shortcut registry with scopes"): the `calendar` scope. In placement mode the
// arrows, Enter and Esc drive the ghost and every other key waits; otherwise
// selection, moves, estimate. Split out of CalendarView (web-component-structure).
import { type Dispatch, type SetStateAction, useCallback, useRef } from 'react'
import { addDaysISO, dueFromView, viewedTask } from '../../lib/dates'
import { clamp, formatTime as toHHMM, LAST_SLOT, nudgeDue, parseTime, placementStart, SLOT_MINUTES, stepEstimate, stepStart, type GridPrefs } from '../../lib/calendar'
import type { DayData } from '../../lib/calendarDays'
import { getTask } from '../../lib/liveData'
import { updateTask } from '../../lib/ops'
import type { Task } from '../../lib/types'
import { act, reportActionError } from '../actionError'
import type { DropTarget } from '../calendarDrag'
import { isActivationTarget, isTypingTarget, useShortcutScope } from '../shortcuts'
import { estimateFocus } from '../signals'
import { addTaskToSlot, isSlotKey, moveSlot, resizeSlot, slotAt, type SlotView } from '../../lib/slots'
import { runSlot } from './slotActions'
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
  /** The shown slots by `slot:<id>` (calendar-slots): a selected slot moves and resizes with the arrows. */
  slots?: Map<string, SlotView>
  /** While a re-plan preview is open (replan-the-day D4): Enter applies, Escape cancels, the other keys wait. */
  replan?: { apply: () => void; cancel: () => void } | null
  /** `q`: the add dialog for the focused day (calendar-clarity D2). */
  onQuickAdd?: (date: string) => void
}

/** The focused day of Day and Week (calendar-clarity D2): the selected item's day, else today when shown, else the first day. */
export function focusedDay(dates: readonly string[], today: string, selectedDate: string | null | undefined): string {
  if (selectedDate && dates.includes(selectedDate)) return selectedDate
  return dates.includes(today) ? today : dates[0]
}

export function useCalendarKeys(c: CalendarKeyContext) {
  const { placing, setPlacing, selectedId, setSelectedId, order, mode, anchor, today } = c
  const edit = useQueuedEdit()
  const idx = selectedId ? order.indexOf(selectedId) : -1
  const task = selectedId ? c.taskMap.get(selectedId) : undefined
  const block = task ? c.days.find((d) => d.date === task.due?.date)?.blocks.get(task.id) : undefined
  const slot = selectedId && isSlotKey(selectedId) ? c.slots?.get(selectedId) : undefined
  /** A selected slot (calendar-slots D5): arrows move it, Shift+arrows change its length. */
  const slotKeys = (e: KeyboardEvent): boolean => {
    if (!slot || placing) return false
    const dir = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const date = addDaysISO(slot.slot.date!, dir)
      void runSlot(moveSlot(slot, date, slot.start)).then(() => c.follow(date))
    } else if (e.shiftKey) void runSlot(resizeSlot(slot.slot, slot.slot.minutes + dir * SLOT_MINUTES))
    else void runSlot(moveSlot(slot, slot.slot.date!, clamp(slot.start + dir * SLOT_MINUTES, 0, LAST_SLOT)))
    return true
  }
  const ghost = (next: Placement) => {
    setPlacing(next)
    c.follow(next.date)
  }
  /** Arrows with no selection pick the first item; with a dated task they run `move`. */
  const arrows = (move: (task: Task, due: NonNullable<Task['due']>, e: KeyboardEvent) => void) => (e: KeyboardEvent) => {
    if (placing) return false
    if (slotKeys(e)) return
    if (!task || !task.due) {
      if (!task && order.length) { setSelectedId(order[0]); return }
      return false
    }
    move(task, task.due, e)
  }
  const unlessPlacing = (fn: () => boolean | void) => () => (placing ? false : fn())
  const replan = c.replan
  useShortcutScope('calendar', replan ? {
    'calendar.escape': (e) => {
      const target = e.target as HTMLElement | null
      if (isTypingTarget(target)) { target!.blur(); return }
      replan.cancel()
    },
    // A focused button (Apply, Cancel) or the choice keeps its own Enter.
    'calendar.open': (e) => { if (isActivationTarget(e.target) || isTypingTarget(e.target as HTMLElement | null)) return false; replan.apply() },
  } : {
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
      if (slot) return false
      if (!task || isActivationTarget(e.target)) return false
      c.setOpenId(task.id)
    },
    // Shift+Enter while placing over a slot: add the task to it (calendar-slots D7).
    'calendar.add-to-slot': () => {
      if (!placing) return false
      const target = slotAt([...(c.slots?.values() ?? [])].filter((v) => v.slot.date === placing.date), placing.start)
      if (!target) return false
      void runSlot(addTaskToSlot(target.slot.id, placing.taskId))
      setPlacing(null)
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
      if (slotKeys(e)) return
      return arrows((tk) => {
        edit(tk.id, (x) => (x.due ? { due: nudgeDue(x.due, { days }) } : null), (_, patch) => patch.due && c.follow(patch.due.date))
      })(e)
    },
    // Shift+Up shortens, Shift+Down lengthens: the block's lower edge follows the arrow.
    'calendar.estimate': arrows((tk, _due, e) => edit(tk.id, (x) => ({ estimate_minutes: stepEstimate(x.estimate_minutes, (e.key === 'ArrowUp' ? -1 : 1) * SLOT_MINUTES) }))),
    // Alt+Shift+Up starts earlier, Alt+Shift+Down later: the upper edge follows the arrow, the end stays (GitHub issue 355).
    'calendar.estimate-start': arrows((tk, _due, e) => edit(tk.id, (x) => {
      const start = parseTime(x.due?.time)
      if (start === null || !x.due) return null
      const r = stepStart(start, x.estimate_minutes, (e.key === 'ArrowUp' ? -1 : 1) * SLOT_MINUTES)
      return { due: { date: x.due.date, time: toHHMM(r.start) }, estimate_minutes: r.estimate }
    })),
    'calendar.next': unlessPlacing(() => setSelectedId(order[Math.min(order.length - 1, idx + 1)] ?? null)),
    'calendar.prev': unlessPlacing(() => setSelectedId(order[Math.max(0, idx - 1)] ?? null)),
    'calendar.range-prev': unlessPlacing(() => c.goTo(addDaysISO(anchor, mode === 'day' ? -1 : -7))),
    'calendar.range-next': unlessPlacing(() => c.goTo(addDaysISO(anchor, mode === 'day' ? 1 : 7))),
    'calendar.today': unlessPlacing(() => c.goTo(today)),
    // Keyboard twin of dropping on the lane: keep the date, clear the time.
    'calendar.unschedule': unlessPlacing(() => { if (!task?.due || !block) return false; edit(task.id, (tk) => (tk.due ? { due: { date: tk.due.date } } : null)) }),
    'calendar.place': unlessPlacing(() => { if (!task?.due) return false; c.startPlacing(task, task.due.date) }),
    'calendar.edit-estimate': unlessPlacing(() => { if (!task?.due) return false; estimateFocus.request(task.id); c.setOpenId(task.id) }),
    'calendar.quick-add': unlessPlacing(() => {
      if (!c.onQuickAdd) return false
      c.onQuickAdd(focusedDay(c.days.map((d) => d.date), today, task?.due?.date ?? slot?.slot.date))
    }),
    'calendar.complete': unlessPlacing(() => {
      if (!task?.due) return false
      act(completeWithUndo(task.id, true))
      setSelectedId(order[idx + 1] ?? order[idx - 1] ?? null)
    }),
  })
}
