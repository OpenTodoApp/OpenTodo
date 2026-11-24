// The Quarter view (OpenSpec change quarter-view-and-plan-spans): the three months of
// the anchor's calendar quarter, the horizon between Month and Year. Loads on first use.
import { useMemo } from 'react'
import { t } from '../lib/i18n'
import { quarterOf } from '../lib/quarter'
import { MonthsSpanView } from './calendar/MonthsSpanView'
import { useToday } from './useViews'

export default function QuarterView({ date }: { date?: string }) {
  const today = useToday()
  const anchor = date ?? today
  const quarter = useMemo(() => quarterOf(anchor), [anchor])
  return <MonthsSpanView mode="quarter" anchor={anchor} title={t('Q{n} {year}', { n: quarter.n, year: quarter.year })} months={quarter.months} />
}
