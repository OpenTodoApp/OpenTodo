// The Quarter view's calendar math (OpenSpec `quarter-view-and-plan-spans`, design D1):
// a quarter is the calendar quarter of the anchor's month, never a rolling 90 days,
// so it can be named, stepped with [ and ] and matched to the quarterly objectives.
import { monthEnd } from './month'

export interface Quarter {
  /** 1 to 4. */
  n: number
  year: number
  /** Three `YYYY-MM` keys, in order. */
  months: string[]
  /** First and last ISO date of the quarter, inclusive. */
  from: string
  to: string
  /** "Q4 2026": a number and a letter, the same in every language. */
  title: string
}

/** The calendar quarter holding `anchor` (an ISO date). */
export function quarterOf(anchor: string): Quarter {
  const year = Number(anchor.slice(0, 4))
  const month = Number(anchor.slice(5, 7))
  const n = Math.floor((month - 1) / 3) + 1
  const first = (n - 1) * 3 + 1
  const months = [0, 1, 2].map((i) => `${year}-${String(first + i).padStart(2, '0')}`)
  return { n, year, months, from: `${months[0]}-01`, to: monthEnd(months[2]), title: `Q${n} ${year}` }
}
