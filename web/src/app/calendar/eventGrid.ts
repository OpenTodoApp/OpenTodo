// Events of connected calendars as grid items (OpenSpec change calendar-event-edits D7): the
// changeable ones by their block id, their place in the day, their keyboard targets and the
// drag ghost. Pure, so the view, the keys and the tests share it.
import { DAY_MINUTES, SLOT_MINUTES } from '../../lib/calendar'
import type { DayData } from '../../lib/calendarDays'
import { addDaysISO } from '../../lib/dates'
import type { CalendarEvent } from '../../lib/types'
import type { DragState, DropTarget } from '../calendarDrag'
import type { EventPlace } from './eventActions'
import type { Preview } from './grid'

export interface GridEvent {
  ev: CalendarEvent
  place: EventPlace
}

/** The changeable timed events of the shown days, by block id (`event:<id>`), on their first day. */
export function gridEvents(days: readonly DayData[]): Map<string, GridEvent> {
  const out = new Map<string, GridEvent>()
  for (const d of days) {
    for (const [id, b] of d.events) {
      if (!out.has(id) && b.event.access?.update) out.set(id, { ev: b.event, place: { date: d.date, start: b.start, end: b.end } })
    }
  }
  return out
}

/** The selection order with the changeable events after the day's other items (calendar-event-edits D7). */
export function withEvents(order: readonly string[], events: Map<string, GridEvent>): string[] {
  const rest = [...events.entries()].sort(([, a], [, b]) => a.place.date.localeCompare(b.place.date) || a.place.start - b.place.start).map(([id]) => id)
  return [...order, ...rest]
}

export type EventKey = 'nudge' | 'shift-day' | 'estimate' | 'estimate-start'

/** The target a key gives a selected event: 15 minutes, a day, or one edge by 15 minutes. */
export function eventKeyTarget(g: GridEvent, key: EventKey, dir: -1 | 1): DropTarget | null {
  const { date, start, end } = g.place
  const length = end - start
  switch (key) {
    case 'nudge': {
      const next = start + dir * SLOT_MINUTES
      return next < 0 || next + length > DAY_MINUTES ? null : { type: 'slot', date, start: next }
    }
    case 'shift-day': return { type: 'slot', date: addDaysISO(date, dir), start }
    case 'estimate': {
      const estimate = length + dir * SLOT_MINUTES
      return estimate < SLOT_MINUTES || start + estimate > DAY_MINUTES ? null : { type: 'resize', estimate }
    }
    case 'estimate-start': {
      const next = start + dir * SLOT_MINUTES
      return next < 0 || end - next < SLOT_MINUTES ? null : { type: 'resize-start', date, start: next, estimate: end - next }
    }
  }
}

/** The ghost of an event being dragged on day `date`. */
export function eventGhost(drag: DragState | null, events: Map<string, GridEvent>, date: string): Preview | null {
  const g = drag ? events.get(drag.taskId) : undefined
  const target = drag?.target
  if (!g || !target) return null
  const title = g.ev.summary
  const length = g.place.end - g.place.start
  if (target.type === 'slot' && target.date === date) return { id: 'drag-ghost', start: target.start, length, title }
  if (target.type === 'resize' && g.place.date === date) return { id: 'drag-ghost', start: g.place.start, length: target.estimate, title }
  if (target.type === 'resize-start' && target.date === date) return { id: 'drag-ghost', start: target.start, length: target.estimate, title }
  return null
}
