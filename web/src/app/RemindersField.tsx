import { Icon } from '../ui/Icon'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../lib/db'
import { addDaysISO, localDueOf, todayISO } from '../lib/dates'
import { addReminder, deleteReminder, dismissReminder, snoozeReminder, sortReminders, updateReminder, type ReminderInput } from '../lib/reminders'
import { DEFAULT_REMINDER_TIME, isDelivered, isDismissed, offsetLabel, RELATIVE_PRESETS } from '../lib/reminderTime'
import type { Reminder, Task } from '../lib/types'
import { MenuGroup, MenuItem, MenuSeparator } from '../ui/Menu'
import { Menu } from './overlay/Menu'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { DateField } from './datetime/DateField'
import { TimeField } from './datetime/TimeField'

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
 * date and time editors are the date-time-preferences fields.
 */
export function RemindersField({ task }: { task: Task }) {
  const reminders = useLiveQuery(
    () => db.reminders.where('task_id').equals(task.id).filter((r) => !r.deleted_at).toArray().then(sortReminders),
    [task.id], [] as Reminder[],
  )
  const [adding, setAdding] = useState<'custom' | 'absolute' | null>(null)
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
      <ul className="flex flex-wrap gap-1.5 empty:hidden" aria-label="Reminders">
        {reminders.map((r) => {
          const fired = r.fire_at !== null && r.fire_at <= now
          const state = r.fire_at === null ? 'no due date' : isDismissed(r) ? 'dismissed' : fired ? (isDelivered(r) ? 'sent' : 'fired') : ''
          const when = r.fire_at !== null ? formatInstant(r.fire_at, 'long') : 'Not scheduled'
          const name = r.kind === 'relative' ? offsetLabel(r.offset_minutes) : when
          if (editing === r.id) {
            return (
              <li key={r.id} className="w-full" data-reminder-id={r.id}>
                <ReminderEditor task={task} initial={r} onCancel={() => setEditing(null)} onSave={(input) => void run(() => updateReminder(r.id, input))} />
              </li>
            )
          }
          return (
            <li key={r.id} data-reminder-id={r.id}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border border-default py-0.5 pl-2.5 pr-0.5 text-sm ${isDismissed(r) ? 'text-faint' : 'text-default'}`}>
              <Icon name="bell" className={fired && !isDismissed(r) ? 'text-accent' : 'text-faint'} />
              <span className="min-w-0 truncate">
                {r.kind === 'relative' ? <>{name} <span className="text-meta text-muted" data-testid="reminder-time">{when}</span></> : <span data-testid="reminder-time">{when}</span>}
                {state && <span className="text-meta text-muted"> · {state}</span>}
              </span>
              <Menu kind="menu" label={`Actions for reminder ${name}`} trigger={<Icon name="ellipsis" />} triggerClassName="btn-ghost rounded-full px-1.5 py-1" width="sm:w-56">
                <MenuItem label="Edit" icon="pencil" onSelect={() => setEditing(r.id)} />
                {fired && !isDismissed(r) && <MenuItem label="Snooze 10 minutes" icon="clock" onSelect={() => void run(() => snoozeReminder(r.id, '10m'))} />}
                {fired && !isDismissed(r) && <MenuItem label="Dismiss" icon="check" onSelect={() => void run(() => dismissReminder(r.id))} />}
                <MenuSeparator />
                <MenuItem label="Delete reminder" icon="trash-2" danger onSelect={() => void run(() => deleteReminder(r.id))} />
              </Menu>
            </li>
          )
        })}
      </ul>
      {adding === null ? (
        <Menu kind="menu" label="Add reminder" align="start" width="sm:w-64"
          trigger={<><Icon name="plus" />Add reminder</>} triggerClassName="btn-ghost px-2 py-1 text-sm text-accent">
          <MenuGroup label="Before the due time">
            {RELATIVE_PRESETS.map((p) => (
              <MenuItem key={p.minutes} label={p.label} icon="bell" description={task.due ? undefined : 'Fires once the task has a due date'}
                onSelect={() => void run(() => addReminder(task.id, { kind: 'relative', offset_minutes: p.minutes }))} />
            ))}
          </MenuGroup>
          <MenuSeparator />
          <MenuItem label="Custom…" icon="pencil" onSelect={() => setAdding('custom')} />
          <MenuItem label="At a time…" icon="calendar-days" onSelect={() => setAdding('absolute')} />
        </Menu>
      ) : (
        <ReminderEditor
          task={task}
          initial={null}
          mode={adding === 'custom' ? 'relative' : 'absolute'}
          onCancel={() => setAdding(null)}
          onSave={(input) => void run(() => addReminder(task.id, input))}
        />
      )}
      {!task.due && reminders.some((r) => r.kind === 'relative') && (
        <p className="text-meta text-faint">Relative reminders fire once the task has a due date.</p>
      )}
      {task.due && !task.due.time && reminders.some((r) => r.kind === 'relative') && (
        <p className="text-meta text-faint">No due time: relative reminders count from {DEFAULT_REMINDER_TIME}.</p>
      )}
      {error && <p role="alert" className="text-meta text-danger">{error}</p>}
    </div>
  )
}

function ReminderEditor({ task, initial, mode, onSave, onCancel }: {
  task: Task
  initial: Reminder | null
  mode?: 'relative' | 'absolute'
  onSave: (input: ReminderInput) => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState<'relative' | 'absolute'>(initial?.kind ?? mode ?? 'relative')
  const startOffset = initial?.offset_minutes ?? -30
  const [amount, setAmount] = useState(String(Math.abs(startOffset)))
  const [unit, setUnit] = useState<'1' | '60' | '1440'>(Math.abs(startOffset) % 1440 === 0 && startOffset !== 0 ? '1440' : Math.abs(startOffset) % 60 === 0 && startOffset !== 0 ? '60' : '1')
  const [direction, setDirection] = useState<'before' | 'after'>(startOffset > 0 ? 'after' : 'before')
  const [moment, setMoment] = useState(initial?.fire_at ? toLocalParts(initial.fire_at) : defaultMoment(task))
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    if (kind === 'relative') {
      const n = Number(amount)
      if (!Number.isInteger(n) || n < 0) return setError('Enter a whole number.')
      const minutes = n * Number(unit)
      onSave({ kind: 'relative', offset_minutes: direction === 'before' ? -minutes : minutes })
    } else {
      const at = fromLocalParts(moment.date, moment.time)
      if (at === null) return setError('Pick a date and time.')
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
        <select className="input w-auto py-1" aria-label="Reminder kind" value={kind} onChange={(e) => setKind(e.target.value as 'relative' | 'absolute')}>
          <option value="relative">Relative</option>
          <option value="absolute">At a time</option>
        </select>
      )}
      {kind === 'relative' ? (
        <>
          <input className="input w-20 py-1" type="number" min={0} aria-label="Offset amount" value={amount} autoFocus onChange={(e) => setAmount(e.target.value)} />
          <select className="input w-auto py-1" aria-label="Offset unit" value={unit} onChange={(e) => setUnit(e.target.value as '1' | '60' | '1440')}>
            <option value="1">minutes</option>
            <option value="60">hours</option>
            <option value="1440">days</option>
          </select>
          <select className="input w-auto py-1" aria-label="Before or after" value={direction} onChange={(e) => setDirection(e.target.value as 'before' | 'after')}>
            <option value="before">before</option>
            <option value="after">after</option>
          </select>
        </>
      ) : (
        <>
          {/* The same controls as the due field, in the user's formats (date-time-preferences D4). */}
          <DateField label="Reminder date" hideLabel autoFocus className="min-w-44 flex-1" value={moment.date} onChange={(date) => date && setMoment((m) => ({ ...m, date }))} />
          <TimeField label="Reminder time" hideLabel value={moment.time} onChange={(time) => time && setMoment((m) => ({ ...m, time }))} />
        </>
      )}
      <button type="submit" className="btn-primary px-2 py-1 text-xs">Save</button>
      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onCancel}>Cancel</button>
      {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  )
}
