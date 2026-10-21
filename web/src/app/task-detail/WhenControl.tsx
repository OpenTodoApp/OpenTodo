// The When control of the task panel (OpenSpec change ux-overhaul, web-app "Task
// panel layout", design D4): one editor composing the due date and time, Start
// (Anytime, a date, Someday), Deadline, Evening, Repeat and Reminders as segments
// under a shared header and footer. Every segment is the editor it replaces and
// writes exactly the fields it wrote before.
import { type KeyboardEvent, useEffect, useRef, type ReactNode } from 'react'
import { localDueOf } from '../../lib/dates'
import { unparkTask, updateTask } from '../../lib/ops'
import type { WhenSegmentId } from '../../lib/facets'
import type { Task } from '../../lib/types'
import { Button, Icon, IconButton, type IconName, Switch } from '../../ui'
import { DateField } from '../datetime/DateField'
import { DueField } from '../DueField'
import { RecurrenceField } from '../RecurrenceField'
import { RemindersField } from '../RemindersField'
import { parkWithUndo } from '../undoable'
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
          <DueField task={task} readOnly={readOnly} clearable={!segment} />
        </Segment>
      )}

      {shows('start') && <Segment id="start" icon="calendar-range" label={t('Start')} bare={!!segment}>
        <div className="flex flex-wrap items-start gap-2">
          <Button variant="ghost" size="sm" aria-pressed={!task.start} onClick={() => void unparkTask(task.id)}>{t('Anytime')}</Button>
          <DateField label={t('Start date')} hideLabel className="min-w-44 flex-1" value={task.start && task.start !== 'someday' ? task.start : null}
            validate={(iso) => (local && iso > local.date ? t('The start must be on or before the due date.') : null)}
            onChange={(start) => act(updateTask(task.id, { start }))} />
          <Button variant="ghost" size="sm" icon="archive" aria-pressed={task.start === 'someday'} onClick={() => act(parkWithUndo(task.id))}>{t('Someday')}</Button>
        </div>
      </Segment>}

      {shows('deadline') && <Segment id="deadline" icon="hourglass" label={t('Deadline')} bare={!!segment}>
        <div className="flex flex-wrap items-start gap-2">
          <DateField label={t('Deadline')} hideLabel className="min-w-44 flex-1" value={task.deadline ?? null}
            onChange={(deadline) => act(updateTask(task.id, { deadline }))} />
          {task.deadline && !segment && <IconButton icon="x" label={t('Clear deadline')} onClick={() => act(updateTask(task.id, { deadline: null }))} />}
        </div>
      </Segment>}

      {shows('evening') && <Segment id="evening" icon="moon" label={t('Evening')} bare={!!segment}>
        <Switch label={t('This Evening')} description={t('Listed in the evening group of Today')} checked={!!task.evening} disabled={readOnly}
          onChange={(on) => act(updateTask(task.id, { evening: on }))} />
      </Segment>}

      {shows('repeat') && <Segment id="repeat" icon="repeat" label={t('Repeat')} bare={!!segment}>
        <RecurrenceField task={task} onOpen={onOpen} />
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
