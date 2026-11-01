// Events of subscribed calendars in Day, Week, Plan and Month (OpenSpec changes
// calendar-feeds D8 and calendar-events-all-views). Read-only: blocks and chips are buttons that open a popover with the
// summary, time, location and calendar name; they never start a drag, are never
// selected with j/k and are never drop targets.
import { hueFor, Icon, Tooltip, Popover } from '../ui'
import { useRef, useState } from 'react'
import { formatTime as toHHMM, type EventBlock } from '../lib/calendar'
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

export function EventDetails({ ev, sub, zone }: { ev: CalendarEvent; sub?: CalendarSubscription; zone?: string }) {
  return (
    <div className="space-y-1 text-body" data-event-details>
      <p className="font-medium text-strong">{ev.summary || t('Busy')}</p>
      <p className="flex items-center gap-1.5 text-meta text-muted"><Icon name="clock" size="xs" />{eventTimeText(ev, zone)}</p>
      {ev.location && <p className="truncate pl-[18px] text-meta text-muted">{ev.location}</p>}
      {sub && (
        <p className="flex items-center gap-1.5 text-meta text-muted">
          <span className="h-2 w-2 shrink-0 rounded-full bg-hue-solid" data-hue={hueFor(sub.color)} aria-hidden />{sub.name}
        </p>
      )}
      {ev.free && <p className="text-meta text-faint">{t('Shown as free')}</p>}
      <p className="text-meta text-faint">{t('From a subscribed calendar. Edit it in its own app.')}</p>
    </div>
  )
}

/** One timed event in a day column, laid out with the task blocks. */
export function EventBlockView({ block, lane, lanes, overlap, pxPerMinute, minHeight, sub, zone }: {
  block: EventBlock
  lane: number
  lanes: number
  overlap: boolean
  pxPerMinute: number
  minHeight: number
  sub?: CalendarSubscription
  zone?: string
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const ev = block.event
  const height = Math.max(minHeight, (block.end - block.start) * pxPerMinute)
  return (
    <>
      <Tooltip label={eventLabel(ev, sub, zone)} side="right">
      <button
        ref={ref}
        type="button"
        data-event={ev.id}
        data-free={ev.free || undefined}
        data-overlap={overlap || undefined}
        data-hue={hueFor(sub?.color)}
        aria-label={eventLabel(ev, sub, zone)}
        aria-haspopup="dialog"
        // Not a drag source: the grid's pointer handling never sees it.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((o) => !o)}
        className={`absolute z-10 overflow-hidden px-1.5 text-left ${height < 20 ? 'py-0 text-hint leading-none' : 'py-0.5 text-meta'} ${ev.free ? 'rounded-control border border-dashed border-hue-solid bg-transparent text-hue' : 'ui-block ui-block--event'} focus-visible:outline-2 focus-visible:outline-focus`}
        style={{
          top: block.start * pxPerMinute, height,
          left: `calc(${(lane / lanes) * 100}% + 2px)`,
          width: `calc(${100 / lanes}% - 4px)`,
        }}
      >
        <span className="flex min-w-0 items-center gap-1 font-medium">{!ev.free && <span aria-hidden className="ui-block-dot" />}<span className="truncate">{ev.summary || t('Busy')}</span></span>
        {height >= 30 && <span className="block truncate text-hint tabular-nums" data-event-time>{formatWallTime(toHHMM(block.start))}{ev.location ? ` · ${ev.location}` : ''}</span>}
      </button>
      </Tooltip>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} label={ev.summary || t('Event')} width="sm:w-72" className="p-3" align="start">
        <EventDetails ev={ev} sub={sub} zone={zone} />
      </Popover>
    </>
  )
}

/** One all-day or multi-day event in a day's all-day strip. */
export function EventChip({ ev, sub, zone }: { ev: CalendarEvent; sub?: CalendarSubscription; zone?: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        ref={ref}
        type="button"
        data-event-chip={ev.id}
        data-free={ev.free || undefined}
        data-hue={hueFor(sub?.color)}
        aria-label={eventLabel(ev, sub, zone)}
        aria-haspopup="dialog"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full min-w-0 items-center gap-1 px-1.5 py-0.5 text-left text-hint ${ev.free ? 'rounded-chip border border-dashed border-hue-solid text-hue' : 'ui-block ui-block--row ui-block--event'} focus-visible:outline-2 focus-visible:outline-focus`}
      >
        {!ev.free && <span aria-hidden className="ui-block-dot" />}
        <span className="truncate">{ev.summary || t('Busy')}</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} label={ev.summary || t('Event')} width="sm:w-72" className="p-3" align="start">
        <EventDetails ev={ev} sub={sub} zone={zone} />
      </Popover>
    </>
  )
}

/** Where an event row sits: a Plan column, the phone's Week agenda (44 px rows) or a Month cell. */
export type EventRowVariant = 'plan' | 'agenda' | 'cell'

const ROW_CLASS: Record<EventRowVariant, string> = {
  plan: 'gap-1 px-1 py-0.5 text-meta',
  agenda: 'min-h-11 gap-2 px-2 py-1 text-body',
  cell: 'gap-1 px-1 py-0.5 text-meta',
}

/**
 * One event as a row (planner-view D3, calendar-events-all-views): time, summary and,
 * in the Plan and the Week agenda, the minutes inside this day, in the calendar's
 * colour; an all-day event (no `start`) says "all day" in the agenda. Read-only,
 * reachable with Tab, Enter opens the same details.
 */
export function EventRow({ ev, start, end, sub, zone, variant = 'plan' }: { ev: CalendarEvent; start?: number; end?: number; sub?: CalendarSubscription; zone?: string; variant?: EventRowVariant }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const timed = start !== undefined
  const time = timed ? formatWallTime(toHHMM(start)) : t('all day')
  const length = timed && variant !== 'cell' ? formatMinutes(Math.max(0, (end ?? start) - start)) : ''
  return (
    <>
      <button
        ref={ref}
        type="button"
        data-plan-event={variant === 'plan' ? ev.id : undefined}
        data-agenda-event={variant === 'agenda' ? ev.id : undefined}
        data-month-event={variant === 'cell' ? ev.id : undefined}
        data-free={ev.free || undefined}
        data-hue={hueFor(sub?.color)}
        aria-haspopup="dialog"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className={`flex w-full min-w-0 items-center text-left ${ROW_CLASS[variant]} ${ev.free ? 'rounded-chip border border-dashed border-hue-solid text-hue' : 'ui-block ui-block--row ui-block--event'} focus-visible:outline-2 focus-visible:outline-focus`}
      >
        {/* Named by its visible content (WCAG 2.5.3 Label in Name); the location and calendar are not shown, so they follow as hidden text. */}
        {!ev.free && <span aria-hidden className="ui-block-dot" />}
        {(timed || variant === 'agenda') && <span className={`shrink-0 tabular-nums ${variant === 'agenda' ? 'w-14 text-meta' : ''}`}>{time}</span>}
        <span className="min-w-0 flex-1 truncate font-medium">{ev.summary || t('Busy')}</span>
        {length && <span className="shrink-0 text-hint tabular-nums">{length}</span>}
        {(ev.location || sub?.name) && <span className="sr-only">{`, ${[ev.location, sub?.name].filter(Boolean).join(', ')}`}</span>}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} label={ev.summary || t('Event')} width="sm:w-72" className="p-3" align="start">
        <EventDetails ev={ev} sub={sub} zone={zone} />
      </Popover>
    </>
  )
}
