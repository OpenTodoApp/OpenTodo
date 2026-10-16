// Events of subscribed calendars in Day and Week (OpenSpec change calendar-feeds,
// design D8). Read-only: blocks and chips are buttons that open a popover with the
// summary, time, location and calendar name; they never start a drag, are never
// selected with j/k and are never drop targets.
import { hueFor, Icon, Tooltip } from '../ui'
import { useRef, useState } from 'react'
import { formatTime as toHHMM, type EventBlock } from '../lib/calendar'
import { formatShort, formatTime as formatWallTime, localDueOf } from '../lib/dates'
import type { CalendarEvent, CalendarSubscription, CalendarWhen } from '../lib/types'
import { Popover } from './overlay/Popover'
import { t } from '../lib/i18n'

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

function EventDetails({ ev, sub, zone }: { ev: CalendarEvent; sub?: CalendarSubscription; zone?: string }) {
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
        className={`absolute z-10 overflow-hidden rounded-control border px-1.5 text-left text-hue ${height < 20 ? 'py-0 text-hint leading-none' : 'py-0.5 text-meta'} ${ev.free ? 'border-dashed border-hue-solid bg-transparent' : 'border-hue-solid bg-hue-soft'} focus-visible:outline-2 focus-visible:outline-focus`}
        style={{
          top: block.start * pxPerMinute, height,
          left: `calc(${(lane / lanes) * 100}% + 2px)`,
          width: `calc(${100 / lanes}% - 4px)`,
        }}
      >
        <span className="block truncate font-medium">{ev.summary || t('Busy')}</span>
        {height >= 30 && <span className="block truncate text-hint opacity-80">{formatWallTime(toHHMM(block.start))}{ev.location ? ` · ${ev.location}` : ''}</span>}
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
        className={`block w-full truncate rounded-chip px-1.5 py-0.5 text-left text-hint text-hue ${ev.free ? 'border border-dashed border-hue-solid' : 'bg-hue-soft'} focus-visible:outline-2 focus-visible:outline-focus`}
      >
        {ev.summary || t('Busy')}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} label={ev.summary || t('Event')} width="sm:w-72" className="p-3" align="start">
        <EventDetails ev={ev} sub={sub} zone={zone} />
      </Popover>
    </>
  )
}
