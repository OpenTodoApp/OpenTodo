// The Day and Week grids as data (OpenSpec `time-blocking`, split out of CalendarView
// by web-component-structure): each day's unscheduled lane, its task blocks and the
// subscribed calendars' events, laid out in lanes; and the keyboard order over them.
import { allDayEvents, blockFor, eventBlocks, type Block, type EventBlock } from './calendar'
import { layoutDay, type DayLayout } from './layout'
import { compareByPosition } from './ordering'
import type { CalendarEvent, Task } from './types'

export interface DayData {
  date: string
  lane: Task[]
  blocks: Map<string, Block>
  /** Timed events of subscribed calendars, keyed `event:<id>` like their layout entries. */
  events: Map<string, EventBlock>
  allDay: CalendarEvent[]
  layout: DayLayout
}

export const isEventId = (id: string): boolean => id.startsWith('event:')

/**
 * The days on screen: a task with a due time is a block as long as its estimate,
 * date-only tasks sit in the lane (by priority, then position). Events share the
 * lanes and the overlap marker with task blocks; capacity never sees them.
 */
export function calendarDays(dates: readonly string[], shown: readonly Task[], events: readonly CalendarEvent[], zone?: string): DayData[] {
  return dates.map((d) => {
    const lane: Task[] = []
    const blocks = new Map<string, Block>()
    for (const task of shown) {
      if (task.due?.date !== d) continue
      const b = blockFor(task)
      if (b) blocks.set(task.id, b)
      else lane.push(task)
    }
    lane.sort((a, b) => a.priority - b.priority || compareByPosition(a, b))
    const evs = new Map(eventBlocks(events, d, zone).map((e) => [e.id, e]))
    return { date: d, lane, blocks, events: evs, allDay: allDayEvents(events, d), layout: layoutDay([...blocks.values(), ...evs.values()]) }
  })
}

/** Keyboard order: each day's lane, then its blocks in time order (tasks only: events are read-only). */
export function calendarOrder(days: readonly DayData[]): string[] {
  return days.flatMap((d) => [...d.lane.map((task) => task.id), ...d.layout.blocks.filter((b) => !isEventId(b.id)).map((b) => b.id)])
}
