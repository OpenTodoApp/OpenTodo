// A habit's year (OpenSpec change habits-complete, design D7): the last 53 weeks of
// one habit as the statistics' heatmap, each day drawn by its state in the habit's
// hue (data-hue on an ancestor): done solid, the tiny version and part of an amount
// half filled, skipped a dash, missed a dashed edge. It scrolls sideways on a narrow
// screen with the current week in view, and each day is named with its date and state.
import { useCallback, useMemo } from 'react'
import { heatmapStart } from '../../lib/dashboard'
import { addDaysISO, monthName, weekdayName } from '../../lib/dates'
import { habitDays, type DayState, type HabitOptions } from '../../lib/habits'
import { noteDatesOf } from '../../lib/habitNotes'
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'
import { Heatmap, type HeatDay } from '../review/charts'
import { dayLabel } from './habitText'

const LEVEL: Record<DayState, number> = { blank: 0, upcoming: 0, rest: 0, missed: 1, skipped: 2, tiny: 3, partial: 3, done: 4, pending: 5 }
const LEVELS = [
  'bg-sunken',
  'border border-dashed border-strong',
  'bg-sunken bg-[linear-gradient(0deg,transparent_40%,var(--border-color-strong)_40%,var(--border-color-strong)_60%,transparent_60%)]',
  'bg-[linear-gradient(90deg,var(--hue-solid)_50%,var(--hue-soft)_50%)]',
  'bg-hue-solid',
  'bg-sunken ring-1 ring-inset ring-hue-solid',
]
const STATE_OF = Object.fromEntries(Object.entries(LEVEL).map(([s, l]) => [l, s])) as Record<number, DayState>

export function HabitYear({ series, rows, today, opts }: { series: Task; rows: readonly Task[]; today: string; opts?: HabitOptions }) {
  const weekStart = opts?.weekStart ?? 1
  const notes = useMemo(() => noteDatesOf(series, rows), [series, rows])
  const { weeks, states, kept, of } = useMemo(() => {
    const start = heatmapStart(today, weekStart)
    const days = habitDays(series, rows, start, today, today, opts)
    const states = new Map(days.map((d) => [d.date, d.state]))
    const weeks: (HeatDay | null)[][] = []
    for (let c = 0; c < 53; c++) {
      const col: (HeatDay | null)[] = []
      for (let r = 0; r < 7; r++) {
        const date = addDaysISO(start, c * 7 + r)
        const s = states.get(date)
        col.push(s === undefined ? null : { date, count: 0, level: LEVEL[s] })
      }
      weeks.push(col)
    }
    let kept = 0
    let of = 0
    for (const d of days) {
      if (d.state === 'done' || d.state === 'tiny' || d.state === 'partial') { kept++; of++ } else if (d.state === 'missed') of++
    }
    return { weeks, states, kept, of }
  }, [series, rows, today, weekStart, opts])
  const tip = useCallback((d: HeatDay) => dayLabel(d.date, states.get(d.date) ?? STATE_OF[d.level], notes.has(d.date)), [states, notes])
  const columnLabels = weeks.map((col) => {
    const first = col.find((d) => d?.date.slice(8) === '01')
    return first ? monthName(first.date, 'short') : ''
  })
  return (
    <div data-habit-year>
      <Heatmap weeks={weeks} tip={tip} levels={LEVELS} legend={false} columnLabels={columnLabels}
        summary={t('{kept} of {of} scheduled days kept in the last 53 weeks', { kept, of })}
        rowLabels={Array.from({ length: 7 }, (_, i) => weekdayName((weekStart + i) % 7, 'short'))} />
    </div>
  )
}
