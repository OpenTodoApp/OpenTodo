// The display's clock and date (OpenSpec change display-mode, design D3): the
// time in the user's clock format and the date in the user's date format. The
// tick is once a second with seconds, else once a minute on the minute (so an
// e-ink panel redraws as little as possible); the date rolls over by itself.
import { useEffect, useState } from 'react'
import { formatClock, formatDate, logicalDay } from '../../lib/dates'
import { useDateTimeFormat } from '../DateTimePrefsProvider'

/** The current time in ms, updated every second or on every minute. */
export function useNow(seconds: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    if (seconds) {
      const id = setInterval(() => setNow(Date.now()), 1000)
      return () => clearInterval(id)
    }
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const t = Date.now()
      timer = setTimeout(() => {
        setNow(Date.now())
        schedule()
      }, 60_000 - (t % 60_000) + 5)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [seconds])
  return now
}

export function Clock({ now, seconds }: { now: number; seconds: boolean }) {
  const dt = useDateTimeFormat()
  // The logical day (day-boundary D4): at 01:30 before a 04:00 day start the date still names yesterday.
  const today = logicalDay(now, dt.dayStart)
  return (
    <div data-display-clock>
      <p className="display-clock" aria-live="off" data-clock-time>{formatClock(now, seconds, dt.resolved)}</p>
      <p className="display-date" data-clock-date>{formatDate(today, 'full', dt.resolved, today)}</p>
    </div>
  )
}
