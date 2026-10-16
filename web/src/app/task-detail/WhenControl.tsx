// The When control of the task panel (OpenSpec change ux-overhaul, web-app "Task
// panel layout", design D4): one editor composing the due date and time, Start
// (Anytime, a date, Someday), Deadline, Evening, Repeat and Reminders as segments
// under a shared header and footer. Every segment is the editor it replaces and
// writes exactly the fields it wrote before.
import { useEffect, useRef, type ReactNode } from 'react'
import { localDueOf } from '../../lib/dates'
import { unparkTask, updateTask } from '../../lib/ops'
import type { Task } from '../../lib/types'
import { Button, Icon, IconButton, type IconName, Switch } from '../../ui'
import { DateField } from '../datetime/DateField'
import { DueField } from '../DueField'
import { RecurrenceField } from '../RecurrenceField'
import { RemindersField } from '../RemindersField'
import { parkWithUndo } from '../undoable'
import { useViewerZone } from '../useViews'
import { t } from '../../lib/i18n'

export type WhenSegment = 'due' | 'start' | 'deadline' | 'evening' | 'repeat' | 'reminders'

const FOCUSABLE = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'

function Segment({ id, icon, label, children }: { id: WhenSegment; icon: IconName; label: string; children: ReactNode }) {
  return (
    <div data-when-segment={id} role="group" aria-label={label} className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-meta font-medium text-muted"><Icon name={icon} size="xs" className="text-faint" />{label}</p>
      {children}
    </div>
  )
}

export function WhenControl({ task, readOnly = false, focus = 'due', onDone, onOpen }: {
  task: Task
  readOnly?: boolean
  /** The segment that takes focus when the control opens. */
  focus?: WhenSegment
  /** The footer's Done (the chip closes its editor). */
  onDone?: () => void
  /** Open another task (a detached occurrence). */
  onOpen?: (id: string) => void
}) {
  const zone = useViewerZone()
  const local = localDueOf(task.due, zone)
  const root = useRef<HTMLDivElement>(null)

  // Focus the first control of the segment the chip asked for.
  useEffect(() => {
    const seg = root.current?.querySelector<HTMLElement>(`[data-when-segment="${focus}"]`)
    // A text field first (the date), else the segment's first control (a switch, Add reminder).
    ;(seg?.querySelector<HTMLElement>('input:not([disabled])') ?? seg?.querySelector<HTMLElement>(FOCUSABLE))?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={root} data-when-control className="space-y-3">
      <Segment id="due" icon="calendar-days" label={t('Do on')}>
        <DueField task={task} readOnly={readOnly} />
      </Segment>

      <Segment id="start" icon="calendar-range" label={t('Start')}>
        <div className="flex flex-wrap items-start gap-2">
          <Button variant="ghost" size="sm" aria-pressed={!task.start} onClick={() => void unparkTask(task.id)}>{t('Anytime')}</Button>
          <DateField label={t('Start date')} hideLabel className="min-w-44 flex-1" value={task.start && task.start !== 'someday' ? task.start : null}
            validate={(iso) => (local && iso > local.date ? t('The start must be on or before the due date.') : null)}
            onChange={(start) => void updateTask(task.id, { start })} />
          <Button variant="ghost" size="sm" icon="archive" aria-pressed={task.start === 'someday'} onClick={() => void parkWithUndo(task.id)}>{t('Someday')}</Button>
        </div>
      </Segment>

      <Segment id="deadline" icon="hourglass" label={t('Deadline')}>
        <div className="flex flex-wrap items-start gap-2">
          <DateField label={t('Deadline')} hideLabel className="min-w-44 flex-1" value={task.deadline ?? null}
            onChange={(deadline) => void updateTask(task.id, { deadline })} />
          {task.deadline && <IconButton icon="x" label={t('Clear deadline')} onClick={() => void updateTask(task.id, { deadline: null })} />}
        </div>
      </Segment>

      <Segment id="evening" icon="moon" label={t('Evening')}>
        <Switch label={t('This Evening')} description={t('Listed in the evening group of Today')} checked={!!task.evening} disabled={readOnly}
          onChange={(on) => void updateTask(task.id, { evening: on })} />
      </Segment>

      <Segment id="repeat" icon="repeat" label={t('Repeat')}>
        <RecurrenceField task={task} onOpen={onOpen} />
      </Segment>

      <Segment id="reminders" icon="alarm-clock" label={t('Reminders')}>
        <fieldset disabled={readOnly} className="min-w-0"><RemindersField task={task} /></fieldset>
      </Segment>

      {onDone && (
        <div className="flex justify-end border-t border-default pt-2">
          <Button size="sm" onClick={onDone}>{t('Done')}</Button>
        </div>
      )}
    </div>
  )
}
