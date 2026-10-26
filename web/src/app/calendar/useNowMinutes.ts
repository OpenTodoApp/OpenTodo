// The minute clock of the calendar's now line (time-blocking) and of Today's agenda
// (OpenSpec change today-agenda, D6), refreshed every minute.
import { useEffect, useState } from 'react'
import { logicalToday, todayISO } from '../../lib/dates'

/**
 * Minutes since the logical today's midnight (day-boundary D3): before the day start
 * the clock is past that day's 24:00, so the now line is not drawn on its column.
 */
export function useNowMinutes(): number {
  const read = () => {
    const d = new Date()
    const minutes = d.getHours() * 60 + d.getMinutes()
    return todayISO(d) === logicalToday(undefined, d.getTime()) ? minutes : minutes + 24 * 60
  }
  const [now, setNow] = useState(read)
  useEffect(() => {
    const id = setInterval(() => setNow(read()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}
