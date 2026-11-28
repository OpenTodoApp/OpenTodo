// Upcoming's week on a phone (OpenSpec change phone-modern-look, design D2): the
// next seven days as a row of day pills, each with its weekday, its date and up to
// three dots for its tasks. A day with tasks scrolls the list to its group; a day
// without is shown but cannot be chosen. The counts are the groups Upcoming already
// lists, so the strip and the list never disagree. A day's name is its visible weekday
// and date, then its number of tasks. While a task is dragged each day takes it as a
// drop and moves it to that day (OpenSpec change phone-delight, design D5).
import { addDaysISO, formatDateParts } from '../../lib/dates'
import { t } from '../../lib/i18n'

export function WeekStrip({ today, counts, onDay }: { today: string; counts: ReadonlyMap<string, number>; onDay: (date: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i + 1))
  return (
    <ol aria-label={t('Next seven days')} data-week-strip className="mb-5 grid grid-cols-7 gap-1.5">
      {days.map((date) => {
        const n = counts.get(date) ?? 0
        return (
          <li key={date} className="min-w-0">
            {/* Every day takes a dragged task, as its group in the list does (phone-delight D5), an empty day too. */}
            <button type="button" disabled={!n} onClick={() => onDay(date)} data-week-day={date} data-task-drop={`day:${date}`}
              className="press-selected flex w-full flex-col items-center gap-1 rounded-phone-card bg-surface py-2.5 shadow-2 transition-transform duration-(--duration-ui) disabled:bg-transparent disabled:shadow-none data-drop-active:scale-105 data-drop-active:bg-accent-soft data-drop-active:ring-2 data-drop-active:ring-accent dark:bg-raised dark:disabled:bg-transparent">
              <span className="text-hint text-muted">{formatDateParts(date, { weekday: 'short' })}</span>
              <span className={`text-title tabular-nums ${n ? 'text-strong' : 'text-faint'}`}>{formatDateParts(date, { day: 'numeric' })}</span>
              {/* The name is the visible weekday and date (WCAG 2.5.3), then the count the dots draw. */}
              {n > 0 && <span className="sr-only">{`, ${t('{n, plural, one {# task} other {# tasks}}', { n })}`}</span>}
              <span aria-hidden className="flex h-1.5 items-center gap-0.5">
                {Array.from({ length: Math.min(3, n) }, (_, i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-accent" />)}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
