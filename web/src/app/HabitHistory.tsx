// The month history of a habit (OpenSpec change habits, design D4): a grid of one
// month's days, derived on the device from the series and its occurrence records
// (lib/habits.ts), so it renders offline and needs no request. While Habits is on a
// past scheduled day opens Done, Tiny, Skipped and Clear (habits-home D6).
// Colours come from the design tokens and every state also differs by glyph or
// border, with the date and state in each cell's accessible name.
//
// Keyboard (WAI-ARIA grid): arrows move by a day or a week, Home and End go to
// the first and last day of the month, Page Up and Page Down change the month;
// moving past the month's edge turns the month. One cell holds the tab stop.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Icon, IconButton, type IconName } from '../ui'
import { addDaysISO, logicalToday, weekday, monthName } from '../lib/dates'
import { editableDay, monthGrid, type DayState } from '../lib/habits'
import type { DayChoice } from '../lib/habitActions'
import type { Task } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t } from '../lib/i18n'
import { DayMenu } from './habits/DayMenu'
import { dayLabel } from './habits/habitText'
export { dayLabel }

const CELL: Record<DayState, string> = {
  // The check is drawn in the surface colour: white in light, near-black on the brighter dark-mode green.
  done: 'bg-success text-surface',
  // Half filled (habits-home D8): the tiny version counts as done.
  tiny: 'border border-success bg-[linear-gradient(90deg,var(--color-success-soft)_50%,transparent_50%)] text-default',
  skipped: 'border border-input bg-sunken text-muted',
  // No danger colour for a missed day (habits-home "Forgiving measure"): a dashed outline.
  missed: 'border border-dashed border-strong bg-surface text-muted',
  pending: 'bg-accent-soft text-on-accent-soft',
  upcoming: 'border border-default bg-surface text-muted',
  blank: 'text-faint',
}
const GLYPH: Partial<Record<DayState, IconName>> = { done: 'check', skipped: 'minus', pending: 'circle' }

function monthOf(iso: string): { year: number; month: number } {
  const [y, m] = iso.split('-').map(Number)
  return { year: y, month: m }
}

function shiftMonth(iso: string, n: number): string {
  const { year, month } = monthOf(iso)
  const idx = year * 12 + (month - 1) + n
  const y = Math.floor(idx / 12)
  const m = idx - y * 12 + 1
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const d = Math.min(Number(iso.slice(8, 10)), last)
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const monthNameOf = (year: number, month: number, withYear: boolean) =>
  monthName(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`, 'long', withYear)

export function HabitHistory({ series, records, today = logicalToday(), onPick }: {
  series: Task
  records: readonly Task[]
  today?: string
  /** Set a past day (habits-home D6); omitted while Habits is not on, which keeps the grid read-only. */
  onPick?: (date: string, choice: DayChoice) => void
}) {
  const dt = useDateTimeFormat()
  const [focus, setFocus] = useState(today)
  const moved = useRef(false)
  const grid = useRef<HTMLDivElement>(null)
  const { year, month } = monthOf(focus)
  const days = useMemo(() => monthGrid(series, records, year, month, today), [series, records, year, month, today])

  // Leading blanks so the first day falls under its weekday (week start follows the preference).
  const first = days[0].date
  const header = dt.weekDays(first)
  const lead = header.indexOf(first)
  const cells: ({ date: string; state: DayState; today: boolean } | null)[] = [...Array(lead).fill(null), ...days]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))

  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    grid.current?.querySelector<HTMLElement>(`[data-date="${focus}"]`)?.focus()
  }, [focus])

  const go = (date: string) => {
    moved.current = true
    setFocus(date)
  }
  const onKey = (e: KeyboardEvent) => {
    const last = days[days.length - 1].date
    const keys: Record<string, () => string> = {
      ArrowLeft: () => addDaysISO(focus, -1),
      ArrowRight: () => addDaysISO(focus, 1),
      ArrowUp: () => addDaysISO(focus, -7),
      ArrowDown: () => addDaysISO(focus, 7),
      Home: () => first,
      End: () => last,
      PageUp: () => shiftMonth(focus, -1),
      PageDown: () => shiftMonth(focus, 1),
    }
    const next = keys[e.key]
    if (!next) return
    e.preventDefault()
    go(next())
  }

  const heading = monthNameOf(year, month, true)
  const headingId = `habit-month-${series.id}`
  return (
    <div className="w-fit space-y-1" data-habit-history>
      <div className="flex items-center gap-1">
        <IconButton icon="chevron-left" size="sm" label={t('Previous month')} onClick={() => setFocus(shiftMonth(focus, -1))} />
        <p id={headingId} className="min-w-0 flex-1 text-center text-meta font-semibold text-default" aria-live="polite">{heading}</p>
        <IconButton icon="chevron-right" size="sm" label={t('Next month')} onClick={() => setFocus(shiftMonth(focus, 1))} />
      </div>
      <div ref={grid} role="grid" aria-labelledby={headingId} className="flex w-fit flex-col gap-1" onKeyDown={onKey}>
        <div role="row" className="flex gap-1">
          {header.map((d) => (
            <span key={d} role="columnheader" aria-label={weekday(d)} className="flex h-6 w-6 items-center justify-center text-hint text-muted">
              {weekday(d).slice(0, 2)}
            </span>
          ))}
        </div>
        {weeks.map((week, w) => (
          <div key={w} role="row" className="flex gap-1">
            {week.map((c, i) => c ? (
              <span
                key={c.date}
                role="gridcell"
                data-date={c.date}
                data-state={c.state}
                aria-label={dayLabel(c.date, c.state)}
                aria-current={c.today ? 'date' : undefined}
                aria-selected={c.date === focus}
                tabIndex={c.date === focus ? 0 : -1}
                onClick={() => setFocus(c.date)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && e.currentTarget.querySelector('button')) { e.preventDefault(); e.currentTarget.querySelector('button')!.click() }
                }}
                className={`flex h-6 w-6 items-center justify-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus
                  ${CELL[c.state]} ${c.today ? 'ring-1 ring-focus' : ''}`}
              >
                {onPick && editableDay(c, today)
                  ? <DayMenu cell={c} label={dayLabel(c.date, c.state)} onPick={(choice) => onPick(c.date, choice)}
                    trigger={<Glyph state={c.state} date={c.date} />} triggerClassName="flex h-6 w-6 items-center justify-center rounded-chip" />
                  : <Glyph state={c.state} date={c.date} />}
              </span>
            ) : <span key={`blank-${w}-${i}`} role="gridcell" aria-hidden="true" className="h-6 w-6" />)}
          </div>
        ))}
      </div>
    </div>
  )
}

/** A glyph for done, skipped and pending; the day number elsewhere, for orientation. */
function Glyph({ state, date }: { state: DayState; date: string }) {
  return GLYPH[state] ? <Icon name={GLYPH[state]!} size="xs" /> : <span aria-hidden="true" className="text-hint tabular-nums">{Number(date.slice(8))}</span>
}
