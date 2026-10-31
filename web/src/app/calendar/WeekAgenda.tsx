import { useState } from 'react'
import { dayLoad, type GridPrefs } from '../../lib/calendar'
import type { DayData } from '../../lib/calendarDays'
import { formatDateParts } from '../../lib/dates'
import { formatMinutes } from '../../lib/duration'
import { t } from '../../lib/i18n'
import type { PlacedFrame } from '../../lib/frames'
import { slotCapacity, slotCount, slotName, type SlotView } from '../../lib/slots'
import type { Task } from '../../lib/types'
import { Button, hueFor, Icon, type HueName } from '../../ui'
import { act } from '../actionError'
import { completeWithUndo } from '../undoable'
import { CapacityLine } from './CapacityLine'
import { DeadlineDiamond, deadlineMark, DeadlineMarker } from './DeadlineMarker'
import { FrameHeading } from './FrameBand'
import type { DayMeetings } from './meetingCapacity'
import { formatTime } from './grid'
import { dayProjections, type ProjectionHue } from './DayColumn'
import { ProjectedItem } from './projections'

/**
 * The Week below 640 px: the days listed vertically, each with its capacity, its
 * unscheduled tasks and its timed blocks in time order; no seven-column grid. The
 * same selection, keyboard order and panel as the grid.
 */
export function WeekAgenda({ days, today, prefs, tasks, meetings, frames, taskMap, hueOf, projectionHue, deadlines, selectedId, onSelect, onOpen, onAdd }: {
  days: DayData[]
  /** Frame occurrences per date (calendar-frames D6): headings among the day's timed tasks. */
  frames?: Map<string, PlacedFrame[]>
  today: string
  prefs: GridPrefs
  tasks: Task[]
  /** Counted meetings per day, or null when this device does not count them. */
  meetings: Map<string, DayMeetings> | null
  taskMap: Map<string, Task>
  /** The hue of a task under Colour by (calendar-clarity D3). */
  hueOf: (task: Task) => HueName
  /** The hue of a projection's series (series-occurrences D3). */
  projectionHue?: ProjectionHue
  /** Deadline markers per date (calendar-clarity D1), after the day's tasks. */
  deadlines?: Map<string, Task[]>
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  /** An empty day's "Add a task": quick add with that day as the date. */
  onAdd: (date: string) => void
}) {
  const row = (task: Task, time: string | null, past: boolean, date: string) => (
    <li key={task.id}>
      <button type="button" data-cal-id={task.id} data-agenda-task={task.id} onClick={() => onSelect(task.id)} onDoubleClick={() => onOpen(task.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(task.id) } }}
        className={`ui-block flex min-h-11 w-full items-center gap-2 px-2 py-1 text-left text-body ${past || task.completed_at ? 'ui-block--past' : ''} ${selectedId === task.id ? 'ring-1 ring-accent' : ''}`}
        data-hue={hueOf(task)}>
        <span className="w-14 shrink-0 text-meta tabular-nums">{time ?? t('all day')}</span>
        <span className={`min-w-0 flex-1 truncate ${task.completed_at ? 'line-through' : ''}`}>{task.title || t('Untitled')}</span>
        {task.completed_at ? <span className="sr-only">{t('(completed)')}</span> : null}
        {task.deadline === date && !task.completed_at && <><DeadlineDiamond past={past} /><span className="sr-only">, {deadlineMark(task, date)}</span></>}
        {task.estimate_minutes ? <span className="shrink-0 text-hint tabular-nums">{formatMinutes(task.estimate_minutes)}</span> : null}
      </button>
    </li>
  )
  return (
    <div className="space-y-3 px-1 py-2" data-week-agenda>
      {days.map((d) => {
        const dd = Number(d.date.slice(8))
        const name = formatDateParts(d.date, { weekday: 'long' })
        // Projected occurrences are listed after the day's tasks, timed ones first (series-occurrences D3).
        const projected = dayProjections(d).sort((a, b) => (a.time ?? '99') < (b.time ?? '99') ? -1 : (a.time ?? '99') > (b.time ?? '99') ? 1 : 0)
        const load = dayLoad(tasks, d.date, prefs.dayLength, meetings?.get(d.date)?.minutes ?? 0, slotCapacity([...d.slots.values()]), projected)
        const blocks = d.layout.blocks.map((b) => ({ b, t: taskMap.get(b.id) })).filter((x): x is { b: typeof x.b; t: Task } => !!x.t)
        const dayFrames = [...(frames?.get(d.date) ?? [])].sort((a, b) => a.start - b.start)
        const dayDeadlines = deadlines?.get(d.date) ?? []
        // Each frame heading goes before the first timed task that starts at or after its start.
        const timed = [...dayFrames.map((f) => ({ at: f.start, order: 0, node: <FrameHeading key={`frame:${f.frame.id}`} occ={f} /> })),
          ...blocks.map(({ b, t: item }) => ({ at: b.start, order: 1, node: row(item, formatTime(b.start), d.date < today, d.date) })),
          ...[...d.slots.values()].map((v) => ({ at: v.start, order: 1, node: <AgendaSlot key={v.key} view={v} past={d.date < today} onOpen={onOpen} /> }))]
          .sort((a, b) => a.at - b.at || a.order - b.order)
        return (
          <section key={d.date} data-agenda-day={d.date} aria-labelledby={`agenda-${d.date}`}>
            <div className="flex items-baseline justify-between gap-2 border-b border-default px-2 pb-1">
              <h2 id={`agenda-${d.date}`} className={`text-body font-semibold ${d.date === today ? 'text-accent' : 'text-strong'}`}>{name} {dd}</h2>
              <CapacityLine load={load} dayLength={prefs.dayLength} />
            </div>
            {d.lane.length === 0 && blocks.length === 0 && d.slots.size === 0 && !dayDeadlines.length && !projected.length
              // One quiet line per empty day, as on Plan (precision-polish D5): seven filled buttons outweighed the days that have tasks.
              ? (
                <>
                  {dayFrames.length > 0 && <ul className="mt-1 space-y-0.5">{dayFrames.map((f) => <FrameHeading key={f.frame.id} occ={f} />)}</ul>}
                  <div className="mt-1 flex items-center justify-between gap-2 px-1" data-agenda-empty>
                    <span className="text-meta text-faint">{t('Nothing planned.')}</span>
                    <Button variant="ghost" size="sm" icon="plus" onClick={() => onAdd(d.date)}>{t('Add a task')}</Button>
                  </div>
                </>
              )
              : (
                <ul className="mt-1 space-y-0.5">
                  {d.lane.map((tk) => row(tk, null, d.date < today, d.date))}
                  {timed.map((x) => x.node)}
                  {dayDeadlines.map((tk) => <li key={`deadline:${tk.id}`} className="min-h-11 flex items-center"><DeadlineMarker task={tk} date={d.date} today={today} variant="row" onOpen={onOpen} /></li>)}
                  {projected.map((p) => <li key={p.id}><ProjectedItem p={p} hue={projectionHue?.(p)} variant="large" /></li>)}
                </ul>
              )}
          </section>
        )
      })}
    </div>
  )
}

/**
 * A slot on the phone's week agenda (calendar-slots D10): one row "Admin · 16:00–16:45 ·
 * 2 of 5" that expands in place to its checklist.
 */
function AgendaSlot({ view, past, onOpen }: { view: SlotView; past: boolean; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const rows = [...view.open, ...view.done]
  const name = slotName(view.slot)
  return (
    <li data-agenda-slot={view.slot.id}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className={`ui-block flex min-h-11 w-full items-center gap-2 px-2 py-1 text-left text-body ${past ? 'ui-block--past' : ''}`} data-hue={hueFor(view.slot.color)}>
        <span className="w-14 shrink-0 text-meta tabular-nums">{formatTime(view.start)}</span>
        <Icon name="layers" size="xs" className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{name} · <span className="tabular-nums">{formatTime(view.start)}–{formatTime(view.end)}</span> · <span className={view.overfull ? 'text-warning' : ''}>{view.overfull ? slotCount(view) : t('{done} of {total}', { done: view.done.length, total: rows.length })}</span></span>
        <Icon name="chevron-down" size="xs" className={`shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="ml-16 mt-0.5 space-y-0.5" aria-label={t('Tasks in {title}', { title: name })}>
          {rows.length === 0 && <li className="px-1 text-meta text-faint">{t('No tasks yet.')}</li>}
          {rows.map((task) => (
            <li key={task.id} data-agenda-slot-task={task.id} className="flex min-h-11 items-center gap-2 text-body">
              <button type="button" role="checkbox" aria-checked={!!task.completed_at} aria-label={task.title || t('Untitled')}
                className="touch-target inline-flex shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus"
                onClick={() => act(completeWithUndo(task.id, !task.completed_at))}>
                <Icon name={task.completed_at ? 'check' : 'circle'} size="sm" />
              </button>
              <button type="button" className={`min-h-11 min-w-0 flex-1 truncate text-left ${task.completed_at ? 'text-faint line-through' : ''}`} onClick={() => onOpen(task.id)}>{task.title || t('Untitled')}</button>
              {task.estimate_minutes ? <span className="shrink-0 text-hint tabular-nums text-muted">{formatMinutes(task.estimate_minutes)}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
