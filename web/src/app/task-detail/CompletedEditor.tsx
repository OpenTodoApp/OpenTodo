// Editing when a completed task was completed (GitHub issue 1667), for a
// plain completed task. A task with a recurrence rule or a series is out of
// scope: its completions live on occurrence records. Every pick commits at
// once, as the date picker does; the inputs refuse a future day or time,
// and a write is never later than now.
import { useEffect, useState } from 'react'
import { logicalToday } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { updateTask } from '../../lib/ops'
import type { Task } from '../../lib/types'
import { Field, Input } from '../../ui'
import { act } from '../actionError'
import { at, hhmm } from './TimeTab'

const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function CompletedEditor({ task }: { task: Task }) {
  const done = task.completed_at ?? Date.now()
  const [day, setDay] = useState(localDay(done))
  const [time, setTime] = useState(hhmm(done))
  // A committed pick writes through the ops layer, which re-renders the
  // task with the new value: keep the fields on it.
  useEffect(() => {
    setDay(localDay(task.completed_at ?? Date.now()))
    setTime(hhmm(task.completed_at ?? Date.now()))
  }, [task.completed_at])
  const today = logicalToday()
  const write = (nextDay: string, nextTime: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDay) || !/^\d{2}:\d{2}$/.test(nextTime)) return
    const ms = Math.min(at(nextDay, nextTime), Date.now())
    if (ms === task.completed_at) return
    act(updateTask(task.id, { completed_at: ms }))
  }
  return (
    <div className="flex gap-2" data-completed-editor>
      <Field label={t('Day')} className="flex-1">
        <Input
          type="date"
          value={day}
          max={today}
          onChange={(e) => {
            const next = e.target.value || today
            setDay(next)
            write(next, time)
          }}
          data-completed-day
        />
      </Field>
      <Field label={t('Time')} className="flex-1">
        <Input
          type="time"
          value={time}
          max={day === today ? hhmm(Date.now()) : undefined}
          onChange={(e) => {
            if (!e.target.value) return
            setTime(e.target.value)
            write(day, e.target.value)
          }}
          data-completed-time
        />
      </Field>
    </div>
  )
}
