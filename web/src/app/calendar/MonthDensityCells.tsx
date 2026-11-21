// One compact month of the Year and Quarter views (OpenSpec changes year-view D3 and
// quarter-view-and-plan-spans D2): weekday initials and six weeks of plain day cells,
// no hooks or state per cell. Both views share the one density algorithm and the one
// set of marks, so a day looks identical in the year and in its quarter.
import { formatDateParts } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { densityStep, type YearDay } from '../../lib/yearView'

// A step's mark (year-view D3): the chart ramp's fill, a longer bar and a heavier
// numeral, so no step rests on colour alone.
const STEP_BAR = ['', 'w-1/3 bg-chart-seq-3', 'w-2/3 bg-chart-seq-4', 'w-full bg-chart-seq-5']
const STEP_WEIGHT = ['font-normal', 'font-medium', 'font-semibold', 'font-bold']

/** "4 tasks" and up to three titles, then "+1 more", then "2 events" (the day's tip). */
export function tipText(day: YearDay, events: number): string[] {
  const rest = day.count - day.titles.length
  const tasks = day.count > 0 ? [t('{n, plural, one {# task} other {# tasks}}', { n: day.count }), ...day.titles.map((x) => x || t('Untitled')), ...(rest > 0 ? [t('+{hidden} more', { hidden: rest })] : [])] : []
  return [...tasks, ...(events > 0 ? [t('{n, plural, one {# event} other {# events}}', { n: events })] : [])]
}

/** One compact month; `tipId` is the tooltip element of the view that renders it. */
export function MonthCells({ weeks, month, today, focused, tipped, weekdays, interactive, day, events, over, label, tipId = 'year-day-tip' }: {
  weeks: string[][]
  month: string
  today: string
  focused: string
  /** The day whose tip is open. */
  tipped?: string
  weekdays: string[]
  interactive: boolean
  day: (d: string) => YearDay
  /** The shown calendar events of a day (calendar-events-all-views): a ring of its own, not part of the density. */
  events: (d: string) => number
  over: (d: string, day: YearDay) => boolean
  label: string
  tipId?: string
}) {
  const g = interactive
  return (
    <div role={g ? 'grid' : undefined} aria-label={g ? t('{title} calendar', { title: label }) : undefined} aria-readonly={g ? true : undefined} className="w-full select-none" data-year-cells={month}>
      <div role={g ? 'row' : undefined} className="grid grid-cols-7">
        {weekdays.map((w, i) => <div key={i} role={g ? 'columnheader' : undefined} className="text-center text-hint text-faint">{w}</div>)}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} role={g ? 'row' : undefined} className="grid grid-cols-7">
          {week.map((d) => {
            if (d.slice(0, 7) !== month) return <div key={d} role={g ? 'gridcell' : undefined} className="min-h-6" />
            const x = day(d)
            const step = densityStep(x.count)
            const isOver = over(d, x)
            const isFocused = g && d === focused
            const evs = events(d)
            const name = [formatDateParts(d, { day: 'numeric', month: 'long' }), x.count ? t('{n, plural, one {# task} other {# tasks}}', { n: x.count }) : '', evs ? t('{n, plural, one {# event} other {# events}}', { n: evs }) : '', isOver ? t('over capacity') : ''].filter(Boolean).join(', ')
            return (
              <div key={d} role={g ? 'gridcell' : undefined} tabIndex={g ? (isFocused ? 0 : -1) : undefined} data-year-day={g ? d : undefined} data-density={step}
                aria-selected={g ? isFocused : undefined} aria-current={d === today ? 'date' : undefined} aria-describedby={g && d === tipped && (x.count > 0 || evs > 0) ? tipId : undefined}
                {...(isOver ? { 'data-over': '' } : {})} {...(evs ? { 'data-events': evs } : {})}
                className={`relative flex min-h-6 min-w-0 flex-col items-center justify-center rounded-chip py-0.5 outline-none ${g ? 'cursor-pointer pointer-fine:hover:bg-hover focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-2px] focus-visible:outline-focus' : ''} ${isFocused ? 'bg-accent-soft/40' : ''}`}>
                <span className="sr-only">{name}</span>
                <span aria-hidden className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-0.5 text-hint tabular-nums ${STEP_WEIGHT[step]} ${d === today ? 'bg-accent text-on-accent' : d < today ? 'text-faint' : 'text-default'}`}>{Number(d.slice(8))}</span>
                <span aria-hidden className="flex h-1 w-4/5 justify-center">{step > 0 && <span data-density-mark className={`h-1 rounded-full ${STEP_BAR[step]}`} />}</span>
                {isOver && <span aria-hidden data-over-mark className="absolute end-0.5 top-0.5 size-1.5 rounded-full bg-danger" />}
                {evs > 0 && <span aria-hidden data-event-mark className="ui-event-mark absolute start-0.5 top-0.5" />}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
