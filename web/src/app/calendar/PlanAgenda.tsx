// The Plan below 640 px (OpenSpec change planner-view, design D8): the span's days
// listed vertically, each with its date, capacity bar, event rows, task rows and
// projected rows; no columns and no drag. Tapping a selected row opens the detail
// panel as a sheet, where the date is changed, as in the Week's agenda.
import { dateLocaleOf } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { Button } from '../../ui'
import type { PlanRowProps } from '../PlanView'
import { CapacityBar, PlanDayRows, type PlanDayData } from './PlanRow'

export function PlanAgenda({ days, today, dayLength, eventHue, onAdd, rowProps }: {
  days: PlanDayData[]
  today: string
  dayLength: number
  eventHue?: string
  onAdd: (date: string) => void
  rowProps: PlanRowProps
}) {
  return (
    <div className="space-y-3 py-2" data-plan-agenda>
      {days.map((day) => {
        const [y, m, d] = day.date.split('-').map(Number)
        const name = new Intl.DateTimeFormat(dateLocaleOf(), { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d))
        const empty = day.entries.length === 0 && day.events.length === 0 && day.allDay.length === 0
        return (
          <section key={day.date} data-agenda-day={day.date} aria-labelledby={`plan-${day.date}`}>
            <div className="border-b border-default px-1 pb-1">
              <h2 id={`plan-${day.date}`} className={`text-body font-semibold ${day.date === today ? 'text-accent' : 'text-strong'}`}>{name}</h2>
              <CapacityBar load={day.load} dayLength={dayLength} eventHue={eventHue} />
            </div>
            {empty
              // One quiet line per empty day (not an empty-view landmark: fourteen of them would repeat one name).
              ? (
                <div className="mt-1 flex items-center justify-between gap-2 px-1">
                  <span className="text-meta text-faint">{t('Nothing planned.')}</span>
                  <Button variant="ghost" size="sm" icon="plus" onClick={() => onAdd(day.date)}>{t('Add a task')}</Button>
                </div>
              )
              : <div className="mt-1"><PlanDayRows day={day} large {...rowProps} /></div>}
          </section>
        )
      })}
    </div>
  )
}
