// One timed event in a day column, laid out with the task blocks (OpenSpec changes
// calendar-feeds D8 and calendar-event-edits D7). An event whose `access.update` is true is a
// third block kind: it moves, and resizes by either edge, with the task blocks' drag layer
// (`event:<id>`); a queued change draws it as saving, a failed one says so; any other event is
// a read-only button whose tooltip says why. Every event opens the same popover.
import { formatTime as toHHMM, type EventBlock } from '../../lib/calendar'
import { formatTime as formatWallTime } from '../../lib/dates'
import { eventAccessText } from '../../lib/calendarEventEdits'
import type { CalendarSubscription, EventCommand } from '../../lib/types'
import { t } from '../../lib/i18n'
import { Tooltip } from '../../ui'
import { eventLabel, useEventDetails } from '../CalendarEvents'
import type { useCalendarDrag } from '../calendarDrag'
import { resizeZone } from './grid'

type DragStart = ReturnType<typeof useCalendarDrag>['start']

export function EventBlockView({ block, date, lane, lanes, overlap, pxPerMinute, minHeight, sub, zone, selected = false, dragging = false, command, onDragStart, onSelect }: {
  block: EventBlock
  /** The day column the block is drawn in. */
  date: string
  lane: number
  lanes: number
  overlap: boolean
  pxPerMinute: number
  minHeight: number
  sub?: CalendarSubscription
  zone?: string
  selected?: boolean
  dragging?: boolean
  /** The queued change of this event, if any. */
  command?: EventCommand
  onDragStart?: DragStart
  onSelect?: (id: string) => void
}) {
  const ev = block.event
  const details = useEventDetails(ev, sub, zone)
  const height = Math.max(minHeight, (block.end - block.start) * pxPerMinute)
  const movable = !!ev.access?.update && !!onDragStart
  const locked = ev.access && !ev.access.update ? eventAccessText(ev.access.reason) : ''
  const saving = !!command && !command.failed
  const dim = saving || dragging ? 'opacity-60' : '' // tone-lint-allow: a dragged or saving event's ghost
  return (
    <>
      <Tooltip label={[eventLabel(ev, sub, zone), locked, command?.failed ? t('Not saved to your calendar') : ''].filter(Boolean).join('. ')} side="right">
      <button
        {...details.trigger}
        data-event={ev.id}
        data-cal-id={block.id}
        data-drag-id="calendar-event"
        data-overlap={overlap || undefined}
        data-event-failed={command?.failed ? '' : undefined}
        aria-busy={saving || undefined}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (!movable) return
          onSelect?.(block.id)
          // The lowest and highest few pixels resize, as on a task block; the rest moves it.
          const rect = e.currentTarget.getBoundingClientRect()
          const edge = resizeZone(rect.height, e.pointerType)
          if (e.clientY >= rect.bottom - edge) onDragStart!(e, { taskId: block.id, kind: 'resize', blockStart: block.start, blockDate: date })
          else if (e.clientY <= rect.top + edge) onDragStart!(e, { taskId: block.id, kind: 'resize-start', blockEnd: block.end, blockDate: date })
          else onDragStart!(e, { taskId: block.id, kind: 'move', grabOffset: e.clientY - rect.top })
        }}
        className={`absolute z-10 overflow-hidden px-1.5 text-start ${movable ? 'cursor-grab touch-manipulation' : ''} ${height < 20 ? 'py-0 text-hint leading-none' : 'py-0.5 text-meta'} ${ev.free ? 'rounded-control border border-dashed border-hue-solid bg-transparent text-hue' : 'ui-block ui-block--event'} ${dim} ${selected ? 'ring-2 ring-accent' : ''} focus-visible:outline-2 focus-visible:outline-focus`}
        style={{
          top: block.start * pxPerMinute, height,
          insetInlineStart: `calc(${(lane / lanes) * 100}% + 2px)`,
          width: `calc(${100 / lanes}% - 4px)`,
        }}
      >
        <span className="flex min-w-0 items-center gap-1 font-medium">{!ev.free && <span aria-hidden className="ui-block-dot" />}<span dir="auto" className="truncate">{ev.summary || t('Busy')}</span></span>
        {/* Named by its visible summary, then the time, location and calendar as hidden text (WCAG 2.5.3 Label in Name): the short time line below is not read twice. */}
        <span className="sr-only">{eventLabel(ev, sub, zone).slice((ev.summary || t('Busy')).length)}</span>
        {height >= 30 && <span aria-hidden className="block truncate text-hint tabular-nums" data-event-time>{formatWallTime(toHHMM(block.start))}{ev.location ? ` · ${ev.location}` : ''}</span>}
        {movable && <span data-resize-start-handle aria-hidden className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize touch-none" />}
        {movable && <span data-resize-handle aria-hidden className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize touch-none" />}
      </button>
      </Tooltip>
      {details.popover}
    </>
  )
}
