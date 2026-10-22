// The Day and Week grid columns (OpenSpec `time-blocking`): the hour gutter, each
// day's header with capacity and unscheduled lane, and the day column with its
// task blocks, calendar events, "+N" overflow lists, ghosts and the now line.
import { DAY_MINUTES, dayLoad, SLOT_MINUTES, type GridPrefs } from '../../lib/calendar'
import type { DayData } from '../../lib/calendarDays'
import { dateLocaleOf, formatHour } from '../../lib/dates'
import { formatMinutes } from '../../lib/duration'
import { t } from '../../lib/i18n'
import type { PlacedBlock, Overflow } from '../../lib/layout'
import type { CalendarSubscription, Project, Task } from '../../lib/types'
import { Button, hueFor, Tooltip } from '../../ui'
import { EventBlockView, EventChip } from '../CalendarEvents'
import type { useCalendarDrag } from '../calendarDrag'
import { ALL_DAY_CAP, toggleAllDay, useAllDayExpanded } from './allDayExpanded'
import { CapacityLine } from './CapacityLine'
import { formatTime, GRID_HEIGHT, PX_PER_MIN, RESIZE_ZONE_PX, type Preview } from './grid'

type DragStart = ReturnType<typeof useCalendarDrag>['start']

export function HourGutter() {
  return (
    <div className="relative w-12 shrink-0" style={{ height: GRID_HEIGHT }} aria-hidden>
      {Array.from({ length: 24 }, (_, h) => (
        <div key={h} className="absolute right-1 -translate-y-1/2 text-hint tabular-nums text-faint" data-hour-label style={{ top: h * 60 * PX_PER_MIN }}>
          {h === 0 ? '' : formatHour(h)}
        </div>
      ))}
    </div>
  )
}

export function DayHeader({ day, today, tasks, prefs, showName, selectedId, subMap, zone, laneTarget, onSelect, onOpen, onPointerDown, projectMap }: {
  day: DayData
  today: string
  tasks: Task[]
  prefs: GridPrefs
  showName: boolean
  selectedId: string | null
  subMap: Map<string, CalendarSubscription>
  zone?: string
  laneTarget: boolean
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onPointerDown: (e: React.PointerEvent, id: string) => void
  projectMap: Map<string, Project>
}) {
  const load = dayLoad(tasks, day.date, prefs.dayLength)
  const [y, m, d] = day.date.split('-').map(Number)
  const weekdayName = new Intl.DateTimeFormat(dateLocaleOf(), { weekday: 'short' }).format(new Date(y, m - 1, d))
  return (
    <div className="min-w-0 flex-1 border-l border-default px-1 pb-1 pt-1" data-day-header={day.date}>
      <div className="flex items-baseline justify-between gap-1 px-1">
        {showName ? (
          <span className={`truncate text-meta font-medium ${day.date === today ? 'text-accent' : 'text-muted'}`}>
            {weekdayName} {d}
          </span>
        ) : <span />}
        <Tooltip label={[load.over ? t('Over capacity.') : '', t('Planned estimates against a {minutes} day', { minutes: formatMinutes(prefs.dayLength) }) + (load.unestimated ? t('; {n} unestimated (counted as 0)', { n: load.unestimated }) : '')].filter(Boolean).join(' ')}>
          <CapacityLine load={load} dayLength={prefs.dayLength} unestimated focusable />
        </Tooltip>
      </div>
      {day.allDay.length > 0 && <AllDayStrip day={day} subMap={subMap} zone={zone} />}
      <div
        data-drop-lane={day.date}
        role="group"
        aria-label={t('Unscheduled on {date}', { date: day.date })}
        className={`mt-1 min-h-8 space-y-0.5 rounded-control border border-dashed p-0.5 ${laneTarget ? 'border-accent bg-accent-soft' : 'border-default'}`}
      >
        {day.lane.length === 0 && <span className="block px-1 py-1 text-hint text-faint">{t('Unscheduled')}</span>}
        {day.lane.map((task) => (
          <button
            key={task.id}
            type="button"
            data-cal-id={task.id}
            data-lane-task={task.id}
            onPointerDown={(e) => onPointerDown(e, task.id)}
            onClick={() => onSelect(task.id)}
            onDoubleClick={() => onOpen(task.id)}
            className={`ui-block ui-block--row flex w-full touch-manipulation items-center gap-1 truncate px-1.5 py-0.5 text-left text-meta ${day.date < today ? 'ui-block--past' : ''} ${selectedId === task.id ? 'ring-1 ring-accent' : ''}`}
            data-hue={hueFor(task.project_id ? projectMap.get(task.project_id)?.color : null)}
          >
            <span className="truncate">{task.title || t('Untitled')}</span>
            {task.estimate_minutes ? <span className="ml-auto shrink-0 text-hint tabular-nums">{formatMinutes(task.estimate_minutes)}</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

export function DayColumn({ day, prefs, isToday, isPast = false, nowMinutes, taskMap, projectMap, subMap, zone, selectedId, draggingId, expanded, setExpanded, preview, onSelect, onOpen, onDragStart }: {
  day: DayData
  prefs: GridPrefs
  isToday: boolean
  /** The day is before the logical today: its blocks are dimmed (surfaces-v2 D3). */
  isPast?: boolean
  nowMinutes: number
  taskMap: Map<string, Task>
  projectMap: Map<string, Project>
  subMap: Map<string, CalendarSubscription>
  zone?: string
  selectedId: string | null
  draggingId: string | null
  expanded: string | null
  setExpanded: (key: string | null) => void
  preview: Preview | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onDragStart: DragStart
}) {
  const startPx = prefs.startHour * 60 * PX_PER_MIN
  const endPx = prefs.endHour * 60 * PX_PER_MIN
  return (
    <div
      data-drop-day={day.date}
      className="relative min-w-0 flex-1 border-l border-default"
      style={{
        height: GRID_HEIGHT,
        // Hour lines, fainter 15-minute lines, in the theme's border colour.
        backgroundImage: 'linear-gradient(to bottom, var(--ot-border) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--ot-border) 45%, transparent) 1px, transparent 1px)',
        backgroundSize: `100% ${60 * PX_PER_MIN}px, 100% ${SLOT_MINUTES * PX_PER_MIN}px`,
      }}
    >
      {/* Outside the configured hours: shaded but still usable. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-sunken" style={{ height: startPx }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-sunken" style={{ top: endPx }} />

      {day.layout.blocks.filter((b) => !b.hidden).map((b) => {
        const ev = day.events.get(b.id)
        if (ev) {
          return <EventBlockView key={b.id} block={ev} lane={b.lane} lanes={b.lanes} overlap={b.overlap} pxPerMinute={PX_PER_MIN}
            minHeight={SLOT_MINUTES * PX_PER_MIN} sub={subMap.get(ev.event.subscriptionId)} zone={zone} />
        }
        const task = taskMap.get(b.id)
        const block = day.blocks.get(b.id)
        if (!task || !block) return null
        return <TaskBlock key={b.id} b={b} block={block} task={task} date={day.date} past={isPast} projectMap={projectMap} selected={selectedId === b.id}
          dragging={draggingId === b.id} onSelect={onSelect} onOpen={onOpen} onDragStart={onDragStart} />
      })}

      {day.layout.overflow.map((o) => (
        <OverflowStack key={`${day.date}:${o.start}`} o={o} day={day} taskMap={taskMap} selectedId={selectedId} expanded={expanded} setExpanded={setExpanded}
          onSelect={onSelect} onOpen={onOpen} onDragStart={onDragStart} />
      ))}

      {preview && (
        <div
          data-cal-id={preview.id}
          data-ghost
          className="pointer-events-none absolute inset-x-0.5 z-30 rounded-control border-2 border-dashed border-accent bg-accent/15 px-1.5 py-0.5 text-meta text-strong"
          style={{ top: preview.start * PX_PER_MIN, height: Math.max(SLOT_MINUTES, Math.min(preview.length, DAY_MINUTES - preview.start)) * PX_PER_MIN }}
        >
          <span className="text-hint tabular-nums">{formatTime(preview.start)}</span> <span className="truncate">{preview.title || t('Untitled')}</span>
        </div>
      )}

      {isToday && nowMinutes < DAY_MINUTES && (
        <div data-now-line className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-danger" style={{ top: nowMinutes * PX_PER_MIN }}>
          <span className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-danger" />
        </div>
      )}
    </div>
  )
}

/** One task block: drag to move, drag its lower edge to resize, double-click to open. */
function TaskBlock({ b, block, task, date, past, projectMap, selected, dragging, onSelect, onOpen, onDragStart }: {
  b: PlacedBlock
  block: NonNullable<ReturnType<DayData['blocks']['get']>>
  task: Task
  date: string
  past: boolean
  projectMap: Map<string, Project>
  selected: boolean
  dragging: boolean
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onDragStart: DragStart
}) {
  const top = b.start * PX_PER_MIN
  const height = Math.max(SLOT_MINUTES * PX_PER_MIN, (b.end - b.start) * PX_PER_MIN)
  // Project colours render through the palette hue (design-system "Stored colours render through the palette").
  const hue = hueFor(task.project_id ? projectMap.get(task.project_id)?.color : null)
  const ghost = dragging ? 'opacity-40' : '' // tone-lint-allow: the dragged block's ghost
  return (
    <div
      data-cal-id={b.id}
      data-block={b.id}
      data-overlap={b.overlap || undefined}
      data-estimated={block.estimated || undefined}
      data-hue={hue}
      role="button"
      tabIndex={-1}
      onPointerDown={(e) => {
        // The lowest few pixels (handle and border) resize; the rest moves the block.
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        if (e.clientY >= rect.bottom - Math.min(RESIZE_ZONE_PX, rect.height / 3)) onDragStart(e, { taskId: b.id, kind: 'resize', blockStart: block.start, blockDate: date })
        else onDragStart(e, { taskId: b.id, kind: 'move', grabOffset: e.clientY - rect.top })
      }}
      onClick={() => onSelect(b.id)}
      onDoubleClick={() => onOpen(b.id)}
      // Filled, not outlined (surfaces-v2 D1): the project's soft fill, a hue edge, strong text; dashed edge without an estimate.
      className={`ui-block absolute z-10 cursor-grab touch-manipulation overflow-hidden px-1.5 ${height < 20 ? 'py-0 text-hint leading-[10px]' : 'py-0.5 text-meta'} ${block.estimated ? '' : 'ui-block--dashed'} ${past ? 'ui-block--past' : ''} ${selected ? 'ring-2 ring-accent' : ''} ${ghost}`}
      style={{
        top, height,
        left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
        width: `calc(${100 / b.lanes}% - 4px)`,
      }}
    >
      {/* Named by its content (WCAG 2.5.3 Label in Name): the spoken text is visually hidden, the visible one is not read twice. */}
      <span className="sr-only">{[task.title || t('Untitled'), block.estimated ? t('{time} for {duration}', { time: formatTime(block.start), duration: formatMinutes(task.estimate_minutes!) }) : t('{time}, no estimate', { time: formatTime(block.start) }), b.overlap ? t('overlaps another item') : ''].filter(Boolean).join(', ')}</span>
      <div aria-hidden className="flex items-start gap-1">
        <span className="min-w-0 flex-1 truncate font-medium">{task.title || t('Untitled')}</span>
        {b.overlap && <span data-overlap-marker className="shrink-0 text-warning" aria-hidden>⧉</span>}
      </div>
      {height >= 30 && (
        <div aria-hidden className="truncate text-hint tabular-nums">
          {formatTime(block.start)}–{formatTime(block.end === DAY_MINUTES ? DAY_MINUTES - 1 : block.end)}
          {block.estimated && <span className="ml-1">{formatMinutes(task.estimate_minutes!)}</span>}
        </div>
      )}
      <div
        data-resize-handle
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize touch-none hover:bg-accent/30"
      />
    </div>
  )
}

/** A "+N" marker of overlapping items and, while open, the list of them. */
function OverflowStack({ o, day, taskMap, selectedId, expanded, setExpanded, onSelect, onOpen, onDragStart }: {
  o: Overflow
  day: DayData
  taskMap: Map<string, Task>
  selectedId: string | null
  expanded: string | null
  setExpanded: (key: string | null) => void
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onDragStart: DragStart
}) {
  const key = `${day.date}:${o.start}`
  const open = expanded === key
  return (
    <div className="absolute z-20" style={{ top: o.start * PX_PER_MIN, left: `calc(${(o.lane / o.lanes) * 100}% + 2px)`, width: `calc(${100 / o.lanes}% - 4px)` }}>
      <Tooltip label={t('{count} more overlapping items', { count: o.ids.length })}>
        <button
          type="button"
          data-overflow={o.ids.length}
          className="w-full rounded-control border border-input bg-canvas px-1 dark:bg-raised py-0.5 text-meta font-medium text-muted hover:bg-sunken"
          onClick={() => setExpanded(open ? null : key)}
          aria-expanded={open}
        >
          +{o.ids.length}
        </button>
      </Tooltip>
      {open && (
        <ul className="mt-1 w-48 space-y-0.5 rounded-control border border-default bg-surface p-1 shadow-2">
          {o.ids.map((id) => {
            const ev = day.events.get(id)
            if (ev) {
              return (
                <li key={id} data-overflow-event={ev.event.id} className="flex gap-1 truncate px-1 py-0.5 text-meta text-muted">
                  <span className="text-hint tabular-nums">{formatTime(ev.start)}</span>
                  <span className="truncate">{ev.event.summary || t('Busy')}</span>
                </li>
              )
            }
            const tk = taskMap.get(id)
            const blk = day.blocks.get(id)
            return (
              <li key={id}>
                <button
                  type="button"
                  data-cal-id={id}
                  onPointerDown={(e) => onDragStart(e, { taskId: id, kind: 'move' })}
                  onClick={() => onSelect(id)}
                  onDoubleClick={() => onOpen(id)}
                  className={`flex w-full gap-1 truncate rounded-control px-1 py-0.5 text-left text-meta ${selectedId === id ? 'bg-accent-soft' : 'hover:bg-sunken dark:hover:bg-raised'}`}
                >
                  <span className="text-hint tabular-nums text-muted">{blk ? formatTime(blk.start) : ''}</span>
                  <span className="truncate">{tk?.title || t('Untitled')}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** The all-day strip: at most three items, then "+N" to show the rest on this device (surfaces-v2 D4). */
function AllDayStrip({ day, subMap, zone }: { day: DayData; subMap: Map<string, CalendarSubscription>; zone?: string }) {
  const expanded = useAllDayExpanded().has(day.date)
  const capped = day.allDay.length > ALL_DAY_CAP
  const shown = capped && !expanded ? day.allDay.slice(0, ALL_DAY_CAP) : day.allDay
  return (
    <div className="mt-1" data-all-day={day.date}>
      <ul className="space-y-0.5" aria-label={t('All-day events on {date}', { date: day.date })}>
        {shown.map((ev) => <li key={ev.id}><EventChip ev={ev} sub={subMap.get(ev.subscriptionId)} zone={zone} /></li>)}
      </ul>
      {capped && (
        <Button variant="ghost" size="sm" className="mt-0.5 w-full justify-start" aria-expanded={expanded} data-all-day-more={day.date}
          onClick={() => toggleAllDay(day.date)}>
          {expanded ? t('Show less') : `+${day.allDay.length - ALL_DAY_CAP}`}
        </Button>
      )}
    </div>
  )
}
