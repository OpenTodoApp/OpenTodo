// The When control of the task panel (OpenSpec change ux-overhaul, web-app "Task
// panel layout", design D4): one editor composing the due date and time, Start
// (Anytime, a date, Someday), Deadline, Repeat and Reminders as segments under a
// shared header and footer; the part of the day is Do on's time of day row
// (when-picker). Every segment is the editor it replaces and writes exactly the
// fields it wrote before.
import { habitRule } from '../../lib/habits'
import { useSeriesRecords } from '../../lib/localData'
import { lazy, Suspense, type KeyboardEvent, type RefObject, useEffect, useRef, useState, type ReactNode } from 'react'
import { dueFromView, localDueOf, logicalToday, quickChoices, weekday } from '../../lib/dates'
import { setRecurrence, unparkTask, updateTask } from '../../lib/ops'
import { parseRule } from '../../lib/recurrence'
import type { WhenSegmentId } from '../../lib/facets'
import type { Task } from '../../lib/types'
import { Button, Icon, type IconName, SegmentedControl, Switch } from '../../ui'
import { DatePicker } from '../datetime/DatePicker'
import { TimeField } from '../datetime/TimeField'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { RecurrenceField } from '../RecurrenceField'
import { RemindersField } from '../RemindersField'
import { doOnWithUndo, parkWithUndo, setDueWithUndo } from '../undoable'
import { ZoneControl } from './ZoneControl'
import { useViewerZone } from '../useViews'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { useResetOnChange } from '../../lib/useResetOnChange'
import { DAY_PARTS, dayPartName, dayPartOf, dayPartsOn, type DayPart, type DoOnChoice } from '../../lib/dayParts'
import { useUserPrefsRow } from '../../lib/localData'
import { formatSpan, multiDayOnPatch, spanOf } from '../../lib/span'
import { useTimeSectors } from '../../lib/sectorPrefs'
import { SectorChoice } from './SectorChoice'
// The habit section loads with the first habit (habits-home): none of it is on the first load.
const HabitSection = lazy(() => import('../habits/HabitSection').then((m) => ({ default: m.HabitSection })))

export type WhenSegment = 'due' | 'start' | 'sector' | 'deadline' | 'repeat' | 'reminders'

const FOCUSABLE = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'

function Segment({ id, icon, label, bare = false, children }: { id: WhenSegment; icon: IconName; label: string; bare?: boolean; children: ReactNode }) {
  // In the popover the segment's name is the selected tab above it.
  return (
    <div data-when-segment={id} role="group" aria-label={label} className="space-y-1.5">
      {!bare && <p className="flex items-center gap-1.5 text-meta font-medium text-muted"><Icon name={icon} size="xs" className="text-faint" />{label}</p>}
      {children}
    </div>
  )
}

/** The segments of the When popover, in order (task-panel-facets D3); the part of the day lives in Do on. */
export const WHEN_SEGMENTS: { id: WhenSegmentId; icon: IconName; label: () => string }[] = [
  { id: 'due', icon: 'calendar-days', label: () => t('Do on') },
  { id: 'start', icon: 'calendar-range', label: () => t('Start') },
  // Shown while time sectors are on or the task has a sector (time-sectors D6).
  { id: 'sector', icon: 'calendar-range', label: () => t('Sector') },
  { id: 'deadline', icon: 'hourglass', label: () => t('Deadline') },
  { id: 'repeat', icon: 'repeat', label: () => t('Repeat') },
  { id: 'reminders', icon: 'alarm-clock', label: () => t('Reminders') },
]

/** Whether the When popover offers the Sector segment for a task (time-sectors D6, D7). */
export function useSectorSegment(task: Pick<Task, 'sector'>): boolean {
  return useTimeSectors() || !!task.sector
}

/** The segmented control in the When popover's header: one segment shown at a time. */
export function WhenSegmentPicker({ value, onChange, sector = false }: { value: WhenSegmentId; onChange: (id: WhenSegmentId) => void; sector?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const segments = WHEN_SEGMENTS.filter((sg) => sector || sg.id !== 'sector')
  const move = (e: KeyboardEvent, i: number) => {
    const n = segments.length
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (next < 0) return
    e.preventDefault()
    onChange(segments[next].id)
    refs.current[next]?.focus()
  }
  return (
    <div role="tablist" aria-label={t('When')} className="ui-scroller -mx-1 flex gap-0.5 overflow-x-auto" data-when-segments>
      {segments.map((sg, i) => (
        <button key={sg.id} ref={(el) => { refs.current[i] = el }} type="button" role="tab" aria-selected={value === sg.id} tabIndex={value === sg.id ? 0 : -1}
          data-when-tab={sg.id} onClick={() => onChange(sg.id)} onKeyDown={(e) => move(e, i)}
          className={`shrink-0 whitespace-nowrap rounded-control px-2 py-1 text-meta ${value === sg.id ? 'bg-sunken font-semibold text-default dark:bg-raised' : 'text-muted hover:text-default'}`}>
          {sg.label()}
        </button>
      ))}
    </div>
  )
}

/** A choice of the time of day row: Any time, a part, or Time (when-picker D1). */
type RowChoice = 'none' | DayPart | 'time'

/** Suggested times while Time is chosen and none is set yet (task-panel-polish D3). */
const TIME_SUGGESTIONS = ['09:00', '13:00', '18:00']
/** The keys that move through the row's choices. */
const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'])

/**
 * The time of day row of the Do on segment (when-picker D1–D3): one answer to "when
 * on that day", Any time | Morning | Afternoon | Evening | Time (without Morning and
 * Afternoon while day parts are off). It selects Time with a due time, else the
 * part, else Any time; a task holding both shows its part and the time line. A part
 * and a time are exclusive here: each choice is one batch with Undo (`doOnPatch`).
 * Under it, only while Time is chosen, the time with suggested times and, at the
 * line's end, the zone. Disabled until the task has a do date (with nothing chosen,
 * so the row reads as waiting), and for a reader.
 */
function TimeOfDay({ task, readOnly, zone }: { task: Task; readOnly: boolean; zone: string }) {
  const dt = useDateTimeFormat()
  const parts = dayPartsOn(useUserPrefsRow())
  const view = localDueOf(task.due, zone)
  const time = view?.time ?? null
  const [picking, setPicking] = useState(false)
  useResetOnChange([task.id], () => setPicking(false))
  const line = useRef<HTMLDivElement>(null)
  const arrowed = useRef(false)
  const focusTime = useRef(false)
  useEffect(() => {
    if (!picking || !focusTime.current) return
    focusTime.current = false
    line.current?.querySelector<HTMLInputElement>('input')?.focus()
  }, [picking])

  const offered: RowChoice[] = parts ? ['none', ...DAY_PARTS, 'time'] : ['none', 'evening', 'time']
  const part = dayPartOf(task)
  const shownPart = part && offered.includes(part) ? part : null
  const selected: RowChoice = picking && !time ? 'time' : shownPart ?? (time ? 'time' : 'none')
  const write = (choice: DoOnChoice) => act(doOnWithUndo(task.id, choice, zone))
  const choose = (choice: RowChoice) => {
    if (choice !== 'time') { setPicking(false); write({ part: choice === 'none' ? null : choice }); return }
    // Time with a time already set keeps it and clears the part; without one it opens the line.
    if (time) { if (part) write({ time }); return }
    // A click (or Enter, Space) moves on to the time; arrows only move through the row.
    focusTime.current = !arrowed.current
    setPicking(true)
  }
  const label = (c: RowChoice) => (c === 'time' ? t('Time') : dayPartName(c === 'none' ? null : c))
  return (
    <div className="space-y-1.5" onClickCapture={() => { arrowed.current = false }} onKeyDownCapture={(e) => { arrowed.current = ARROWS.has(e.key) }}>
      <SegmentedControl<RowChoice> fill label={view ? t('Time of day') : t('Time of day (choose a date first)')} disabled={!view || readOnly}
        value={view ? selected : ('' as RowChoice)} onChange={choose}
        options={offered.map((c) => ({ id: c, label: label(c) }))} data-time-of-day />
      {view && (picking || !!time) && (
        <div ref={line} className="flex min-h-9 items-center gap-1" data-due-time>
          {/* Emptying the time keeps the part the row shows (or Any time), as choosing it would. */}
          <TimeField label={t('Due time')} hideLabel value={time} inputClassName="w-24" disabled={readOnly}
            onChange={(tm) => { if (!tm) setPicking(false); write(tm ? { time: tm } : { part: shownPart }) }} />
          {!time && !readOnly && TIME_SUGGESTIONS.map((tm) => (
            <button key={tm} type="button" data-time-suggestion={tm}
              className="touch-target inline-flex min-h-7 items-center rounded-control px-2 text-meta tabular-nums text-muted transition duration-(--duration-ui) hover:bg-sunken hover:text-default dark:hover:bg-raised"
              onClick={() => write({ time: tm })}>{dt.formatTime(tm)}</button>
          ))}
          {time && <span className="ml-auto"><ZoneControl task={task} readOnly={readOnly} viewerZone={zone} variant="inline" /></span>}
        </div>
      )}
    </div>
  )
}

/**
 * The Multi-day switch of the Start segment (multi-day-tasks D2): on writes the flag
 * and, without a start before the do-on date, the day before it, in one batch, then
 * focuses the start date to pick the first day; off writes only the flag. A reader
 * sees the range as text.
 */
function MultiDaySwitch({ task, readOnly, root }: { task: Task; readOnly: boolean; root: RefObject<HTMLDivElement | null> }) {
  const span = spanOf(task)
  if (readOnly) return span ? <p className="text-body text-default" data-span-text>{t('Multi-day: {range}', { range: formatSpan(span) })}</p> : null
  const turn = async (on: boolean) => {
    const patch = on ? multiDayOnPatch(task) : { span: false }
    if (!patch) return
    await updateTask(task.id, patch)
    if (on) root.current?.querySelector<HTMLElement>('[data-when-segment="start"] input:not([disabled])')?.focus()
  }
  return (
    <div data-multi-day>
      <Switch label={t('Multi-day')} description={span ? formatSpan(span) : t('Show it across the days from its start to its do-on date')}
        checked={!!task.span} onChange={(on) => act(turn(on))} />
    </div>
  )
}

/**
 * The Do on segment (when-picker D1–D5): the date field, whose placeholder is an
 * example and which takes a date with a time ("tomorrow 3pm"), the quick choices on
 * one line, the calendar, then the time of day row and, only with a time, the time
 * line with its zone. Clear is the popover's footer.
 */
function DoOn({ task, readOnly }: { task: Task; readOnly: boolean }) {
  const zone = useViewerZone()
  const view = localDueOf(task.due, zone)
  const setDate = (date: string | null) => act(setDueWithUndo(task.id, dueFromView(task.due, date ? { date, ...(view?.time ? { time: view.time } : {}) } : null, zone)))
  return (
    <div className="space-y-3">
      <DatePicker compact label={t('Due date')} value={view?.date ?? null} choices={quickChoices('due')} emptyText={t('tomorrow 3pm, next fri')}
        onChange={setDate} onChangeTimed={(date, time) => act(doOnWithUndo(task.id, { date, time }, zone))} />
      <TimeOfDay task={task} readOnly={readOnly} zone={zone} />
    </div>
  )
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

/**
 * The Repeat segment (task-panel-polish D4): the rule in words, then presets built
 * from the due date (today without one), then Custom…, the full rule editor. A preset
 * writes the rule the editor would write for it; rules are English, the labels are not.
 */
function RepeatPresets({ task, onOpen }: { task: Task; onOpen?: (id: string) => void }) {
  const dt = useDateTimeFormat()
  const zone = useViewerZone()
  const base = localDueOf(task.due, zone)?.date ?? logicalToday()
  const day = Number(base.slice(8))
  const wd = new Date(Number(base.slice(0, 4)), Number(base.slice(5, 7)) - 1, day).getDay()
  const presets = [
    { id: 'daily', label: t('Every day'), rule: 'every day' },
    { id: 'weekdays', label: t('Every weekday'), rule: 'every weekday' },
    { id: 'weekly', label: t('Every week on {weekday}', { weekday: weekday(base) }), rule: `every ${WEEKDAYS[wd]}` },
    { id: 'monthly', label: t('Every month on day {day}', { day }), rule: `every ${ordinal(day)}` },
    { id: 'yearly', label: t('Every year on {date}', { date: dt.formatDate(base, 'compact') }), rule: 'every year' },
  ].map((p) => ({ ...p, canonical: (() => { const r = parseRule(p.rule); return r.ok ? r.canonical : p.rule })() }))
  const current = presets.find((p) => p.canonical === task.recurrence)?.id ?? null
  const [custom, setCustom] = useState(false)
  useResetOnChange([task.id], () => setCustom(false))
  const showCustom = custom || (!!task.recurrence && !current)
  return (
    <div className="space-y-3">
      {task.recurrence && <p className="text-body text-default" data-rule-words>{t('Repeats {rule}', { rule: task.recurrence })}</p>}
      <div role="radiogroup" aria-label={t('Repeat')} className="flex flex-col gap-1" data-repeat-presets>
        {presets.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={current === p.id} data-preset={p.id}
            className={`flex min-h-8 items-center gap-2 rounded-control px-2 text-left text-body ${current === p.id ? 'bg-selected font-medium text-strong' : 'text-default hover:bg-sunken dark:hover:bg-raised'}`}
            onClick={() => act(setRecurrence(task.id, p.rule))}>
            <Icon name={current === p.id ? 'check' : 'repeat'} size="xs" className={current === p.id ? '' : 'text-faint'} />{p.label}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={showCustom && !current} aria-expanded={showCustom} data-preset="custom"
          className="flex min-h-8 items-center gap-2 rounded-control px-2 text-left text-body text-default hover:bg-sunken dark:hover:bg-raised"
          onClick={() => setCustom((v) => !v)}>
          <Icon name="pencil" size="xs" className="text-faint" />{t('Custom…')}
        </button>
      </div>
      {showCustom && <RecurrenceField task={task} onOpen={onOpen} />}
      {/* A preset rule keeps the habit section under it too (habits-home D9); Custom… has it inside the rule editor. */}
      {!showCustom && !task.completed_at && !task.deleted_at && habitRule(task) && <PresetHabit task={task} />}
    </div>
  )
}

function PresetHabit({ task }: { task: Task }) {
  const related = useSeriesRecords(task.id)
  return <Suspense fallback={null}><HabitSection task={task} related={related} today={logicalToday()} /></Suspense>
}

export function WhenControl({ task, readOnly = false, focus = 'due', segment, onDone, onOpen, onClose, onAddLocation }: {
  task: Task
  readOnly?: boolean
  /** The segment that takes focus when the control opens. */
  focus?: WhenSegment
  /** Show only this segment (the When popover, task-panel-facets D3); all of them when absent. */
  segment?: WhenSegmentId
  /** The footer's Done (the chip closes its editor). */
  onDone?: () => void
  /** Open another task (a detached occurrence). */
  onOpen?: (id: string) => void
  /** Close the popover (after a sector is chosen, time-sectors D6). */
  onClose?: () => void
  /** Open the task's location editor (a location reminder needs a point, location-reminders D5). */
  onAddLocation?: () => void
}) {
  const zone = useViewerZone()
  const local = localDueOf(task.due, zone)
  const root = useRef<HTMLDivElement>(null)

  // Focus the first control of the segment the chip asked for (and of each segment switched to).
  const shownFocus = segment ?? focus
  useEffect(() => {
    const seg = root.current?.querySelector<HTMLElement>(`[data-when-segment="${shownFocus}"]`)
    // A text field first (the date), else the segment's first control (a switch, Add reminder).
    ;(seg?.querySelector<HTMLElement>('input:not([disabled])') ?? seg?.querySelector<HTMLElement>(FOCUSABLE))?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on mount and when the shown segment changes
  }, [segment])
  const shows = (id: WhenSegment) => !segment || id === segment
  const sectorShown = useSectorSegment(task)

  return (
    <div ref={root} data-when-control data-when-shown={segment} className="space-y-3">
      {shows('due') && (
        <Segment id="due" icon="calendar-days" label={t('Do on')} bare={!!segment}>
          <DoOn task={task} readOnly={readOnly} />
        </Segment>
      )}

      {shows('start') && <Segment id="start" icon="calendar-range" label={t('Start')} bare={!!segment}>
        {!task.start && <p className="mb-2 text-meta text-muted" data-start-empty>{t('No start date')}</p>}
        <DatePicker label={t('Start date')} value={task.start && task.start !== 'someday' ? task.start : null} choices={quickChoices('start')}
          chosen={task.start === 'someday' ? 'someday' : undefined} emptyText={t('No start date')}
          validate={(iso) => (local && iso > local.date ? t('The start must be on or before the due date.') : null)}
          onChoice={(c) => { if (c.date === 'someday') act(parkWithUndo(task.id)) }}
          onChange={(start) => (start ? act(updateTask(task.id, { start })) : void unparkTask(task.id))} />
        {task.due && <MultiDaySwitch task={task} readOnly={readOnly} root={root} />}
      </Segment>}

      {shows('sector') && sectorShown && <Segment id="sector" icon="calendar-range" label={t('Time sector')} bare={!!segment}>
        <SectorChoice task={task} readOnly={readOnly} onChosen={segment ? onClose : undefined} />
      </Segment>}

      {shows('deadline') && <Segment id="deadline" icon="hourglass" label={t('Deadline')} bare={!!segment}>
        <DatePicker label={t('Deadline')} value={task.deadline ?? null} choices={quickChoices('deadline')} emptyText={t('No deadline')}
          onChange={(deadline) => act(updateTask(task.id, { deadline }))} />
      </Segment>}

      {shows('repeat') && <Segment id="repeat" icon="repeat" label={t('Repeat')} bare={!!segment}>
        <RepeatPresets task={task} onOpen={onOpen} />
      </Segment>}

      {shows('reminders') && <Segment id="reminders" icon="alarm-clock" label={t('Reminders')} bare={!!segment}>
        <fieldset disabled={readOnly} className="min-w-0"><RemindersField task={task} onAddLocation={onAddLocation} /></fieldset>
      </Segment>}

      {onDone && (
        <div className="flex justify-end border-t border-default pt-2">
          <Button size="sm" onClick={onDone} data-when-close>{t('Close')}</Button>
        </div>
      )}
    </div>
  )
}
