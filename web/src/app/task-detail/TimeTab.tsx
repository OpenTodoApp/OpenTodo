// The task panel's Time tab (OpenSpec change time-tracking, "Time tab and manual
// entries", design D5): the task's entries newest first with their day, times,
// duration, note and, in a shared project, who tracked them; the total; Start or
// Stop; adding past work by duration or by start and end; editing and deleting
// one's own entries. Every write goes through lib/timeEntries (ops, offline-safe).
import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, useId, useMemo, useState } from 'react'
import { Avatar, Button, Field, Icon, Input, Menu, MenuItem } from '../../ui'
import { formatMinutes, parseDuration } from '../../lib/duration'
import { formatDate, formatTime, logicalToday } from '../../lib/dates'
import { keysOf } from '../../lib/shortcuts'
import { membershipMap, memberName } from '../../lib/sharing'
import { isRunning, minutesOf, entryDay } from '../../lib/time'
import { deleteTimeEntry, logTime, TimeRangeError, toggleTracking, updateTimeEntry, useMe, useMinuteNow, useRunningEntry, useTaskEntries } from '../../lib/timeEntries'
import type { Membership, Task, TimeEntry } from '../../lib/types'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { useDateTimeFormat } from '../DateTimePrefsProvider'

const pad = (n: number) => String(n).padStart(2, '0')
/** The local wall time HH:MM of an instant. */
export const hhmm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
/** An instant from a local day and HH:MM. */
export function at(day: string, clock: string): number {
  const [y, m, d] = day.split('-').map(Number)
  const [h, min] = clock.split(':').map(Number)
  return new Date(y, m - 1, d, h, min).getTime()
}
const localDay = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

/** The Start or Stop item of the panel's task menu (design D5). */
export function TrackMenuItem({ task }: { task: Task }) {
  const running = useRunningEntry()
  const stop = running?.task_id === task.id
  if (task.deleted_at || (!stop && task.completed_at)) return null
  return <MenuItem label={stop ? t('Stop tracking') : t('Start tracking')} icon={stop ? 'square' : 'timer'} shortcut={keysOf('list.track')} onSelect={() => act(toggleTracking(task.id))} />
}

/** The total of a task's entries, ticking while one of them runs (the tab label). */
export function useTaskTotal(taskId: string): number {
  const entries = useTaskEntries(taskId)
  const now = useMinuteNow(entries.some(isRunning))
  return useMemo(() => entries.reduce((n, e) => n + minutesOf(e, now), 0), [entries, now])
}

/** The "Add time" form: a duration ending now (or at 17:00 on another day), or a start and an end. */
function AddTime({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const today = logicalToday()
  const [range, setRange] = useState(false)
  const [duration, setDuration] = useState('')
  const [day, setDay] = useState(today)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    let from: number, to: number
    if (range) {
      if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return setError(t('Enter a start and an end time'))
      from = at(day, start)
      to = at(day, end)
    } else {
      const mins = parseDuration(duration)
      if (!mins) return setError(t('Use a duration such as 45m, 1h30 or 90'))
      to = day === today ? Date.now() : at(day, '17:00')
      from = to - mins * 60000
    }
    if (to < from) return setError(t('The end is before the start'))
    setError(null)
    act(logTime(taskId, from, to, note.trim()).then(onDone))
  }
  return (
    <form onSubmit={submit} className="mb-3 space-y-2 rounded-control border border-default p-3" data-time-add>
      {range ? (
        <div className="flex gap-2">
          <Field label={t('Start')} className="flex-1"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} data-time-start /></Field>
          <Field label={t('End')} className="flex-1"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} data-time-end /></Field>
        </div>
      ) : (
        <Field label={t('Time spent')} description={t('45m, 1h30 or 90 (minutes); it ends now, or at 17:00 on another day')}>
          <Input value={duration} onChange={(e) => setDuration(e.target.value)} autoFocus inputMode="text" data-time-duration />
        </Field>
      )}
      <div className="flex gap-2">
        <Field label={t('Day')} className="flex-1"><Input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value || today)} data-time-day /></Field>
        <Field label={t('Note')} className="flex-[2]"><Input value={note} onChange={(e) => setNote(e.target.value)} data-time-note /></Field>
      </div>
      {error && <p role="alert" className="text-meta text-danger" data-time-error>{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm">{t('Save')}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setRange((v) => !v); setError(null) }}>{range ? t('Enter a duration instead') : t('Enter a start and an end')}</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>{t('Cancel')}</Button>
      </div>
    </form>
  )
}

/** Editing an own entry: its start, end and note; each field is its own op. */
function EditEntry({ entry, onDone }: { entry: TimeEntry; onDone: () => void }) {
  const day = localDay(entry.started_at)
  const endDay = entry.ended_at === null ? day : localDay(entry.ended_at)
  const [start, setStart] = useState(hhmm(entry.started_at))
  const [end, setEnd] = useState(entry.ended_at === null ? '' : hhmm(entry.ended_at))
  const [note, setNote] = useState(entry.note)
  const [error, setError] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const patch: { started_at?: number; ended_at?: number; note?: string } = {}
    const s = at(day, start)
    if (s !== entry.started_at) patch.started_at = s
    if (entry.ended_at !== null || end) {
      const en = end ? at(endDay < day ? day : endDay, end) : entry.ended_at!
      if (en !== entry.ended_at) patch.ended_at = en
    }
    if (note.trim() !== entry.note) patch.note = note.trim()
    if (Object.keys(patch).length === 0) return onDone()
    updateTimeEntry(entry.id, patch).then(onDone, (err) => {
      if (err instanceof TimeRangeError) setError(t('The end is before the start'))
      else act(Promise.reject(err))
    })
  }
  return (
    <form onSubmit={submit} className="space-y-2 rounded-control border border-default p-3" data-time-edit>
      <div className="flex gap-2">
        <Field label={t('Start')} className="flex-1"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} autoFocus data-time-start /></Field>
        <Field label={t('End')} className="flex-1"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} data-time-end /></Field>
      </div>
      <Field label={t('Note')}><Input value={note} onChange={(e) => setNote(e.target.value)} data-time-note /></Field>
      {error && <p role="alert" className="text-meta text-danger" data-time-error>{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm">{t('Save')}</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>{t('Cancel')}</Button>
      </div>
    </form>
  )
}

/** One entry: day, times, duration, note, and the author in a shared project. */
function EntryRow({ entry, now, author, own, onEdit }: { entry: TimeEntry; now: number; author: string | null; own: boolean; onEdit: () => void }) {
  const dt = useDateTimeFormat()
  const day = entryDay(entry.started_at)
  const span = `${formatTime(hhmm(entry.started_at), dt.resolved)}–${entry.ended_at === null ? t('now') : formatTime(hhmm(entry.ended_at), dt.resolved)}`
  const minutes = minutesOf(entry, now)
  const inverted = entry.ended_at !== null && entry.ended_at < entry.started_at
  return (
    <li className="flex items-start gap-2 rounded-control px-2 py-1.5 hover:bg-sunken dark:hover:bg-raised" data-time-entry={entry.id} data-running={entry.ended_at === null || undefined}>
      {author && <Avatar id={entry.user_id} name={author} className="mt-0.5" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-body">
          <span className="font-medium tabular-nums" data-time-duration-text>{formatMinutes(minutes)}</span>
          <span className="text-meta tabular-nums text-muted">{formatDate(day, 'compact', dt.resolved)} · {span}</span>
          {author && <span className="text-meta text-muted" data-time-author>{author}</span>}
          {inverted && <span className="text-meta text-on-warning-soft">{t('The end is before the start; edit it to repair')}</span>}
        </div>
        {entry.note && <p className="user-text text-meta text-muted">{entry.note}</p>}
      </div>
      {own && (
        <Menu kind="menu" label={t('Actions for this time entry')} trigger={<Icon name="ellipsis" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-1.5 py-0.5 text-faint" width="sm:w-48">
          <MenuItem label={t('Edit')} icon="pencil" onSelect={onEdit} data-time-entry-edit />
          <MenuItem label={t('Delete')} icon="trash-2" danger onSelect={() => act(deleteTimeEntry(entry.id))} data-time-entry-delete />
        </Menu>
      )}
    </li>
  )
}

export function TimeTab({ task, readOnly }: { task: Task; readOnly: boolean }) {
  const entries = useTaskEntries(task.id)
  const me = useMe()
  const running = useRunningEntry()
  const memberships = useLiveQuery(() => membershipMap(), [], new Map<string, Membership>())
  const shared = !!task.project_id && memberships.has(task.project_id)
  const now = useMinuteNow(entries.some(isRunning))
  const total = useMemo(() => entries.reduce((n, e) => n + minutesOf(e, now), 0), [entries, now])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const stop = running?.task_id === task.id
  const canStart = !readOnly && !task.deleted_at && !task.completed_at
  const listId = useId()
  const author = (id: string) => (!shared ? null : id === me ? t('You') : memberName(id, memberships) ?? t('Former member'))
  return (
    <div className="pt-2" data-time-tab>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {(stop || canStart) && (
          <Button variant={stop ? 'secondary' : 'primary'} size="sm" icon={stop ? 'square' : 'timer'} onClick={() => act(toggleTracking(task.id))} data-time-toggle>
            {stop ? t('Stop tracking') : t('Start tracking')}
          </Button>
        )}
        {!readOnly && !adding && <Button variant="ghost" size="sm" icon="plus" onClick={() => setAdding(true)} data-time-add-open>{t('Add time')}</Button>}
        <span className="ml-auto text-meta tabular-nums text-muted" data-time-total>{t('Total {duration}', { duration: formatMinutes(total) })}</span>
      </div>
      {adding && <AddTime taskId={task.id} onDone={() => setAdding(false)} />}
      {entries.length === 0 && !adding && <p className="py-2 text-meta text-muted">{t('No time tracked yet.')}</p>}
      <ul id={listId} className="space-y-0.5" aria-label={t('Time entries')}>
        {entries.map((e) => editing === e.id
          ? <li key={e.id}><EditEntry entry={e} onDone={() => setEditing(null)} /></li>
          : <EntryRow key={e.id} entry={e} now={now} author={author(e.user_id)} own={!readOnly && e.user_id === me} onEdit={() => setEditing(e.id)} />)}
      </ul>
    </div>
  )
}
