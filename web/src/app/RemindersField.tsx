import { Icon } from '../ui'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../lib/db'
import { addDaysISO, localDueOf, todayISO } from '../lib/dates'
import { addReminder, deleteReminder, dismissReminder, snoozeReminder, sortReminders, updateReminder, type ReminderInput } from '../lib/reminders'
import { DEADLINE_PRESETS, deadlineOffsetLabel, DEFAULT_REMINDER_TIME, isDelivered, isDismissed, offsetLabel, RELATIVE_PRESETS } from '../lib/reminderTime'
import type { Reminder, Task } from '../lib/types'
import { MenuGroup, MenuItem, MenuSeparator } from '../ui'
import { Menu } from './overlay/Menu'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { DateField } from './datetime/DateField'
import { TimeField } from './datetime/TimeField'
import { t } from '../lib/i18n'

/** A local date and wall-clock time for an instant (the date and time fields edit these). */
function toLocalParts(ms: number): { date: string; time: string } {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return { date: todayISO(d), time: `${p(d.getHours())}:${p(d.getMinutes())}` }
}

/** The instant of a local date and wall-clock time. */
export function fromLocalParts(date: string, time: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const tm = /^(\d{2}):(\d{2})$/.exec(time)
  if (!dm || !tm) return null
  return new Date(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]).getTime()
}

/** A sensible default moment for a new absolute reminder: the due time, else tomorrow 09:00. */
function defaultMoment(task: Task): { date: string; time: string } {
  const due = localDueOf(task.due)
  if (due) return { date: due.date, time: due.time ?? DEFAULT_REMINDER_TIME }
  return { date: addDaysISO(todayISO(), 1), time: '09:00' }
}

/**
 * Reminders row of the task panel (OpenSpec change `reminders`; layout from
 * task-detail-redesign D8): each reminder is a chip with its own actions menu
 * (edit, snooze and dismiss once it has fired, delete), and "Add reminder" is a
 * menu of relative presets plus a custom offset or a set date and time. The
 * date and time editors are the date-time-preferences fields. Once the task has
 * a deadline the menu also offers deadline reminders (OpenSpec change `deadlines`).
 */
export function RemindersField({ task }: { task: Task }) {
  const reminders = useLiveQuery(
    () => db.reminders.where('task_id').equals(task.id).filter((r) => !r.deleted_at).toArray().then(sortReminders),
    [task.id], [] as Reminder[],
  )
  const [adding, setAdding] = useState<'custom' | 'deadline' | 'absolute' | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { formatInstant } = useDateTimeFormat()

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      setAdding(null)
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const now = Date.now()
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-1.5 empty:hidden" aria-label={t('Reminders')}>
        {reminders.map((r) => {
          const fired = r.fire_at !== null && r.fire_at <= now
          const state = r.fire_at === null ? (r.kind === 'deadline' ? t('no deadline') : t('no due date')) : isDismissed(r) ? t('dismissed') : fired ? (isDelivered(r) ? t('sent') : t('fired')) : ''
          const when = r.fire_at !== null ? formatInstant(r.fire_at, 'long') : t('Not scheduled')
          const name = r.kind === 'relative' ? offsetLabel(r.offset_minutes) : r.kind === 'deadline' ? deadlineOffsetLabel(r.offset_minutes) : when
          if (editing === r.id) {
            return (
              <li key={r.id} className="w-full" data-reminder-id={r.id}>
                <ReminderEditor task={task} initial={r} onCancel={() => setEditing(null)} onSave={(input) => void run(() => updateReminder(r.id, input))} />
              </li>
            )
          }
          return (
            <li key={r.id} data-reminder-id={r.id}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border border-default py-0.5 pl-2.5 pr-0.5 text-body ${isDismissed(r) ? 'text-faint' : 'text-default'}`}>
              <Icon name="bell" className={fired && !isDismissed(r) ? 'text-accent' : 'text-faint'} />
              <span className="min-w-0 truncate">
                {r.kind !== 'absolute' ? <>{name} <span className="text-meta text-muted" data-testid="reminder-time">{when}</span></> : <span data-testid="reminder-time">{when}</span>}
                {state && <span className="text-meta text-muted"> · {state}</span>}
              </span>
              <Menu kind="menu" label={t('Actions for reminder {name}', { name })} trigger={<Icon name="ellipsis" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm rounded-full px-1.5 py-1" width="sm:w-56">
                <MenuItem label={t('Edit')} icon="pencil" onSelect={() => setEditing(r.id)} />
                {fired && !isDismissed(r) && <MenuItem label={t('Snooze 10 minutes')} icon="clock" onSelect={() => void run(() => snoozeReminder(r.id, '10m'))} />}
                {fired && !isDismissed(r) && <MenuItem label={t('Dismiss')} icon="check" onSelect={() => void run(() => dismissReminder(r.id))} />}
                <MenuSeparator />
                <MenuItem label={t('Delete reminder')} icon="trash-2" danger onSelect={() => void run(() => deleteReminder(r.id))} />
              </Menu>
            </li>
          )
        })}
      </ul>
      {adding === null ? (
        <Menu kind="menu" label={t('Add reminder')} align="start" width="sm:w-64"
          trigger={<><Icon name="plus" />{t('Add reminder')}</>} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm px-2 py-1 text-body text-accent">
          <MenuGroup label={t('Before the due time')}>
            {RELATIVE_PRESETS.map((p) => (
              <MenuItem key={p.minutes} label={p.label} icon="bell" description={task.due ? undefined : t('Fires once the task has a due date')}
                onSelect={() => void run(() => addReminder(task.id, { kind: 'relative', offset_minutes: p.minutes }))} />
            ))}
          </MenuGroup>
          {task.deadline && (
            <>
              <MenuSeparator />
              <MenuGroup label={t('Before the deadline')}>
                {DEADLINE_PRESETS.map((p) => (
                  <MenuItem key={p.minutes} label={p.label} icon="hourglass"
                    onSelect={() => void run(() => addReminder(task.id, { kind: 'deadline', offset_minutes: p.minutes }))} />
                ))}
                <MenuItem label={t('Custom before the deadline…')} icon="pencil" onSelect={() => setAdding('deadline')} />
              </MenuGroup>
            </>
          )}
          <MenuSeparator />
          <MenuItem label={t('Custom…')} icon="pencil" onSelect={() => setAdding('custom')} />
          <MenuItem label={t('At a time…')} icon="calendar-days" onSelect={() => setAdding('absolute')} />
        </Menu>
      ) : (
        <ReminderEditor
          task={task}
          initial={null}
          mode={adding === 'custom' ? 'relative' : adding}
          onCancel={() => setAdding(null)}
          onSave={(input) => void run(() => addReminder(task.id, input))}
        />
      )}
      {!task.due && reminders.some((r) => r.kind === 'relative') && (
        <p className="text-meta text-faint">{t('Relative reminders fire once the task has a due date.')}</p>
      )}
      {task.due && !task.due.time && reminders.some((r) => r.kind === 'relative') && (
        <p className="text-meta text-faint">{t('No due time: relative reminders count from {DEFAULT_REMINDER_TIME}.', { DEFAULT_REMINDER_TIME })}</p>
      )}
      {!task.deadline && reminders.some((r) => r.kind === 'deadline') && (
        <p className="text-meta text-faint">{t('Deadline reminders fire once the task has a deadline.')}</p>
      )}
      {error && <p role="alert" className="text-meta text-danger">{error}</p>}
    </div>
  )
}

function ReminderEditor({ task, initial, mode, onSave, onCancel }: {
  task: Task
  initial: Reminder | null
  mode?: Reminder['kind']
  onSave: (input: ReminderInput) => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState<Reminder['kind']>(initial?.kind ?? mode ?? 'relative')
  const startOffset = initial?.offset_minutes ?? -30
  const [amount, setAmount] = useState(String(Math.abs(startOffset)))
  const [unit, setUnit] = useState<'1' | '60' | '1440'>(Math.abs(startOffset) % 1440 === 0 && startOffset !== 0 ? '1440' : Math.abs(startOffset) % 60 === 0 && startOffset !== 0 ? '60' : '1')
  const [direction, setDirection] = useState<'before' | 'after'>(startOffset > 0 ? 'after' : 'before')
  const [moment, setMoment] = useState(initial?.fire_at ? toLocalParts(initial.fire_at) : defaultMoment(task))
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    if (kind !== 'absolute') {
      const n = Number(amount)
      if (!Number.isInteger(n) || n < 0) return setError(t('Enter a whole number.'))
      const minutes = n * Number(unit)
      onSave({ kind, offset_minutes: direction === 'before' ? -minutes : minutes })
    } else {
      const at = fromLocalParts(moment.date, moment.time)
      if (at === null) return setError(t('Pick a date and time.'))
      onSave({ kind: 'absolute', fire_at: at })
    }
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => { e.preventDefault(); save() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}
    >
      {initial && (
        <select className="ui-input w-auto py-1" aria-label={t('Reminder kind')} value={kind} onChange={(e) => setKind(e.target.value as Reminder['kind'])}>
          <option value="relative">{t('Relative')}</option>
          {(task.deadline || initial.kind === 'deadline') && <option value="deadline">{t('Before the deadline')}</option>}
          <option value="absolute">{t('At a time')}</option>
        </select>
      )}
      {kind !== 'absolute' ? (
        <>
          <input className="ui-input w-20 py-1" type="number" min={0} aria-label={t('Offset amount')} value={amount} autoFocus onChange={(e) => setAmount(e.target.value)} />
          <select className="ui-input w-auto py-1" aria-label={t('Offset unit')} value={unit} onChange={(e) => setUnit(e.target.value as '1' | '60' | '1440')}>
            <option value="1">{t('minutes')}</option>
            <option value="60">{t('hours')}</option>
            <option value="1440">{t('days')}</option>
          </select>
          <select className="ui-input w-auto py-1" aria-label={t('Before or after')} value={direction} onChange={(e) => setDirection(e.target.value as 'before' | 'after')}>
            <option value="before">{t('before')}</option>
            <option value="after">{t('after')}</option>
          </select>
          {kind === 'deadline' && <span className="text-body text-muted">{t('the deadline')}</span>}
        </>
      ) : (
        <>
          {/* The same controls as the due field, in the user's formats (date-time-preferences D4). */}
          <DateField label={t('Reminder date')} hideLabel autoFocus className="min-w-44 flex-1" value={moment.date} onChange={(date) => date && setMoment((m) => ({ ...m, date }))} />
          <TimeField label={t('Reminder time')} hideLabel value={moment.time} onChange={(time) => time && setMoment((m) => ({ ...m, time }))} />
        </>
      )}
      <button type="submit" className="ui-btn ui-btn--primary ui-btn--sm px-2 py-1 text-meta">{t('Save')}</button>
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-1 text-meta" onClick={onCancel}>{t('Cancel')}</button>
      {error && <p className="w-full text-meta text-danger">{error}</p>}
    </form>
  )
}
