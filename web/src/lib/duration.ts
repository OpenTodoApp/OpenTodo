// Duration estimates (OpenSpec `time-blocking`): parsing the detail panel's shorthand
// and formatting minutes for rows, blocks and capacity headers. Pure, no dependencies.
import { MAX_ESTIMATE_MINUTES, matchDuration } from './nlp/attributes'

export { MAX_ESTIMATE_MINUTES }

/** Presets offered next to the estimate input, in minutes. */
export const ESTIMATE_PRESETS = [15, 30, 45, 60, 90, 120] as const

/**
 * Parse an estimate typed by the user: `15m`, `45min`, `1h`, `1.5h`, `1h30`, `1h 30m`,
 * `1:30` or a bare number of minutes (`90`). Case and inner spaces are ignored; a
 * leading `+` (quick-add style) is accepted. Returns whole minutes in 1–10080, or
 * null for anything else (empty, zero, out of range, unparseable).
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, '').replace(/^\+/, '')
  if (!s) return null
  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(s)
  if (clock) return inRange(Number(clock[1]) * 60 + Number(clock[2]))
  // The quick-add matcher already knows the `+…` forms; reuse it so both entry points agree.
  return matchDuration(`+${s}`, { bareHourIsTime: false })
}

function inRange(n: number): number | null {
  return Number.isInteger(n) && n >= 1 && n <= MAX_ESTIMATE_MINUTES ? n : null
}

/** `15` → `15m`, `60` → `1h`, `90` → `1h 30m`. Zero and negatives format as `0m`. */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}
