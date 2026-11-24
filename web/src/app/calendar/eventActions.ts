// Event edits with their toast (OpenSpec change calendar-event-edits D6, D7): every drop, key
// and popover change offers Undo, an inverse change, or for a delete cancels it before it is
// sent. Loaded with the calendar view.
import { useCallback, useMemo } from 'react'
import { ApiError } from '../../lib/api'
import { DELETE_DELAY_MS, editEventUndoable, onEventNotice, refusalText, undoAssistantEdit, useEventCommands, type EventChange } from '../../lib/calendarEventEdits'
import { refreshEvents } from '../../lib/calendarFeeds'
import { t } from '../../lib/i18n'
import { DAY_MINUTES, formatTime as toHHMM } from '../../lib/calendar'
import type { DayData } from '../../lib/calendarDays'
import { addDaysISO, daysBetweenISO, eventPointIn, viewerZone } from '../../lib/dates'
import type { CalendarEvent, CalendarEventPatch, CalendarWhen } from '../../lib/types'
import type { DropTarget } from '../calendarDrag'
import { showActionToast, showBulkToast } from '../bulk/toastStore'
import { gridEvents, withEvents } from './eventGrid'

onEventNotice(showActionToast)

/** Where an event's block sits in the viewer's day: the column's date and its minutes. */
export interface EventPlace {
  date: string
  start: number
  end: number
}

/** A wall date and minutes past it as {date, time}, carrying past midnight. */
function wallAt(date: string, minutes: number): { date: string; time: string } {
  const days = Math.floor(minutes / DAY_MINUTES)
  return { date: addDaysISO(date, days), time: toHHMM(minutes - days * DAY_MINUTES) }
}

/**
 * The change a drop or a key makes (calendar-event-edits D6, D7): wall times the viewer
 * chose, written in the event's own zone (eventPointIn), a floating event kept floating, an
 * all-day event that gets a time put in the viewer's zone. The lane makes it all-day.
 */
export function eventChangeFor(ev: CalendarEvent, target: DropTarget, place: EventPlace | null, zone = viewerZone()): CalendarEventPatch | null {
  if (target.type === 'into-slot') return null
  if (target.type === 'lane') {
    const days = ev.allDay ? Math.max(1, daysBetweenISO(ev.start.date, ev.end.date)) : 1
    if (ev.allDay && ev.start.date === target.date) return null
    return { start: { date: target.date }, end: { date: addDaysISO(target.date, days) }, allDay: true }
  }
  const tz = ev.allDay ? zone : ev.start.tz
  const length = place ? place.end - place.start : 60
  const point = (date: string, minutes: number): CalendarWhen => {
    const p = eventPointIn(tz, wallAt(date, minutes), zone)
    return p.tz ? { date: p.date, time: p.time, tz: p.tz } : { date: p.date, time: p.time }
  }
  let date: string
  let start: number
  let end: number
  if (target.type === 'slot') [date, start, end] = [target.date, target.start, target.start + length]
  else if (!place) return null
  else if (target.type === 'resize') [date, start, end] = [place.date, place.start, place.start + target.estimate]
  else [date, start, end] = [target.date, target.start, target.start + target.estimate]
  if (end <= start) return null
  const patch: CalendarEventPatch = { start: point(date, start), end: point(date, end), allDay: false }
  if (!ev.allDay && same(patch.start, ev.start) && same(patch.end, ev.end)) return null
  return patch
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** How long keyboard changes wait for the next press (one request for several, D7). */
export const KEY_SETTLE_MS = 700

/** Change or delete an event, with the toast and its Undo. */
export async function editEventWithUndo(ev: CalendarEvent, change: EventChange, settle = 0): Promise<void> {
  const title = ev.summary || t('Busy')
  try {
    const undo = await editEventUndoable(ev, change, settle)
    const label = 'delete' in change ? t('Deleted {title}', { title }) : t('Changed {title}', { title })
    showBulkToast(label, null, { ...('delete' in change ? { ttl: DELETE_DELAY_MS } : {}), action: { label: t('Undo'), run: () => void undo() } })
  } catch {
    showActionToast(t('This event cannot be changed from OpenTodo'))
  }
}

/** Undo an assistant's change of an event (calendar-event-edits D12). */
export async function undoAssistantChange(ev: CalendarEvent): Promise<void> {
  try {
    await undoAssistantEdit(ev)
  } catch (err) {
    showActionToast(err instanceof ApiError ? refusalText(err, ev) : t('{title} could not be saved to your calendar', { title: ev.summary || t('Busy') }))
    void refreshEvents()
  }
}

/**
 * The calendar view's events of connected calendars (calendar-event-edits D7): the changeable
 * ones by block id, the selection order with them, their queued changes, and how a drop or a
 * key changes one (`settle` waits for more key presses).
 */
export function useCalendarEvents(days: readonly DayData[], base: readonly string[], zone: string | undefined, select: (id: string) => void) {
  const events = useMemo(() => gridEvents(days), [days])
  const order = useMemo(() => withEvents(base, events), [base, events])
  const eventCommands = useEventCommands()
  const commitEvent = useCallback((id: string, target: DropTarget | 'delete', settle = 0) => {
    const g = events.get(id)
    if (!g?.ev.access?.update) return
    if (target === 'delete') {
      if (g.ev.access.delete) void editEventWithUndo(g.ev, { delete: true })
      return
    }
    const change = eventChangeFor(g.ev, target, g.place, zone)
    if (change) void editEventWithUndo(g.ev, change, settle)
    select(id)
  }, [events, zone, select])
  return { events, order, eventCommands, commitEvent }
}
