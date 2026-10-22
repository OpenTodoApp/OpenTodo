// The rows and the capacity bar of the Plan (OpenSpec change planner-view, design
// D3 and D5), shared by the columns and the phone agenda. A task row shows its time,
// title, estimate and priority in the one row language (rows-v2: the column already
// says the day, so no date words; only P1 and P2 are coloured and the time only when
// overdue or timed today). Projected rows are dimmed, read-only
// and never selected; event rows are read-only buttons that open their details.
import type { EventBlock } from '../../lib/calendar'
import { formatTime } from '../../lib/dates'
import { formatMinutes } from '../../lib/duration'
import { t } from '../../lib/i18n'
import { formatPlanLoad, planLoadTooltip, type PlanEntry, type PlanLoad, type Projection } from '../../lib/plan'
import type { CalendarEvent, CalendarSubscription, Project, Task } from '../../lib/types'
import { hueFor, Icon, Tooltip } from '../../ui'
import { EventChip, EventRow } from '../CalendarEvents'
import { dueTone, PRIORITY_RING } from '../rowTone'

/** One day of the Plan: its rows, its events and its load. */
export interface PlanDayData {
  date: string
  entries: PlanEntry[]
  events: EventBlock[]
  allDay: CalendarEvent[]
  load: PlanLoad
}

/** The time's colour (rows-v2, rowTone's dueTone): overdue is loud; a timed task due today is in the accent, everything else muted. */
function timeTone(date: string, today: string): string {
  const tone = dueTone(date < today ? 'overdue' : date === today ? 'today' : 'later', true)
  return tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent' : 'text-muted'
}

export function PlanTaskRow({ task, date, time, today, selected, canEdit, project, large, onPointerDown, onSelect, onOpen }: {
  task: Task
  date: string
  time?: string
  today: string
  selected: boolean
  canEdit: boolean
  project?: Project
  /** The phone agenda's 44 px rows. */
  large?: boolean
  onPointerDown?: (e: React.PointerEvent) => void
  onSelect: () => void
  onOpen: () => void
}) {
  const priority = task.priority < 4 ? PRIORITY_RING[task.priority] : null
  return (
    <button type="button" tabIndex={large ? 0 : -1} data-plan-task={task.id} data-hue={hueFor(project?.color ?? null)} aria-pressed={selected}
      onPointerDown={canEdit ? onPointerDown : undefined}
      onClick={(e) => { e.stopPropagation(); if (selected && large) onOpen(); else onSelect() }}
      onDoubleClick={onOpen}
      onKeyDown={large ? (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onOpen() } } : undefined}
      className={`flex w-full min-w-0 touch-manipulation items-center gap-x-1 rounded-chip border-l-3 border-l-hue-solid px-1 text-left ${large ? 'min-h-11 py-1 text-body' : 'flex-wrap py-0.5 text-meta'} ${selected ? 'bg-accent-soft ring-1 ring-accent' : 'bg-sunken dark:bg-raised'} ${canEdit ? 'cursor-grab' : ''}`}>
      {/* Named by its visible content (WCAG 2.5.3 Label in Name), in reading order; only "read-only" has no visible text. */}
      {time && <span data-plan-time className={`shrink-0 tabular-nums ${timeTone(date, today)}`}>{formatTime(time)}</span>}
      {/* In a column the title takes the first line and the time, estimate and priority the second (seven columns are narrow). */}
      <span className={`min-w-0 flex-1 truncate ${large ? '' : 'order-first basis-full'}`}>{task.title || t('Untitled')}</span>
      {task.estimate_minutes ? <span data-estimate className="shrink-0 text-hint tabular-nums text-muted">{formatMinutes(task.estimate_minutes)}</span> : null}
      {/* The row's priority ring (rows-v2): coloured for P1 and P2, neutral for P3; read as "P1". */}
      {priority && (
        <span data-priority={task.priority} className="inline-flex shrink-0 items-center">
          <span aria-hidden data-priority-dot className={`h-2.5 w-2.5 rounded-full border-2 ${priority}`} /><span className="sr-only">P{task.priority}</span>
        </span>
      )}
      {!canEdit && <span className="sr-only">{`, ${t('read-only')}`}</span>}
    </button>
  )
}

/** A projected occurrence: dimmed, read-only, never selected, dragged or written. */
export function ProjectedRow({ projection, large }: { projection: Projection; large?: boolean }) {
  return (
    <div data-plan-projected={projection.id} className={`flex w-full min-w-0 items-center gap-x-1 rounded-chip border border-dashed border-default px-1 text-faint ${large ? 'min-h-11 py-1 text-body' : 'flex-wrap py-0.5 text-meta'}`}>
      <span className="sr-only">{[projection.title || t('Untitled'), t('projected'), projection.time ? formatTime(projection.time) : '', projection.estimate_minutes ? formatMinutes(projection.estimate_minutes) : ''].filter(Boolean).join(', ')}</span>
      <span aria-hidden className="inline-flex shrink-0"><Icon name="repeat" size="xs" /></span>
      {projection.time && <span aria-hidden className="shrink-0 tabular-nums">{formatTime(projection.time)}</span>}
      <span aria-hidden className={`min-w-0 flex-1 truncate ${large ? '' : 'order-first basis-full'}`}>{projection.title || t('Untitled')}</span>
      {projection.estimate_minutes ? <span aria-hidden className="shrink-0 text-hint tabular-nums">{formatMinutes(projection.estimate_minutes)}</span> : null}
    </div>
  )
}

/** The day's capacity: three stacked segments against the day length, the figure and its tooltip carry the meaning. */
export function CapacityBar({ load, dayLength, eventHue }: { load: PlanLoad; dayLength: number; eventHue?: string }) {
  const pct = (m: number) => `${Math.min(100, (m / Math.max(1, dayLength)) * 100)}%`
  return (
    <div className="min-w-0" data-plan-capacity>
      <div aria-hidden className={`flex h-1.5 w-full overflow-hidden rounded-full ${load.over ? 'bg-danger-soft' : 'bg-sunken dark:bg-raised'}`}>
        {load.tasks > 0 && <span className="h-full bg-accent" style={{ width: pct(load.tasks) }} data-segment="tasks" />}
        {load.events > 0 && <span className="h-full bg-hue-solid" data-hue={eventHue} style={{ width: pct(load.events) }} data-segment="events" />}
        {load.projected > 0 && <span className="h-full bg-accent-soft" style={{ width: pct(load.projected) }} data-segment="projected" />}
      </div>
      <Tooltip label={planLoadTooltip(load, dayLength)}>
        <span data-capacity data-over={load.over || undefined}
          className={`mt-0.5 block whitespace-nowrap text-hint tabular-nums ${load.over ? 'font-semibold text-danger' : 'text-muted'}`}>
          {formatPlanLoad(load, dayLength)}
          {load.over && <span className="sr-only">{' '}{t('over capacity')}</span>}
        </span>
      </Tooltip>
    </div>
  )
}

/** The rows of one day: all-day chips, timed events, then tasks and projections in the column's order. */
export function PlanDayRows({ day, today, selectedId, large, editable, projectMap, subMap, zone, onPointerDown, onSelect, onOpen }: {
  day: PlanDayData
  today: string
  selectedId: string | null
  large?: boolean
  editable: (task: Task) => boolean
  projectMap: Map<string, Project>
  subMap: Map<string, CalendarSubscription>
  zone?: string
  onPointerDown: (task: Task, e: React.PointerEvent) => void
  onSelect: (id: string, date: string) => void
  onOpen: (id: string) => void
}) {
  return (
    <div className="space-y-0.5">
      {day.allDay.map((ev) => <EventChip key={ev.id} ev={ev} sub={subMap.get(ev.subscriptionId)} zone={zone} />)}
      {day.events.map((b) => <EventRow key={b.id} ev={b.event} start={b.start} end={b.end} sub={subMap.get(b.event.subscriptionId)} zone={zone} />)}
      {day.entries.map((entry) => entry.kind === 'projected'
        ? <ProjectedRow key={entry.projection.id} projection={entry.projection} large={large} />
        : (
          <PlanTaskRow key={entry.task.id} task={entry.task} date={day.date} time={entry.time} today={today} large={large}
            selected={selectedId === entry.task.id} canEdit={editable(entry.task)} project={entry.task.project_id ? projectMap.get(entry.task.project_id) : undefined}
            onPointerDown={(e) => onPointerDown(entry.task, e)} onSelect={() => onSelect(entry.task.id, day.date)} onOpen={() => onOpen(entry.task.id)} />
        ))}
    </div>
  )
}
