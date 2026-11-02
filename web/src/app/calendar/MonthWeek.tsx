// One week row of a Month grid (OpenSpec month-view, split out of MonthView for
// year-view): the seven day cells with their rows, "+N more", the capacity line and the
// week's span bars. With several months stacked (year-view D1) a row belongs to one
// month: the days of the other month are empty cells, so no day appears twice.
import type { ReactNode } from 'react'
import { dayLoad, formatLoad } from '../../lib/calendar'
import { t } from '../../lib/i18n'
import { visibleRows } from '../../lib/month'
import type { Projection } from '../../lib/occurrences'
import { slotCapacity, type SlotView } from '../../lib/slots'
import { spanCovers } from '../../lib/span'
import type { DaySpan } from '../../lib/calendarDays'
import type { CalendarEvent, Task } from '../../lib/types'
import type { DayEvents, EventBlock } from '../../lib/calendar'
import type { HueName } from '../../ui'
import { addHandlers } from './DayColumn'
import type { AddHere } from './addHere'
import { CapacityLine, capacityState } from './CapacityLine'
import { MonthWeekBand } from './monthSpans'
import { dayDrag, ProjectedItem } from './projections'
import { bandLayout } from './spanModel'

/** Task rows a desktop cell shows before "+N more". */
export const CELL_ROWS = 3

/** A cell's row: a task, a deadline, a projected occurrence or a subscribed calendar's event (all-day without `block`). */
export type CellEntry = { kind: 'task'; task: Task } | { kind: 'deadline'; task: Task } | { kind: 'projected'; projection: Projection } | { kind: 'event'; event: CalendarEvent; block?: EventBlock }
export const NO_PROJECTIONS: readonly Projection[] = []

/** What every cell of the grid reads: the month's data and the view's callbacks. */
export interface MonthCells {
  today: string
  focused: string
  expanded: string | null
  narrow: boolean
  selectedId: string | null
  cells: ReadonlyMap<string, Task[]>
  spans: readonly DaySpan[]
  projected: ReadonlyMap<string, Projection[]>
  shownViewed: readonly Task[]
  dayLength: number
  meetings: ReadonlyMap<string, { minutes: number }> | null | undefined
  slotViews: ReadonlyMap<string, SlotView[]>
  /** A day of the grid outside the one month shown (dimmed). */
  outside: (d: string) => boolean
  add: AddHere
  entries: (d: string, projected: readonly Projection[]) => CellEntry[]
  row: (task: Task) => ReactNode
  deadlineRow: (task: Task, d: string) => ReactNode
  /** The shown events per day (calendar-events-all-views): rows after the day's tasks, a mark on a phone. */
  events: ReadonlyMap<string, DayEvents>
  eventRow: (e: { event: CalendarEvent; block?: EventBlock }) => ReactNode
  hueOf: (task: Task) => HueName
  projectionHue: (p: Projection) => HueName | undefined
  stored: (id: string) => Task | undefined
  focus: (d: string) => void
  expand: (d: string | null) => void
  select: (id: string | null) => void
  open: (id: string) => void
}

export function MonthWeek({ week, own, c }: {
  week: readonly string[]
  /** The month the row belongs to when months are stacked: its days only, the band cut to them. */
  own?: { month: string; from: string; to: string }
  c: MonthCells
}) {
  const ownDay = (d: string) => !own || d.slice(0, 7) === own.month
  // The week row's span bars (multi-day-tasks D3), above the cells' rows; on a phone the cells count them instead.
  const weekOpen = !!c.expanded && week.includes(c.expanded) && ownDay(c.expanded)
  const band = c.narrow ? null : bandLayout(week, c.spans, weekOpen ? Infinity : CELL_ROWS, own)
  const lanes = band?.lanes ?? 0
  return (
    <div role="row" className="relative grid grid-cols-7">
      {week.map((d) => {
        if (!ownDay(d)) return <div key={d} role="gridcell" data-month-empty className="min-w-0 border-b border-l border-default first:border-l-0" />
        const list = c.cells.get(d) ?? []
        const dayProjected = c.projected.get(d) ?? NO_PROJECTIONS
        const entries = c.entries(d, dayProjected.filter((p) => !p.spanFirst))
        const daySpans = c.narrow ? c.spans.filter((x) => x.kind === 'task' && spanCovers(x.span, d)).length : 0
        const load = dayLoad(c.shownViewed, d, c.dayLength, c.meetings?.get(d)?.minutes ?? 0, slotCapacity(c.slotViews.get(d)), dayProjected)
        const open = c.expanded === d
        const rows = open ? { shown: entries, hidden: 0 } : visibleRows(entries, Math.max(0, CELL_ROWS - lanes))
        const shown = rows.shown, hidden = rows.hidden + (open ? 0 : band?.hiddenOn.get(d) ?? 0)
        const isFocused = d === c.focused
        const n = list.length + daySpans
        const dayEvents = c.events.get(d)
        const eventCount = dayEvents ? dayEvents.allDay.length + dayEvents.timed.length : 0
        return (
          <div key={d} role="gridcell" tabIndex={isFocused ? 0 : -1} data-month-day={d} data-drop-target={`day:${d}`}
            aria-selected={isFocused} aria-current={d === c.today ? 'date' : undefined}
            onClick={() => { c.focus(d); c.select(null) }}
            // Adding with the pointer (calendar-clarity D2): double-click, right-click or a long press on an empty part.
            {...addHandlers(c.add, () => ({ date: d }))}
            onFocus={(e) => { if (e.target === e.currentTarget) c.focus(d) }}
            className={`relative min-w-0 border-b border-l border-default p-1 outline-none first:border-l-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-2px] focus-visible:outline-focus data-[drop-active]:bg-accent-soft ${c.narrow ? 'min-h-14' : 'min-h-28'} ${c.outside(d) ? 'bg-sunken text-faint' : ''} ${isFocused ? 'bg-accent-soft/40' : 'pointer-fine:hover:bg-hover'}`}>
            {/* Named by its content (WCAG 2.5.3 Label in Name): the date and counts first, then the tasks' own names. */}
            <span className="sr-only">{[d, n ? t('{n, plural, one {# task} other {# tasks}}', { n }) : '', eventCount ? t('{n, plural, one {# event} other {# events}}', { n: eventCount }) : '', capacityState(load)].filter(Boolean).join(', ')}</span>
            {/* The load wraps under the date when the cell is too narrow for both and is cut
                short within the cell, never past it: in the last column it made the grid
                scroll sideways (a Sunday "today" at 768 px). */}
            <div aria-hidden className="mb-0.5 flex min-w-0 flex-wrap items-center justify-between gap-x-1">
              <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-meta tabular-nums ${d === c.today ? 'bg-accent font-semibold text-on-accent' : ''}`}>{Number(d.slice(8))}</span>
              {!c.narrow && load.planned > 0 && <CapacityLine load={load} dayLength={c.dayLength} sayOver={false} title={formatLoad(load, c.dayLength)} className="min-w-0 max-w-full truncate" />}
            </div>
            {c.narrow ? (
<>
                {n > 0 && <span aria-hidden data-month-count className="block text-center text-meta font-medium text-default">{n}</span>}
                {/* A day with events on a phone: a small hatched mark under the count, the events listed under the grid. */}
                {eventCount > 0 && <span aria-hidden data-month-event-mark className="ui-event-mark mx-auto mt-0.5 block" />}
              </>
            ) : (
              <div className="space-y-0.5">
                {lanes > 0 && <div aria-hidden data-span-spacer style={{ height: lanes * 26 }} />}
                {shown.map((e) => (e.kind === 'task' ? c.row(e.task) : e.kind === 'projected' ? <ProjectedItem key={e.projection.id} p={e.projection} hue={c.projectionHue(e.projection)} variant="row" className="px-1" onDrag={dayDrag(e.projection)} /> : e.kind === 'event' ? c.eventRow(e) : c.deadlineRow(e.task, d)))}
                {hidden > 0 && (
                  <button type="button" tabIndex={-1} data-month-more={hidden} aria-expanded={false}
                    onClick={(e) => { e.stopPropagation(); c.expand(d) }}
                    className="w-full rounded-chip px-1 text-left text-hint font-medium text-muted hover:bg-sunken dark:hover:bg-raised">
                    {t('+{hidden} more', { hidden })}
                  </button>
                )}
                {open && entries.length > CELL_ROWS && (
                  <button type="button" tabIndex={-1} aria-expanded onClick={(e) => { e.stopPropagation(); c.expand(null) }}
                    className="w-full rounded-chip px-1 text-left text-hint text-muted hover:bg-sunken dark:hover:bg-raised">{t('Show less')}</button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {lanes > 0 && <MonthWeekBand days={week} spans={c.spans} today={c.today} maxLanes={weekOpen ? Infinity : CELL_ROWS} selectedId={c.selectedId} hueOf={c.hueOf} projectionHue={c.projectionHue}
        within={own} onSelect={c.select} onOpen={c.open} stored={c.stored} />}
    </div>
  )
}
