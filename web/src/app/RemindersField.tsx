import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../lib/db'
import { localDueOf } from '../lib/dates'
import { addReminder, deleteReminder, dismissReminder, snoozeReminder, sortReminders, updateReminder, type ReminderInput } from '../lib/reminders'
import { DEFAULT_REMINDER_TIME, isDelivered, isDismissed, offsetLabel, RELATIVE_PRESETS } from '../lib/reminderTime'
import type { Reminder, Task } from '../lib/types'

/** Local "YYYY-MM-DDTHH:MM" for a datetime-local input. */
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function fromLocalInput(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v)
  if (!m) return null
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime()
}

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** A sensible default moment for a new absolute reminder: the due time, else tomorrow 09:00. */
function defaultMoment(task: Task): string {
  const due = localDueOf(task.due)
  if (due) return `${due.date}T${due.time ?? DEFAULT_REMINDER_TIME}`
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toLocalInput(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0).getTime())
}

/**
 * Reminders section of the task detail panel (OpenSpec change `reminders`): list,
 * add relative (presets or a custom offset) or absolute (date and time), edit,
 * delete, and snooze or dismiss a reminder that has fired. Every control is a
 * native button, select or input, so the section is reachable with Tab.
 */
export function RemindersField({ task }: { task: Task }) {
  const reminders = useLiveQuery(
    () => db.reminders.where('task_id').equals(task.id).filter((r) => !r.deleted_at).toArray().then(sortReminders),
    [task.id], [] as Reminder[],
  )
  const [adding, setAdding] = useState<'menu' | 'custom' | 'absolute' | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    <div>
      <ul className="mb-2 space-y-1 empty:hidden" aria-label="Reminders">
        {reminders.map((r) => {
          const fired = r.fire_at !== null && r.fire_at <= now
          const state = r.fire_at === null ? 'no due date' : isDismissed(r) ? 'dismissed' : fired ? (isDelivered(r) ? 'sent' : 'fired') : ''
          return (
            <li key={r.id} className="rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-800" data-reminder-id={r.id}>
              {editing === r.id ? (
                <ReminderEditor task={task} initial={r} onCancel={() => setEditing(null)} onSave={(input) => void run(() => updateReminder(r.id, input))} />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden>⏰</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium" data-testid="reminder-time">{r.fire_at !== null ? formatWhen(r.fire_at) : 'Not scheduled'}</span>
                    <span className="ml-1 text-xs text-muted">
                      {r.kind === 'relative' ? offsetLabel(r.offset_minutes) : 'at a set time'}{state ? ` · ${state}` : ''}
                    </span>
                  </span>
                  {fired && !isDismissed(r) && (
                    <>
                      <button type="button" className="btn-ghost px-1.5 py-0.5 text-xs" onClick={() => void run(() => snoozeReminder(r.id, '10m'))}>Snooze 10 min</button>
                      <button type="button" className="btn-ghost px-1.5 py-0.5 text-xs" onClick={() => void run(() => dismissReminder(r.id))}>Dismiss</button>
                    </>
                  )}
                  <button type="button" className="btn-ghost px-1.5 py-0.5 text-xs" aria-label="Edit reminder" onClick={() => setEditing(r.id)}>Edit</button>
                  <button type="button" className="btn-ghost px-1.5 py-0.5 text-xs" aria-label="Delete reminder" onClick={() => void run(() => deleteReminder(r.id))}>✕</button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {adding === null && (
        <button type="button" className="btn-ghost text-sm text-emerald-700 dark:text-emerald-400" onClick={() => setAdding('menu')}>+ Add reminder</button>
      )}
      {adding === 'menu' && (
        <select
          className="input"
          aria-label="Add reminder"
          autoFocus
          defaultValue=""
          onKeyDown={(e) => { if (e.key === 'Escape') setAdding(null) }}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'custom' || v === 'absolute') setAdding(v)
            else if (v !== '') void run(() => addReminder(task.id, { kind: 'relative', offset_minutes: Number(v) }))
          }}
        >
          <option value="" disabled>Choose when…</option>
          <optgroup label={task.due ? 'Relative to the due time' : 'Relative to the due time (set a due date first)'}>
            {RELATIVE_PRESETS.map((p) => <option key={p.minutes} value={p.minutes}>{p.label}</option>)}
            <option value="custom">Custom offset…</option>
          </optgroup>
          <option value="absolute">At a specific date and time…</option>
        </select>
      )}
      {(adding === 'custom' || adding === 'absolute') && (
        <ReminderEditor
          task={task}
          initial={null}
          mode={adding === 'custom' ? 'relative' : 'absolute'}
          onCancel={() => setAdding(null)}
          onSave={(input) => void run(() => addReminder(task.id, input))}
        />
      )}
      {!task.due && reminders.some((r) => r.kind === 'relative') && (
        <p className="mt-1 text-xs text-faint">Relative reminders fire once the task has a due date.</p>
      )}
      {task.due && !task.due.time && reminders.some((r) => r.kind === 'relative') && (
        <p className="mt-1 text-xs text-faint">No due time: relative reminders count from {DEFAULT_REMINDER_TIME}.</p>
      )}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
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
  const [moment, setMoment] = useState(initial?.fire_at ? toLocalInput(initial.fire_at) : defaultMoment(task))
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    if (kind === 'relative') {
      const n = Number(amount)
      if (!Number.isInteger(n) || n < 0) return setError('Enter a whole number.')
      const minutes = n * Number(unit)
      onSave({ kind: 'relative', offset_minutes: direction === 'before' ? -minutes : minutes })
    } else {
      const at = fromLocalInput(moment)
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
        <input className="input w-auto py-1" type="datetime-local" aria-label="Reminder date and time" value={moment} autoFocus onChange={(e) => setMoment(e.target.value)} />
      )}
      <button type="submit" className="btn-primary px-2 py-1 text-xs">Save</button>
      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onCancel}>Cancel</button>
      {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  )
}
