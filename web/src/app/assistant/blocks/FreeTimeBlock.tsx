// Free time in an answer (OpenSpec change assistant-time-blocks, spec "Free time
// block"): each day's free stretches within the working day, between calendar
// events, frames, slots and timed tasks, as freeTime.ts computes them (pinned to the
// server's find_free_time). A strip shows where in the working day they fall; titles
// are never needed, so encrypted accounts look the same. Activating a day opens it.
// Read-only: placing a task is a proposal. Lazy chunk.
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useFreeTime } from '../../../lib/assistantBlockData'
import { formatDate, formatTime } from '../../../lib/dates'
import { formatMinutes } from '../../../lib/duration'
import type { FreeStretch } from '../../../lib/freeTime'
import { t } from '../../../lib/i18n'
import { navigate } from '../../router'

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
/** A wall time as the user reads times; the end of a day is midnight. */
const clock = (hhmm: string) => formatTime(hhmm === '24:00' ? '00:00' : hhmm)

function Strip({ free, start, end }: { free: readonly FreeStretch[]; start: number; end: number }) {
  const span = Math.max(1, end - start)
  return (
    <div className="relative h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true" data-free-strip>
      {free.map((f) => (
        <span key={f.start} className="absolute inset-y-0 rounded-full bg-accent"
          style={{ left: `${((minutes(f.start) - start) / span) * 100}%`, width: `${(f.minutes / span) * 100}%` }} />
      ))}
    </div>
  )
}

export default function FreeTimeBlock({ block }: { block: Extract<AssistantBlock, { kind: 'free_time' }> }) {
  const view = useFreeTime(block)
  if (!view) return null
  return (
    <ol className="divide-y divide-default" data-assistant-free-time>
      {view.days.map((day) => {
        const total = day.free.reduce((n, f) => n + f.minutes, 0)
        return (
          <li key={day.date} className="space-y-2 px-3 py-2.5" data-free-day={day.date}>
            <div className="flex items-center gap-2">
              <button type="button" className="min-h-9 text-body font-semibold hover:underline" onClick={() => navigate({ view: 'day', date: day.date })}>{formatDate(day.date, 'long')}</button>
              <span className="ml-auto text-meta tabular-nums text-muted">{total ? t('{time} free', { time: formatMinutes(total) }) : t('No free time')}</span>
            </div>
            <Strip free={day.free} start={view.dayStart} end={view.dayEnd} />
            {day.free.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {day.free.map((f) => (
                  <li key={f.start} className="inline-flex items-center gap-1.5 rounded-control bg-accent-soft px-2 py-1 text-meta tabular-nums" data-free-stretch={`${f.start}-${f.end}`}>
                    <span className="font-medium">{t('{start}–{end}', { start: clock(f.start), end: clock(f.end) })}</span>
                    <span className="text-muted">{formatMinutes(f.minutes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ol>
  )
}
