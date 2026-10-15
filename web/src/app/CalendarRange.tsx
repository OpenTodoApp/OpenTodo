// The Day | Week | Month switch of the Calendar destination (OpenSpec changes
// ux-overhaul and month-and-timeline-views): one control in each calendar view's
// page header. Switching keeps the anchor date, so Week of 18 November → Month
// opens November and Day from there opens the 18th.
import { navigate } from './router'

export type CalendarRangeMode = 'day' | 'week' | 'month'

const MODES: { mode: CalendarRangeMode; label: string }[] = [
  { mode: 'day', label: 'Day' },
  { mode: 'week', label: 'Week' },
  { mode: 'month', label: 'Month' },
]

export function CalendarRangeSwitch({ mode, date }: { mode: CalendarRangeMode; date?: string }) {
  return (
    <span className="flex rounded-control border border-default text-meta" role="group" aria-label="Calendar range">
      {MODES.map((m, i) => (
        <button key={m.mode} type="button" aria-pressed={mode === m.mode} onClick={() => navigate({ view: m.mode, date })}
          className={`px-2 py-1 ${i === 0 ? 'rounded-l-control' : ''} ${i === MODES.length - 1 ? 'rounded-r-control' : ''} ${mode === m.mode ? 'bg-sunken font-medium dark:bg-raised' : 'text-muted'}`}>
          {m.label}
        </button>
      ))}
    </span>
  )
}
