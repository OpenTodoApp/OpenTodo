// Events of calendars in Day, Week, Plan and Month (OpenSpec changes calendar-feeds D8,
// calendar-events-all-views and calendar-event-edits). Chips and rows are buttons that open a
// popover with the summary, time, location and calendar name; for an event of a connected
// calendar the popover holds the editor or says why it cannot be changed (loaded on open,
// outside the first load). The grid's event blocks are calendar/EventBlock.tsx.
import { hueFor, Icon, Popover } from '../ui'
import { Suspense, useRef, useState, type PointerEvent } from 'react'
import { lazy } from '../lib/lazy'
import { formatTime as toHHMM } from '../lib/calendar'
import { formatShort, formatTime as formatWallTime, localDueOf } from '../lib/dates'
import type { CalendarEvent, CalendarSubscription, CalendarWhen } from '../lib/types'
import { t } from '../lib/i18n'
import { formatMinutes } from '../lib/duration'

/** Wall time of a timed point in the viewer's zone ("10:00"), or the date for all-day points. */
function whenText(p: CalendarWhen, zone?: string): string {
  if (!p.time) return formatShort(p.date)
  const local = p.tz ? localDueOf({ date: p.date, time: p.time, tz: p.tz }, zone) : { date: p.date, time: p.time }
  return formatWallTime(local.time ?? p.time)
}

/** "10:00 to 11:00", or "All day" for all-day events. */
export function eventTimeText(ev: CalendarEvent, zone?: string): string {
  if (ev.allDay) return t('All day')
  return `${whenText(ev.start, zone)} to ${whenText(ev.end, zone)}`
}

export function eventLabel(ev: CalendarEvent, sub: CalendarSubscription | undefined, zone?: string): string {
  return [ev.summary || t('Busy'), eventTimeText(ev, zone), ev.location, sub?.name].filter(Boolean).join(', ')
}

function EventDetails({ ev, sub, zone, onDone }: { ev: CalendarEvent; sub?: CalendarSubscription; zone?: string; onDone?: () => void }) {
  return (
    <div className="space-y-1 text-body" data-event-details>
      <p className="font-medium text-strong">{ev.summary || t('Busy')}</p>
      <p className="flex items-center gap-1.5 text-meta text-muted"><Icon name="clock" size="xs" />{eventTimeText(ev, zone)}</p>
      {ev.location && <p className="truncate ps-[18px] text-meta text-muted">{ev.location}</p>}
      {sub && (
        <p className="flex items-center gap-1.5 text-meta text-muted">
          <span className="h-2 w-2 shrink-0 rounded-full bg-hue-solid" data-hue={hueFor(sub.color)} aria-hidden />{sub.name}
        </p>
      )}
      {ev.free && <p className="text-meta text-faint">{t('Shown as free')}</p>}
      {ev.access
        ? <Suspense fallback={null}><EventEditor ev={ev} zone={zone} onDone={onDone} /></Suspense>
        : <p className="text-meta text-faint">{t('From a subscribed calendar. Edit it in its own app.')}</p>}
    </div>
  )
}

/** The editor of an event of a connected calendar (calendar-event-edits D7), loaded when a popover opens. */
const EventEditor = lazy(() => import('./calendar/EventEditor'))

/** An event's details popover, anchored to the button that toggles it. */
export function useEventDetails(ev: CalendarEvent, sub?: CalendarSubscription, zone?: string) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const popover = (
    <Popover open={open} onClose={() => setOpen(false)} anchor={ref} label={ev.summary || t('Event')} width="sm:w-72" className="p-3" align="start">
      <EventDetails ev={ev} sub={sub} zone={zone} onDone={() => setOpen(false)} />
    </Popover>
  )
  const toggle = () => setOpen((o) => !o)
  // A block, chip or row: read-only, never a drag source (the grid's pointer handling never sees it).
  const trigger = {
    ref, type: 'button' as const, 'aria-haspopup': 'dialog' as const,
    'data-free': ev.free || undefined, 'data-hue': hueFor(sub?.color),
    onPointerDown: (e: PointerEvent) => e.stopPropagation(), onClick: toggle,
  }
  return { ref, open, toggle, trigger, popover }
}

/** One all-day or multi-day event in a day's all-day strip. */
export function EventChip({ ev, sub, zone }: { ev: CalendarEvent; sub?: CalendarSubscription; zone?: string }) {
  const details = useEventDetails(ev, sub, zone)
  return (
    <>
      <button
        {...details.trigger}
        data-event-chip={ev.id}
        aria-label={eventLabel(ev, sub, zone)}
        className={`flex w-full min-w-0 items-center gap-1 px-1.5 py-0.5 text-start text-hint ${ev.free ? 'rounded-chip border border-dashed border-hue-solid text-hue' : 'ui-block ui-block--row ui-block--event'} focus-visible:outline-2 focus-visible:outline-focus`}
      >
        {!ev.free && <span aria-hidden className="ui-block-dot" />}
        <span className="truncate">{ev.summary || t('Busy')}</span>
      </button>
      {details.popover}
    </>
  )
}

/** Where an event row sits: a Plan column, the phone's Week agenda (44 px rows) or a Month cell. */
export type EventRowVariant = 'plan' | 'agenda' | 'cell'

const ROW_CLASS: Record<EventRowVariant, string> = {
  plan: 'gap-1 px-1 py-0.5 text-meta',
  agenda: 'min-h-11 gap-2 px-2 py-1 text-body',
  cell: 'min-h-6 gap-1 px-1 py-0.5 text-meta',
}

/**
 * One event as a row (planner-view D3, calendar-events-all-views): time, summary and,
 * in the Plan and the Week agenda, the minutes inside this day, in the calendar's
 * colour; an all-day event (no `start`) says "all day" in the agenda. Read-only,
 * reachable with Tab, Enter opens the same details.
 */
export function EventRow({ ev, start, end, sub, zone, variant = 'plan' }: { ev: CalendarEvent; start?: number; end?: number; sub?: CalendarSubscription; zone?: string; variant?: EventRowVariant }) {
  const details = useEventDetails(ev, sub, zone)
  const timed = start !== undefined
  const time = timed ? formatWallTime(toHHMM(start)) : t('all day')
  const length = timed && variant !== 'cell' ? formatMinutes(Math.max(0, (end ?? start) - start)) : ''
  return (
    <>
      <button
        {...details.trigger}
        data-plan-event={variant === 'plan' ? ev.id : undefined}
        data-agenda-event={variant === 'agenda' ? ev.id : undefined}
        data-month-event={variant === 'cell' ? ev.id : undefined}
        onClick={(e) => { e.stopPropagation(); details.toggle() }}
        className={`flex w-full min-w-0 items-center text-start ${ROW_CLASS[variant]} ${ev.free ? 'rounded-chip border border-dashed border-hue-solid text-hue' : 'ui-block ui-block--row ui-block--event'} focus-visible:outline-2 focus-visible:outline-focus`}
      >
        {/* Named by its visible content (WCAG 2.5.3 Label in Name); the location and calendar are not shown, so they follow as hidden text. */}
        {!ev.free && <span aria-hidden className="ui-block-dot" />}
        {(timed || variant === 'agenda') && <span className={`shrink-0 tabular-nums ${variant === 'agenda' ? 'w-14 text-meta' : ''}`}>{time}</span>}
        <span className="min-w-0 flex-1 truncate font-medium">{ev.summary || t('Busy')}</span>
        {length && <span className="shrink-0 text-hint tabular-nums">{length}</span>}
        {(ev.location || sub?.name) && <span className="sr-only">{`, ${[ev.location, sub?.name].filter(Boolean).join(', ')}`}</span>}
      </button>
      {details.popover}
    </>
  )
}
