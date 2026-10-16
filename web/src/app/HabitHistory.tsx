// The month history of a habit (OpenSpec change habits, design D4): a read-only
// grid of one month's days, derived on the device from the series and its
// occurrence records (lib/habits.ts), so it renders offline and needs no request.
// Colours come from the design tokens and every state also differs by glyph or
// border, with the date and state in each cell's accessible name.
//
// Keyboard (WAI-ARIA grid): arrows move by a day or a week, Home and End go to
// the first and last day of the month, Page Up and Page Down change the month;
// moving past the month's edge turns the month. One cell holds the tab stop.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Icon, IconButton, type IconName } from '../ui'
import { addDaysISO, todayISO, weekday } from '../lib/dates'
import { monthGrid, type DayState } from '../lib/habits'
import type { Task } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'

const CELL: Record<DayState, string> = {
  // The check is drawn in the surface colour: white in light, near-black on the brighter dark-mode green.
  done: 'bg-success text-surface',
  skipped: 'border border-input bg-sunken text-muted',
  missed: 'border border-dashed border-danger bg-danger-soft text-on-danger-soft',
  pending: 'bg-accent-soft text-on-accent-soft',
  upcoming: 'border border-default bg-surface text-muted',
  blank: 'text-faint',
}
const GLYPH: Partial<Record<DayState, IconName>> = { done: 'check', skipped: 'minus', pending: 'circle' }
const STATE_TEXT: Record<DayState, string> = {
  done: 'done', skipped: 'skipped', missed: 'missed', pending: 'due, not done yet', upcoming: 'upcoming', blank: 'not scheduled',
}

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

const monthName = (year: number, month: number, withYear: boolean) =>
  new Intl.DateTimeFormat(undefined, { month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))

/** "6 October, skipped": the cell's accessible name. */
export function dayLabel(iso: string, state: DayState): string {
  const { year, month } = monthOf(iso)
  return `${Number(iso.slice(8, 10))} ${monthName(year, month, false)}, ${STATE_TEXT[state]}`
}

export function HabitHistory({ series, records, today = todayISO() }: { series: Task; records: readonly Task[]; today?: string }) {
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

  const heading = monthName(year, month, true)
  const headingId = `habit-month-${series.id}`
  return (
    <div className="w-fit space-y-1" data-habit-history>
      <div className="flex items-center gap-1">
        <IconButton icon="chevron-left" size="sm" label="Previous month" onClick={() => setFocus(shiftMonth(focus, -1))} />
        <p id={headingId} className="min-w-0 flex-1 text-center text-meta font-semibold text-default" aria-live="polite">{heading}</p>
        <IconButton icon="chevron-right" size="sm" label="Next month" onClick={() => setFocus(shiftMonth(focus, 1))} />
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
                className={`flex h-6 w-6 items-center justify-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus
                  ${CELL[c.state]} ${c.today ? 'ring-1 ring-focus' : ''}`}
              >
                {/* A glyph for done, skipped and pending; the day number elsewhere, for orientation. */}
                {GLYPH[c.state] ? <Icon name={GLYPH[c.state]!} size="xs" /> : <span aria-hidden="true" className="text-hint tabular-nums">{Number(c.date.slice(8))}</span>}
              </span>
            ) : <span key={`blank-${w}-${i}`} role="gridcell" aria-hidden="true" className="h-6 w-6" />)}
          </div>
        ))}
      </div>
    </div>
  )
}
