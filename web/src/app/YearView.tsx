// The Year view (OpenSpec change year-view): the twelve months of a year, for seeing a
// year at a glance and going from it to a month or a day. Loads on first use.
import { useMemo } from 'react'
import { MonthsSpanView } from './calendar/MonthsSpanView'
import { useToday } from './useViews'

export default function YearView({ date }: { date?: string }) {
  const today = useToday()
  const anchor = date ?? today
  const year = anchor.slice(0, 4)
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`), [year])
  return <MonthsSpanView mode="year" anchor={anchor} title={year} months={months} />
}
