// The When control of the task panel (OpenSpec change ux-overhaul, web-app "Task
// panel layout", design D4): one editor composing the due date and time, Start
// (Anytime, a date, Someday), Deadline, Evening, Repeat and Reminders as segments
// under a shared header and footer. Every segment is the editor it replaces and
// writes exactly the fields it wrote before.
import { type KeyboardEvent, useEffect, useRef, useState, type ReactNode } from 'react'
import { dueFromView, localDueOf, logicalToday, quickChoices, weekday } from '../../lib/dates'
import { setRecurrence, unparkTask, updateTask } from '../../lib/ops'
import { parseRule } from '../../lib/recurrence'
import type { WhenSegmentId } from '../../lib/facets'
import type { Task } from '../../lib/types'
import { Button, Icon, type IconName, Switch } from '../../ui'
import { DatePicker } from '../datetime/DatePicker'
import { TimeField } from '../datetime/TimeField'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { RecurrenceField } from '../RecurrenceField'
import { RemindersField } from '../RemindersField'
import { parkWithUndo, setDueWithUndo } from '../undoable'
import { ZoneControl } from './ZoneControl'
import { useViewerZone } from '../useViews'
import { t } from '../../lib/i18n'
import { act } from '../actionError'

export type WhenSegment = 'due' | 'start' | 'deadline' | 'evening' | 'repeat' | 'reminders'

const FOCUSABLE = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'

function Segment({ id, icon, label, bare = false, children }: { id: WhenSegment; icon: IconName; label: string; bare?: boolean; children: ReactNode }) {
  // In the popover the segment's name is the selected tab above it; the Evening switch names itself.
  return (
    <div data-when-segment={id} role="group" aria-label={label} className="space-y-1.5">
      {!bare && <p className="flex items-center gap-1.5 text-meta font-medium text-muted"><Icon name={icon} size="xs" className="text-faint" />{label}</p>}
      {children}
    </div>
  )
}

/** The segments of the When popover, in order (task-panel-facets D3); Evening lives in Do on. */
export const WHEN_SEGMENTS: { id: WhenSegmentId; icon: IconName; label: () => string }[] = [
  { id: 'due', icon: 'calendar-days', label: () => t('Do on') },
  { id: 'start', icon: 'calendar-range', label: () => t('Start') },
  { id: 'deadline', icon: 'hourglass', label: () => t('Deadline') },
  { id: 'repeat', icon: 'repeat', label: () => t('Repeat') },
  { id: 'reminders', icon: 'alarm-clock', label: () => t('Reminders') },
]

/** The segmented control in the When popover's header: one segment shown at a time. */
export function WhenSegmentPicker({ value, onChange }: { value: WhenSegmentId; onChange: (id: WhenSegmentId) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (e: KeyboardEvent, i: number) => {
    const n = WHEN_SEGMENTS.length
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (next < 0) return
    e.preventDefault()
    onChange(WHEN_SEGMENTS[next].id)
    refs.current[next]?.focus()
  }
  return (
    <div role="tablist" aria-label={t('When')} className="ui-scroller -mx-1 flex gap-0.5 overflow-x-auto" data-when-segments>
      {WHEN_SEGMENTS.map((sg, i) => (
        <button key={sg.id} ref={(el) => { refs.current[i] = el }} type="button" role="tab" aria-selected={value === sg.id} tabIndex={value === sg.id ? 0 : -1}
          data-when-tab={sg.id} onClick={() => onChange(sg.id)} onKeyDown={(e) => move(e, i)}
          className={`shrink-0 whitespace-nowrap rounded-control px-2 py-1 text-meta ${value === sg.id ? 'bg-sunken font-semibold text-default dark:bg-raised' : 'text-muted hover:text-default'}`}>
          {sg.label()}
        </button>
      ))}
    </div>
  )
}

function EveningSwitch({ task, readOnly }: { task: Task; readOnly: boolean }) {
  return (
    <Switch label={t('This Evening')} description={t('Listed in the evening group of Today')} checked={!!task.evening} disabled={readOnly}
      onChange={(on) => act(updateTask(task.id, { evening: on }))} />
  )
}

/** Suggested times for a due (task-panel-polish D3). */
const TIME_SUGGESTIONS = ['09:00', '13:00', '18:00']

/**
 * The Do on segment (task-panel-polish D3): quick choices, the date in words, the
 * calendar, then Add time with suggestions, the Evening switch and, only with a time,
 * one quiet line about the time zone. Clear is the popover's footer.
 */
function DoOn({ task, readOnly, withEvening }: { task: Task; readOnly: boolean; withEvening: boolean }) {
  const zone = useViewerZone()
  const dt = useDateTimeFormat()
  const view = localDueOf(task.due, zone)
  const [addingTime, setAddingTime] = useState(false)
  useEffect(() => { setAddingTime(false) }, [task.id])
  const setView = (next: { date: string; time?: string } | null) => act(setDueWithUndo(task.id, dueFromView(task.due, next, zone)))
  const showTime = !!view && (!!view.time || addingTime)
  return (
    <div className="space-y-3">
      <DatePicker label={t('Due date')} value={view?.date ?? null} choices={quickChoices('due')} emptyText={t('Not scheduled')}
        onChange={(date) => setView(date ? { date, ...(view?.time ? { time: view.time } : {}) } : null)} />
      {view && (showTime ? (
        <div className="space-y-1.5" data-due-time>
          <div className="flex flex-wrap items-center gap-1.5">
            <TimeField label={t('Due time')} hideLabel value={view.time ?? null} disabled={readOnly}
              onChange={(time) => setView(time ? { date: view.date, time } : { date: view.date })} />
            {TIME_SUGGESTIONS.map((tm) => (
              <button key={tm} type="button" aria-pressed={view.time === tm} data-time-suggestion={tm}
                className={`min-h-8 rounded-control border px-2 py-1 text-meta tabular-nums ${view.time === tm ? 'border-accent bg-accent-soft text-on-accent-soft' : 'border-default text-muted hover:bg-sunken dark:hover:bg-raised'}`}
                onClick={() => setView({ date: view.date, time: tm })}>{dt.formatTime(tm)}</button>
            ))}
          </div>
          <button type="button" className="text-meta text-muted hover:text-default hover:underline" onClick={() => { setAddingTime(false); setView({ date: view.date }) }}>{t('Remove time')}</button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" icon="clock" className="-ml-2" onClick={() => setAddingTime(true)} data-add-time>{t('Add time')}</Button>
      ))}
      {withEvening && <EveningSwitch task={task} readOnly={readOnly} />}
      {task.due?.time && <ZoneControl task={task} readOnly={readOnly} viewerZone={zone} variant="line" />}
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
  useEffect(() => { setCustom(false) }, [task.id])
  const showCustom = custom || (!!task.recurrence && !current)
  return (
    <div className="space-y-3">
      {task.recurrence && <p className="text-body text-default" data-rule-words>{t('Repeats {rule}', { rule: task.recurrence })}</p>}
      <div role="radiogroup" aria-label={t('Repeat')} className="flex flex-col gap-1" data-repeat-presets>
        {presets.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={current === p.id} data-preset={p.id}
            className={`flex min-h-8 items-center gap-2 rounded-control px-2 text-left text-body ${current === p.id ? 'bg-accent-soft font-medium text-on-accent-soft' : 'text-default hover:bg-sunken dark:hover:bg-raised'}`}
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
    </div>
  )
}

export function WhenControl({ task, readOnly = false, focus = 'due', segment, onDone, onOpen }: {
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
  const shows = (id: WhenSegment) => !segment || id === segment || (segment === 'due' && id === 'evening')

  return (
    <div ref={root} data-when-control data-when-shown={segment} className="space-y-3">
      {shows('due') && (
        <Segment id="due" icon="calendar-days" label={t('Do on')} bare={!!segment}>
          <DoOn task={task} readOnly={readOnly} withEvening={!!segment} />
        </Segment>
      )}

      {shows('start') && <Segment id="start" icon="calendar-range" label={t('Start')} bare={!!segment}>
        {!task.start && <p className="mb-2 text-meta text-muted" data-start-empty>{t('No start date')}</p>}
        <DatePicker label={t('Start date')} value={task.start && task.start !== 'someday' ? task.start : null} choices={quickChoices('start')}
          chosen={task.start === 'someday' ? 'someday' : undefined} emptyText={t('No start date')}
          validate={(iso) => (local && iso > local.date ? t('The start must be on or before the due date.') : null)}
          onChoice={(c) => { if (c.date === 'someday') act(parkWithUndo(task.id)) }}
          onChange={(start) => (start ? act(updateTask(task.id, { start })) : void unparkTask(task.id))} />
      </Segment>}

      {shows('deadline') && <Segment id="deadline" icon="hourglass" label={t('Deadline')} bare={!!segment}>
        <DatePicker label={t('Deadline')} value={task.deadline ?? null} choices={quickChoices('deadline')} emptyText={t('No deadline')}
          onChange={(deadline) => act(updateTask(task.id, { deadline }))} />
      </Segment>}

      {shows('evening') && !segment && <Segment id="evening" icon="moon" label={t('Evening')}>
        <EveningSwitch task={task} readOnly={readOnly} />
      </Segment>}

      {shows('repeat') && <Segment id="repeat" icon="repeat" label={t('Repeat')} bare={!!segment}>
        <RepeatPresets task={task} onOpen={onOpen} />
      </Segment>}

      {shows('reminders') && <Segment id="reminders" icon="alarm-clock" label={t('Reminders')} bare={!!segment}>
        <fieldset disabled={readOnly} className="min-w-0"><RemindersField task={task} /></fieldset>
      </Segment>}

      {onDone && (
        <div className="flex justify-end border-t border-default pt-2">
          <Button size="sm" onClick={onDone}>{t('Done')}</Button>
        </div>
      )}
    </div>
  )
}
