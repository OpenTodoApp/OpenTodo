// Do-on choices counted back from a deadline (OpenSpec change inbox-means-unplaced,
// design D8; inbox-triage "Scheduling sheet in triage"): On the deadline, 1 day,
// 3 days, 1 week, 2 weeks and 1 month before. A choice before today is left out;
// the others keep their keys (1 to 6). "1 month before" is the same day number a
// month earlier, or that month's last day when it has no such day. Pure.
import { addDaysISO } from './dates'
import { t } from './i18n'

export interface RelativeChoice {
  /** The key that picks it, `1` to `6`, fixed whatever is left out. */
  key: string
  id: 'on' | 'day' | 'three-days' | 'week' | 'two-weeks' | 'month'
  label: string
  /** The do-on date it means, `YYYY-MM-DD`. */
  date: string
}

/** The same day number one month earlier, clamped to that month's last day. */
export function monthBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const year = m === 1 ? y - 1 : y
  const month = m === 1 ? 12 : m - 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/** The relative choices for a deadline, as seen on `today`; empty without a deadline. */
export function relativeDoOn(deadline: string | null | undefined, today: string): RelativeChoice[] {
  if (!deadline) return []
  const all: RelativeChoice[] = [
    { key: '1', id: 'on', label: t('On the deadline'), date: deadline },
    { key: '2', id: 'day', label: t('1 day before'), date: addDaysISO(deadline, -1) },
    { key: '3', id: 'three-days', label: t('3 days before'), date: addDaysISO(deadline, -3) },
    { key: '4', id: 'week', label: t('1 week before'), date: addDaysISO(deadline, -7) },
    { key: '5', id: 'two-weeks', label: t('2 weeks before'), date: addDaysISO(deadline, -14) },
    { key: '6', id: 'month', label: t('1 month before'), date: monthBefore(deadline) },
  ]
  return all.filter((c) => c.date >= today)
}
