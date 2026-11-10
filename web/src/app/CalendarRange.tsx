// The Day | Week | Month | Quarter | Plan | Year switch of the Calendar destination (OpenSpec changes
// ux-overhaul, month-and-timeline-views, planner-view, year-view and
// quarter-view-and-plan-spans): one control in each calendar view's page header.
// Switching keeps the anchor date, so Week of 18 November → Month
// opens November and Day from there opens the 18th.
import { useCalendarGo } from './calendar/scope'
import { t, msg, translatedList } from '../lib/i18n'

export type CalendarRangeMode = 'day' | 'week' | 'month' | 'quarter' | 'plan' | 'year'

// Quarter is hidden below 640 px: a sixth button would push the whole switch
// onto a second row under the date navigation on a phone (quarter-view-and-plan-spans,
// review of PR #1064). It stays reachable with `g q` and the command palette.
const MODES: { mode: CalendarRangeMode; label: string; phoneHidden?: boolean }[] = translatedList([
  { mode: 'day', label: msg('Day') },
  { mode: 'week', label: msg('Week') },
  { mode: 'month', label: msg('Month') },
  { mode: 'quarter', label: msg('Quarter'), phoneHidden: true },
  { mode: 'plan', label: msg('Plan') },
  { mode: 'year', label: msg('Year') },
], 'label')

export function CalendarRangeSwitch({ mode, date }: { mode: CalendarRangeMode; date?: string }) {
  // Inside a project's Calendar layout the switch stays in the project page (calendar-clarity D5).
  const go = useCalendarGo()
  return (
    <span className="flex rounded-control border border-default text-meta" role="group" aria-label={t('Calendar range')}>
      {MODES.map((m, i) => (
        <button key={m.mode} type="button" aria-pressed={mode === m.mode} onClick={() => go(m.mode, date)}
          className={`px-1 py-1 lg:px-2 ${m.phoneHidden ? 'hidden sm:inline' : ''} ${i === 0 ? 'rounded-l-control' : ''} ${i === MODES.length - 1 ? 'rounded-r-control' : ''} ${mode === m.mode ? 'bg-sunken font-medium dark:bg-raised' : 'text-muted'}`}>
          {m.label}
        </button>
      ))}
    </span>
  )
}
