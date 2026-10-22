// The rows and the capacity bar of the Plan (OpenSpec change planner-view, design
// D3 and D5), shared by the columns and the phone agenda. A task is the one row in its
// compact shape (rows-v2 D8: time, title, estimate and priority ring; the column says
// the day). Projected rows are dimmed, read-only and never selected; event rows are
// read-only buttons that open their details.
import type { EventBlock } from '../../lib/calendar'
import { formatTime } from '../../lib/dates'
import { formatMinutes } from '../../lib/duration'
import { t } from '../../lib/i18n'
import { formatPlanLoad, planLoadTooltip, type PlanEntry, type PlanLoad, type Projection } from '../../lib/plan'
import type { CalendarEvent, CalendarSubscription, Project, Task } from '../../lib/types'
import { Icon, Tooltip } from '../../ui'
import { EventChip, EventRow } from '../CalendarEvents'
import { TaskRow } from '../TaskRow'

/** One day of the Plan: its rows, its events and its load. */
export interface PlanDayData {
  date: string
  entries: PlanEntry[]
  events: EventBlock[]
  allDay: CalendarEvent[]
  load: PlanLoad
}

/** A task in the Plan: the one row in its compact shape (rows-v2 D8), placed on the column's day. */
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
  return (
    <TaskRow shape="compact" task={task} date={date} time={time} today={today} selected={selected} readOnly={!canEdit} project={project} large={large}
      onPointerDown={onPointerDown} onSelect={onSelect} onOpen={onOpen} attrs={{ 'data-plan-task': task.id }} />
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
