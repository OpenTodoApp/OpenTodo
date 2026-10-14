// Typed input of the date and time fields (OpenSpec change date-time-preferences,
// design D4). Pure: the result depends only on the text, today's date and the
// resolved preferences. Dates are read as ISO, then as numbers in the user's order
// (rolling forward like quick add), then as quick-add phrases (today, fri, next
// week) in the user's languages. Times are read in 12-hour or 24-hour form
// whatever the time format.
import type { ResolvedDateTime } from '../../lib/dates'
import { isValidDate, matchDateAt, nextOccurrence, toISO, type DateContext } from '../../lib/nlp/dates'
import { tokenize } from '../../lib/nlp/tokenize'
import { vocabulariesFor } from '../../lib/nlp/vocab'

export interface DateParseOptions {
  /** Reference local date, YYYY-MM-DD. */
  today: string
  prefs: Pick<ResolvedDateTime, 'order' | 'weekStart'>
  /** Quick-add languages for relative words; English is always included. */
  languages?: readonly string[]
}

/** A typed date as `YYYY-MM-DD`, or null when it is not a valid date. */
export function parseDateInput(text: string, opts: DateParseOptions): string | null {
  const s = text.trim()
  if (!s) return null
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    return isValidDate(y, m, d) ? toISO(y, m, d) : null
  }
  const num = /^(\d{1,4})[/.-](\d{1,2})(?:[/.-](\d{1,4}))?\.?$/.exec(s)
  if (num) return numericDate(num, opts)
  return phraseDate(s, opts)
}

function numericDate(m: RegExpExecArray, { today, prefs }: DateParseOptions): string | null {
  const a = Number(m[1]), b = Number(m[2])
  const rawYear = m[3]
  let year: number | null = null
  let month: number, day: number
  if (prefs.order === 'YMD' && m[1].length === 4) {
    // 2026/10/14 or 2026.10.14 in an ISO-style order.
    if (!rawYear) return null
    year = a
    month = b
    day = Number(rawYear)
  } else {
    if (m[1].length > 2 || (rawYear && rawYear.length === 3)) return null
    ;[day, month] = prefs.order === 'MD' ? [b, a] : [a, b]
    if (rawYear) year = rawYear.length <= 2 ? 2000 + Number(rawYear) : Number(rawYear)
  }
  if (year !== null) return isValidDate(year, month, day) ? toISO(year, month, day) : null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return nextOccurrence(today, month, day)
}

function phraseDate(s: string, { today, prefs, languages = [] }: DateParseOptions): string | null {
  const { tokens } = tokenize(s)
  if (!tokens.length) return null
  const ctx: DateContext = {
    today,
    vocabs: vocabulariesFor(languages),
    dayMonthOrder: prefs.order === 'MD' ? 'MD' : 'DM',
    weekStart: prefs.weekStart,
  }
  const match = matchDateAt(tokens, 0, ctx)
  return match && match.to === tokens.length ? match.date : null
}

/** A typed time as `HH:MM`: `15`, `1530`, `15:30`, `3pm`, `3:30 pm`, `noon`, `midnight`. */
export function parseTimeInput(text: string): string | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!s) return null
  if (s === 'noon' || s === 'midday') return '12:00'
  if (s === 'midnight') return '00:00'
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|a|p)?$/.exec(s)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  const suffix = m[3]?.[0]
  if (min > 59) return null
  if (suffix) {
    if (h < 1 || h > 12) return null
    h = (h % 12) + (suffix === 'p' ? 12 : 0)
  } else if (h > 23) {
    return null
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}
