// The Day and Week grids as data (OpenSpec `time-blocking`, split out of CalendarView
// by web-component-structure): each day's unscheduled lane, its task blocks and the
// subscribed calendars' events, laid out in lanes; and the keyboard order over them.
// Calendar slots (calendar-slots D4) are one more kind of block in the same layout;
// the tasks they show are not drawn again.
import { allDayEvents, blockFor, eventBlocks, MIN_BLOCK_MINUTES, type Block, type EventBlock } from './calendar'
import { layoutDay, MAX_LANES, type DayLayout } from './layout'
import { compareByPosition } from './ordering'
import { heldTaskIds, type SlotView } from './slots'
import type { CalendarEvent, Task } from './types'

export interface DayData {
  date: string
  lane: Task[]
  blocks: Map<string, Block>
  /** Timed events of subscribed calendars, keyed `event:<id>` like their layout entries. */
  events: Map<string, EventBlock>
  /** The day's slots, keyed `slot:<id>` like their layout entries (calendar-slots). */
  slots: Map<string, SlotView>
  allDay: CalendarEvent[]
  layout: DayLayout
}

export const isEventId = (id: string): boolean => id.startsWith('event:')

const NO_SLOT_VIEWS = new Map<string, SlotView[]>()

/**
 * The days on screen: a task with a due time is a block as long as its estimate,
 * date-only tasks sit in the lane (by priority, then position). Events and slots share the
 * lanes and the overlap marker with task blocks; capacity counts events only when the device counts meetings (meeting-aware-capacity).
 */
export function calendarDays(dates: readonly string[], shown: readonly Task[], events: readonly CalendarEvent[], zone?: string, slots: ReadonlyMap<string, SlotView[]> = NO_SLOT_VIEWS): DayData[] {
  return dates.map((d) => {
    const lane: Task[] = []
    const blocks = new Map<string, Block>()
    const views = slots.get(d) ?? []
    const held = heldTaskIds(views)
    for (const task of shown) {
      if (task.due?.date !== d || held.has(task.id)) continue
      const b = blockFor(task)
      if (b) blocks.set(task.id, b)
      else lane.push(task)
    }
    lane.sort((a, b) => a.priority - b.priority || compareByPosition(a, b))
    const evs = new Map(eventBlocks(events, d, zone).map((e) => [e.id, e]))
    const slotMap = new Map(views.map((v) => [v.key, v]))
    const items = [...blocks.values(), ...evs.values(), ...views.map((v) => ({ id: v.key, start: v.start, end: v.end }))]
    return { date: d, lane, blocks, events: evs, slots: slotMap, allDay: allDayEvents(events, d), layout: layoutDay(items, MAX_LANES, MIN_BLOCK_MINUTES) }
  })
}

/** Keyboard order: each day's lane, then its blocks in time order (tasks only: events are read-only, slots have their own rows). */
export function calendarOrder(days: readonly DayData[]): string[] {
  return days.flatMap((d) => [...d.lane.map((task) => task.id), ...d.layout.blocks.filter((b) => !isEventId(b.id) && !d.slots.has(b.id)).map((b) => b.id)])
}
