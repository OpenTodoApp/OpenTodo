// Away periods (OpenSpec change away-periods, design D3, D4): the stored
// `user_prefs.away`, "" or "YYYY-MM-DD..YYYY-MM-DD" followed by " quiet" when
// reminders and the digest are paused. internal/sync/away.go reads it the same
// way; both are pinned by internal/sync/testdata/away.vectors.json. A malformed
// value reads as no period and is kept. The skips are planned in awayPlan.ts.
import { useUserPrefsRow } from './localData'

export const MAX_AWAY_DAYS = 90

export interface Away {
  from: string
  to: string
  quiet: boolean
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

function isDay(s: string): boolean {
  if (!DAY.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Days from `from` to `to`, both included. */
export function awayDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
}

/** The stored value read as a period, or null for "" and anything malformed. */
export function parseAway(value: unknown): Away | null {
  if (typeof value !== 'string') return null
  const quiet = value.endsWith(' quiet')
  const range = quiet ? value.slice(0, -' quiet'.length) : value
  const parts = range.split('..')
  if (parts.length !== 2) return null
  const [from, to] = parts
  if (!isDay(from) || !isDay(to) || from > to || awayDays(from, to) > MAX_AWAY_DAYS) return null
  return { from, to, quiet }
}

/** The stored form of a period. */
export const formatAway = (a: Away): string => `${a.from}..${a.to}${a.quiet ? ' quiet' : ''}`

/** The period when `today` is within it, else null. */
export function awayOn(value: unknown, today: string): Away | null {
  const a = parseAway(value)
  return a && a.from <= today && today <= a.to ? a : null
}

/** Whether reminders are held on `today` (D4). */
export const quietOn = (value: unknown, today: string): boolean => !!awayOn(value, today)?.quiet

/** The period holding on `today` (the caller's useToday()), live; null when none. */
export function useAwayOn(today: string): Away | null {
  return awayOn(useUserPrefsRow()?.away, today)
}
