// Slots in the Day and Week views (OpenSpec change calendar-slots): the shown days'
// slots with the tasks they hold, today's slots as fixed obstacles of re-planning
// (D8), drops onto, out of and with a slot (D3, D5), and New slot (the focused day,
// the next free quarter hour). Split out of CalendarView, which stays a composer.
import { useMemo } from 'react'
import { formatTime as toHHMM } from '../../lib/calendar'
import type { DayData } from '../../lib/calendarDays'
import { dueFromView } from '../../lib/dates'
import { addTaskToSlot, isSlotKey, moveSlot, resizeSlot, slotsByDate, takeOutOfSlot, useSlots, type SlotView } from '../../lib/slots'
import type { Due, Task } from '../../lib/types'
import type { DropTarget } from '../calendarDrag'
import { newSlotOn, runSlot } from './slotActions'

/** The shown days' slots by date, and today's slot intervals for re-planning. */
export function useSlotViews(dates: readonly string[], taskMap: ReadonlyMap<string, Task>, today: string) {
  const rows = useSlots()
  const slotViews = useMemo(() => slotsByDate(rows, dates, taskMap), [rows, dates, taskMap])
  const obstacles = useMemo(() => (slotViews.get(today) ?? []).map((v) => ({ start: v.start, end: v.end })), [slotViews, today])
  return { slotViews, obstacles }
}

/** Every shown slot by `slot:<id>`, and the slot that shows each task. */
export function useSlotIndex(days: readonly DayData[]) {
  return useMemo(() => {
    const slotIndex = new Map(days.flatMap((d) => [...d.slots.entries()]))
    const heldBy = new Map<string, SlotView>()
    for (const v of slotIndex.values()) for (const tk of [...v.open, ...v.done]) heldBy.set(tk.id, v)
    return { slotIndex, heldBy }
  }, [days])
}

/**
 * The slot part of a drop: a slot moved or resized, a task dropped on a slot, a row
 * dragged out of its slot. True when it handled the drop (one batch with Undo).
 */
export function commitSlotDrop(id: string, target: DropTarget, c: { slotIndex: Map<string, SlotView>; heldBy: Map<string, SlotView>; task?: Task; stored?: Due | null; zone?: string }): boolean {
  const sv = isSlotKey(id) ? c.slotIndex.get(id) : undefined
  if (sv) {
    if (target.type === 'slot') void runSlot(moveSlot(sv, target.date, target.start))
    else if (target.type === 'resize') void runSlot(resizeSlot(sv.slot, target.estimate))
    return true
  }
  const held = c.heldBy.get(id)
  if (target.type === 'into-slot') {
    if (held?.slot.id !== target.slotId) void runSlot(addTaskToSlot(target.slotId, id, c.zone))
    return true
  }
  if (held && c.task && (target.type === 'slot' || target.type === 'lane')) {
    const due = target.type === 'slot' ? dueFromView(c.stored, { date: target.date, time: toHHMM(target.start) })
      : c.task.due?.date !== target.date ? dueFromView(c.stored, { date: target.date }) : null
    void runSlot(takeOutOfSlot(held.slot, id, due))
    return true
  }
  return false
}

/** New slot from the Day or Week menu: the selected item's day when shown, else today or the first day. */
export function newSlotFor(c: { selectedDate?: string | null; dates: readonly string[]; days: readonly DayData[]; today: string; nowMinutes: number; startHour: number; zone?: string }): Promise<string> {
  const date = c.selectedDate && c.dates.includes(c.selectedDate) ? c.selectedDate : c.dates.includes(c.today) ? c.today : c.dates[0]
  const day = c.days.find((d) => d.date === date)
  const busy = day ? day.layout.blocks.filter((b) => !day.events.get(b.id)?.event.free) : []
  return newSlotOn(date, date === c.today ? c.nowMinutes : c.startHour * 60, busy, c.zone)
}
