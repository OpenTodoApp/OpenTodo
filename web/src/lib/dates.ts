import type { Due } from './types'

/** Local calendar date as YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return todayISO(dt)
}

export function compareDue(a: Due | null, b: Due | null): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  const ta = a.time ?? '99:99'
  const tb = b.time ?? '99:99'
  return ta < tb ? -1 : ta > tb ? 1 : 0
}

export function describeDue(due: Due | null, today = todayISO()): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later' } | null {
  if (!due) return null
  const time = due.time ? ` ${due.time}` : ''
  if (due.date < today) return { label: `${formatShort(due.date)}${time}`, tone: 'overdue' }
  if (due.date === today) return { label: `Today${time}`, tone: 'today' }
  if (due.date === addDaysISO(today, 1)) return { label: `Tomorrow${time}`, tone: 'soon' }
  if (due.date < addDaysISO(today, 7)) return { label: `${weekday(due.date)}${time}`, tone: 'soon' }
  return { label: `${formatShort(due.date)}${time}`, tone: 'later' }
}

export function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' })
}

export function formatShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const sameYear = dt.getFullYear() === new Date().getFullYear()
  return dt.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateHeading(iso: string, today = todayISO()): string {
  if (iso === today) return 'Today'
  if (iso === addDaysISO(today, 1)) return 'Tomorrow'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}
