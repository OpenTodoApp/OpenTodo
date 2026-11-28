// The date sheet of the phone (OpenSpec change phone-ui-trial, "Phone date sheet",
// design D10): quick choices as rows, a month with days a thumb can hit, a time
// row, the parts of the day, Clear. This is the panel; what opens it puts it in a
// bottom sheet. No typed field: on a phone the keyboard would cover the month.
import { useState, type ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { monthGrid } from '../../lib/month'
import { Icon, type IconName } from '../../ui'

export interface DateChoice {
  id: string
  label: string
  icon: IconName
  /** What the choice means, in words ("Sat 17 Oct"); empty for Someday. */
  hint: string
  date: string | 'someday'
}

export interface PhoneDatePanelProps {
  /** `YYYY-MM-DD`, or null when the task has no date. */
  value: string | null
  today: string
  choices: DateChoice[]
  /** 0 is Sunday. */
  weekStart: number
  /** The names of the seven weekdays, starting on `weekStart`, one or two letters each. */
  weekdays: string[]
  /** The month's name with its year ("October 2026"). */
  monthName: (anchor: string) => string
  /** The time row and the parts of the day, drawn by what opens the sheet. */
  time?: ReactNode
  parts?: ReactNode
  onPick: (date: string | 'someday') => void
  onClear?: () => void
}

/** The first day of the month `delta` months from `anchor`'s. */
function shiftMonth(anchor: string, delta: number): string {
  const [y, m] = anchor.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function PhoneDatePanel({ value, today, choices, weekStart, weekdays, monthName, time, parts, onPick, onClear }: PhoneDatePanelProps) {
  const [anchor, setAnchor] = useState(`${(value ?? today).slice(0, 7)}-01`)
  const month = anchor.slice(0, 7)
  // Only the weeks that hold a day of the month: five for most months, so the sheet stays short.
  const weeks = monthGrid(anchor, weekStart).filter((w) => w.some((iso) => iso.slice(0, 7) === month))
  return (
    <div data-phone-date className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-2">
        {choices.map((c) => {
          const on = c.date === value
          return (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c.date)} data-date-choice={c.id} aria-pressed={on}
                className={`flex min-h-12 w-full items-center gap-2.5 rounded-card px-3 text-start focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${on ? 'bg-accent-soft' : 'bg-canvas'}`}>
                <Icon name={c.icon} size="md" className={on ? 'text-accent' : 'text-muted'} />
                <span className="flex min-w-0 flex-col">
                  <span className={`truncate text-body font-medium ${on ? 'text-accent' : 'text-strong'}`}>{c.label}</span>
                  {c.hint && <span className="truncate text-hint text-muted">{c.hint}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="rounded-phone-card bg-canvas p-2" data-date-month={month}>
        <div className="flex items-center">
          <p className="flex-1 px-2 text-title text-strong" aria-live="polite">{monthName(anchor)}</p>
          <button type="button" aria-label={t('Previous month')} onClick={() => setAnchor(shiftMonth(anchor, -1))} data-date-prev
            className="flex h-11 w-11 items-center justify-center rounded-control text-muted focus-visible:outline-2 focus-visible:outline-focus"><Icon name="chevron-left" size="md" /></button>
          <button type="button" aria-label={t('Next month')} onClick={() => setAnchor(shiftMonth(anchor, 1))} data-date-next
            className="flex h-11 w-11 items-center justify-center rounded-control text-muted focus-visible:outline-2 focus-visible:outline-focus"><Icon name="chevron-right" size="md" /></button>
        </div>
        <div className="grid grid-cols-7 text-center text-hint text-faint" aria-hidden>
          {weekdays.map((w, i) => <span key={i} className="py-1">{w}</span>)}
        </div>
        <div role="grid" aria-label={monthName(anchor)}>
          {weeks.map((week) => (
            <div role="row" key={week[0]} className="grid grid-cols-7">
              {week.map((iso) => {
                const inMonth = iso.slice(0, 7) === month
                const chosen = iso === value
                const isToday = iso === today
                return (
                  <button type="button" role="gridcell" key={iso} onClick={() => onPick(iso)} data-date-day={iso}
                    aria-selected={chosen} aria-current={isToday ? 'date' : undefined}
                    className="flex h-11 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-full text-prose tabular-nums ${chosen ? 'bg-accent font-semibold text-on-accent' : isToday ? 'font-semibold text-accent' : inMonth ? 'text-strong' : 'text-faint'}`}>
                      {Number(iso.slice(8))}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {(time || parts) && (
        <div className="rounded-phone-card bg-canvas [&>*+*]:border-t [&>*+*]:border-soft">
          {time}
          {parts}
        </div>
      )}

      {onClear && (
        <button type="button" onClick={onClear} data-date-clear
          className="min-h-11 rounded-phone-card bg-canvas text-prose text-danger focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">{t('Clear')}</button>
      )}
    </div>
  )
}
