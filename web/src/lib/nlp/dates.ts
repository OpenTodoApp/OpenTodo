// Date and time phrase grammar and resolver for quick add. Pure: the result depends
// only on the tokens, the reference date/time and the vocabularies passed in.
import { nthWeekdayDate } from '../recurrence'
import type { Token } from './tokenize'
import { normalize, type DayMonthOrder, type Vocabulary } from './vocab'

export interface DateContext {
  /** Reference local calendar date, YYYY-MM-DD. */
  today: string
  /** Reference wall-clock time, HH:MM; only "in N hours" needs it. */
  now?: string
  vocabs: readonly Vocabulary[]
  dayMonthOrder: DayMonthOrder
  /** First day of the week, 0 = Sunday … 6 = Saturday (date-time-preferences D5); Monday when absent. */
  weekStart?: number
}

/** A phrase match over the token range [from, to). */
export interface DateMatch {
  date: string
  from: number
  to: number
}

export interface TimeMatch {
  time: string
  /** Set when the phrase also fixes the day ("in 3 hours" past midnight). */
  date?: string
  from: number
  to: number
}

// ---------- calendar helpers (local, string based, deterministic) ----------

export function toISO(y: number, m: number, d: number): string {
  // The Date constructor normalises overflow (Feb 30 → Mar 2), which is what the
  // relative arithmetic wants; callers that need validation use isValidDate.
  const dt = new Date(y, m - 1, d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export function fromISO(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number)
  return [y, m, d]
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = fromISO(iso)
  return toISO(y, m, d + n)
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

export function isValidDate(y: number, m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
}

/** Same day N months later, clamped to the end of the target month. */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = fromISO(iso)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: string): number {
  const [y, m, d] = fromISO(iso)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

/** The next occurrence of a weekday strictly after today. */
export function nextWeekday(today: string, wd: number): string {
  const delta = (wd - weekdayIndex(today) + 7) % 7 || 7
  return addDays(today, delta)
}

/**
 * Days since the first day of the week containing `iso`; `weekStart` is the
 * user's first day (0 = Sunday … 6 = Saturday, date-time-preferences D5), Monday
 * by default.
 */
export function daysIntoWeek(iso: string, weekStart = 1): number {
  const [y, m, d] = fromISO(iso)
  return (new Date(y, m - 1, d).getDay() - weekStart + 7) % 7
}

/**
 * "next <weekday>": the bare weekday, unless that still falls in the current
 * week (starting on `weekStart`, Monday by default), in which case the one a week
 * later (design D2).
 */
export function nextNextWeekday(today: string, wd: number, weekStart = 1): string {
  const bare = nextWeekday(today, wd)
  const lastDay = addDays(today, 6 - daysIntoWeek(today, weekStart))
  return bare <= lastDay ? addDays(bare, 7) : bare
}

/** First day of the following week (Monday unless `weekStart` says otherwise). */
export function startOfNextWeek(today: string, weekStart = 1): string {
  return addDays(today, 7 - daysIntoWeek(today, weekStart))
}

/** First day of the following month. */
export function startOfNextMonth(today: string): string {
  const [y, m] = fromISO(today)
  return toISO(y, m + 1, 1)
}

/** The first date on or after today with this month and day (Feb 29 skips to a leap year). */
export function nextOccurrence(today: string, month: number, day: number): string | null {
  const [y] = fromISO(today)
  for (let year = y; year <= y + 8; year++) {
    if (!isValidDate(year, month, day)) continue
    const iso = toISO(year, month, day)
    if (iso >= today) return iso
  }
  return null
}

function clock(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ---------- phrase matching ----------

const normalizedPhrases = new Map<string, string[][]>()

/** Normalised word lists for a vocabulary phrase list, memoised per list identity. */
function phrases(list: readonly string[], key: string): string[][] {
  let cached = normalizedPhrases.get(key)
  if (!cached) {
    cached = list.map((p) => normalize(p).split(' ').filter(Boolean))
    normalizedPhrases.set(key, cached)
  }
  return cached
}

function wordMatches(token: Token | undefined, word: string): boolean {
  if (!token || token.quoted) return false
  if (token.norm === word) return true
  // "wed." matches "wed"; but "mi" never matches "mi." (two-letter German abbreviations).
  return !word.endsWith('.') && token.norm.endsWith('.') && token.norm.slice(0, -1) === word
}

/**
 * Number of tokens at `i` consumed by the longest phrase in `list`, or 0. The
 * `key` identifies the list for the normalisation cache (vocab code + field).
 */
export function phraseAt(tokens: readonly Token[], i: number, list: readonly string[], key: string): number {
  let best = 0
  for (const words of phrases(list, key)) {
    if (words.length <= best || words.length === 0) continue
    let ok = true
    for (let k = 0; k < words.length; k++) {
      if (!wordMatches(tokens[i + k], words[k])) {
        ok = false
        break
      }
    }
    if (ok) best = words.length
  }
  return best
}

/** Longest-matching entry of a phrase → value map, with the value. */
export function lookupAt<T>(tokens: readonly Token[], i: number, map: Record<string, T>, key: string): { n: number; value: T } | null {
  let best: { n: number; value: T } | null = null
  for (const [phrase, value] of Object.entries(map)) {
    const n = phraseAt(tokens, i, [phrase], `${key}:${phrase}`)
    if (n > (best?.n ?? 0)) best = { n, value }
  }
  return best
}

export function weekdayAt(tokens: readonly Token[], i: number, v: Vocabulary): number {
  for (let wd = 0; wd < 7; wd++) {
    if (phraseAt(tokens, i, v.weekdays[wd], `${v.code}:wd${wd}`) > 0) return wd
  }
  return -1
}

/** Month index (1–12) of a token; abbreviations only when `allowAbbr`. */
function monthAt(tokens: readonly Token[], i: number, v: Vocabulary, allowAbbr: boolean): number {
  for (let m = 0; m < 12; m++) {
    const mv = v.months[m]
    if (phraseAt(tokens, i, mv.names, `${v.code}:mn${m}`) > 0) return m + 1
    if (allowAbbr && phraseAt(tokens, i, mv.abbr, `${v.code}:ma${m}`) > 0) return m + 1
  }
  return 0
}

const DAY_RE = /^(\d{1,2})(?:st|nd|rd|th|er|o|a|º|°|ª|\.)?$/
const YEAR_RE = /^(\d{4})$/

export function dayNumber(token: Token | undefined): number {
  if (!token || token.quoted) return 0
  const m = DAY_RE.exec(token.norm)
  if (!m) return 0
  const d = Number(m[1])
  return d >= 1 && d <= 31 ? d : 0
}

function yearAt(token: Token | undefined): number {
  if (!token || token.quoted) return 0
  const m = YEAR_RE.exec(token.norm)
  return m ? Number(m[1]) : 0
}

export function countAt(tokens: readonly Token[], i: number, v: Vocabulary): { n: number; count: number } | null {
  const t = tokens[i]
  if (!t || t.quoted) return null
  if (/^\d{1,3}$/.test(t.norm)) return { n: 1, count: Number(t.norm) }
  const one = phraseAt(tokens, i, v.oneWords, `${v.code}:one`)
  return one ? { n: one, count: 1 } : null
}

type Unit = 'hour' | 'day' | 'week' | 'month'

function unitAt(tokens: readonly Token[], i: number, v: Vocabulary): { n: number; unit: Unit } | null {
  for (const unit of ['hour', 'day', 'week', 'month'] as const) {
    const n = phraseAt(tokens, i, v.units[unit], `${v.code}:unit:${unit}`)
    if (n) return { n, unit }
  }
  return null
}

// ---------- dates ----------

/**
 * Longest date phrase starting at token `i`, across every active vocabulary.
 * Ties go to the earlier vocabulary (the user's preferred language).
 */
/** Tokens at `i` consumed by the longest phrase of a vocabulary word list in any active language, or 0. */
export function wordsAt(tokens: readonly Token[], i: number, ctx: DateContext, field: 'somedayWords' | 'eveningWords'): number {
  if (!tokens[i] || tokens[i].quoted) return 0
  let best = 0
  for (const v of ctx.vocabs) best = Math.max(best, phraseAt(tokens, i, v[field], `${v.code}:${field}`))
  return best
}

/**
 * A deadline phrase at `i`: a deadline word ("deadline", "Frist", "fecha límite")
 * directly followed by a date phrase (OpenSpec change deadlines, design D7).
 */
export function matchDeadlineAt(tokens: readonly Token[], i: number, ctx: DateContext): DateMatch | null {
  if (!tokens[i] || tokens[i].quoted) return null
  let best: DateMatch | null = null
  for (const v of ctx.vocabs) {
    const n = phraseAt(tokens, i, v.deadlineWords, `${v.code}:deadline`)
    if (!n) continue
    const dm = matchDateAt(tokens, i + n, ctx)
    if (dm && (!best || dm.to > best.to)) best = { date: dm.date, from: i, to: dm.to }
  }
  return best
}

export function matchDateAt(tokens: readonly Token[], i: number, ctx: DateContext): DateMatch | null {
  if (!tokens[i] || tokens[i].quoted) return null
  let best: DateMatch | null = null
  const consider = (m: DateMatch | null) => {
    if (m && (!best || m.to > best.to)) best = m
  }
  for (const v of ctx.vocabs) {
    consider(dayWordAt(tokens, i, v, ctx))
    // Optional leading preposition / article ("on", "am", "le"), only with a phrase after it.
    const pre = phraseAt(tokens, i, v.before, `${v.code}:before`)
    for (const j of pre ? [i + pre, i] : [i]) {
      const wrap = (m: { date: string; n: number } | null): DateMatch | null => (m ? { date: m.date, from: i, to: j + m.n } : null)
      consider(wrap(weekdayPhraseAt(tokens, j, v, ctx)))
      consider(wrap(ordinalWeekdayAt(tokens, j, v, ctx)))
      consider(wrap(nextPeriodAt(tokens, j, v, ctx)))
      consider(wrap(inPeriodAt(tokens, j, v, ctx)))
      consider(wrap(monthDayAt(tokens, j, v, ctx)))
      consider(wrap(numericDateAt(tokens, j, ctx)))
    }
  }
  return best
}

function dayWordAt(tokens: readonly Token[], i: number, v: Vocabulary, ctx: DateContext): DateMatch | null {
  const hit = lookupAt(tokens, i, v.dayWords, `${v.code}:day`)
  return hit ? { date: addDays(ctx.today, hit.value), from: i, to: i + hit.n } : null
}

function weekdayPhraseAt(tokens: readonly Token[], j: number, v: Vocabulary, ctx: DateContext): { date: string; n: number } | null {
  let k = j
  let qualifier: 'next' | 'this' | null = null
  const nb = phraseAt(tokens, k, v.nextBefore, `${v.code}:nb`)
  const tb = nb ? 0 : phraseAt(tokens, k, v.thisBefore, `${v.code}:tb`)
  if (nb) {
    qualifier = 'next'
    k += nb
  } else if (tb) {
    qualifier = 'this'
    k += tb
  }
  const wd = weekdayAt(tokens, k, v)
  if (wd < 0) return null
  k += 1
  if (!qualifier) {
    const na = phraseAt(tokens, k, v.nextAfter, `${v.code}:na`)
    if (na) {
      qualifier = 'next'
      k += na
    }
  }
  const date = qualifier === 'next' ? nextNextWeekday(ctx.today, wd, ctx.weekStart) : nextWeekday(ctx.today, wd)
  return { date, n: k - j }
}

// ---------- ordinal weekdays (quick-add-nth-weekday D1, D3) ----------

/**
 * A number from 1 to 4 with an ordinal suffix: `DAY_RE`'s suffixes plus the French
 * `e`, `ème` and `re`. Used only before a weekday, so "2e" is a day number nowhere else.
 * A bare number is a count, never an ordinal.
 */
const ORDINAL_RE = /^([1-4])(?:st|nd|rd|th|er|re|eme|e|o|a|º|°|ª|\.)$/

/**
 * An ordinal directly before a weekday at token i: an ordinal word, a word of
 * `ordinalsBeforeWeekday` (Portuguese "segunda", not when a list separator
 * follows it), or a suffixed number from 1 to 4. The value is 1–4, or -1 for last.
 * The weekday itself is not consumed.
 */
export function weekdayOrdinalAt(
  tokens: readonly Token[], i: number, v: Vocabulary, isWeekday: (k: number) => boolean,
): { n: number; value: number } | null {
  const t = tokens[i]
  if (!t || t.quoted) return null
  // "segunda, quarta" and "3rd, Friday" are lists, not ordinal weekdays.
  const direct = (n: number) => !/[,;]$/.test(tokens[i + n - 1].text) && isWeekday(i + n)
  const num = ORDINAL_RE.exec(t.norm)
  if (num) return direct(1) ? { n: 1, value: Number(num[1]) } : null
  const word = lookupAt(tokens, i, v.ordinals, `${v.code}:ord`)
  if (word && direct(word.n)) return word
  const pre = lookupAt(tokens, i, v.ordinalsBeforeWeekday, `${v.code}:ordwd`)
  return pre && direct(pre.n) ? pre : null
}

/**
 * A suffixed number above four directly before a weekday ("5th Friday"): no fifth
 * weekday is offered, so parse() keeps the two tokens literal as a unit instead of
 * reading the weekday alone (quick-add-nth-weekday D1). Returns the token count, or 0.
 */
export function ordinalOutOfRangeAt(tokens: readonly Token[], i: number, ctx: DateContext): number {
  const t = tokens[i]
  if (!t || t.quoted || /^\d+$/.test(t.norm) || dayNumber(t) <= 4 || /[,;]$/.test(t.text)) return 0
  return ctx.vocabs.some((v) => weekdayAt(tokens, i + 1, v) >= 0) ? 2 : 0
}

/** Tokens at k of an "of the month" phrase in any active language, or 0. */
export function ofMonthAt(tokens: readonly Token[], k: number, ctx: DateContext): number {
  let n = 0
  for (const w of ctx.vocabs) n = Math.max(n, phraseAt(tokens, k, w.ofMonthWords, `${w.code}:ofmonth`))
  return n
}

/**
 * [article] ordinal weekday [of MONTH [YEAR] | of the month]: that weekday of this
 * month, or of the next once it has passed; with a month, this year or the next;
 * with a year, that year only.
 */
function ordinalWeekdayAt(tokens: readonly Token[], j: number, v: Vocabulary, ctx: DateContext): { date: string; n: number } | null {
  let k = j + phraseAt(tokens, j, v.ordinalArticles, `${v.code}:ordart`)
  const ord = weekdayOrdinalAt(tokens, k, v, (w) => weekdayAt(tokens, w, v) >= 0)
  if (!ord) return null
  k += ord.n
  const wd = weekdayAt(tokens, k, v) + 1
  k += 1
  const [ty, tm] = fromISO(ctx.today)
  const of = phraseAt(tokens, k, v.ordinalOf, `${v.code}:ordof`)
  const month = of ? monthAt(tokens, k + of, v, true) : 0
  if (month) {
    k += of + 1
    const year = yearAt(tokens[k])
    if (year) return { date: nthWeekdayDate(year, month, ord.value, wd), n: k + 1 - j }
    const date = nthWeekdayDate(ty, month, ord.value, wd)
    return { date: date >= ctx.today ? date : nthWeekdayDate(ty + 1, month, ord.value, wd), n: k - j }
  }
  k += ofMonthAt(tokens, k, ctx)
  const date = nthWeekdayDate(ty, tm, ord.value, wd)
  if (date >= ctx.today) return { date, n: k - j }
  return { date: tm === 12 ? nthWeekdayDate(ty + 1, 1, ord.value, wd) : nthWeekdayDate(ty, tm + 1, ord.value, wd), n: k - j }
}

function nextPeriodAt(tokens: readonly Token[], j: number, v: Vocabulary, ctx: DateContext): { date: string; n: number } | null {
  let k = j
  const nb = phraseAt(tokens, k, v.nextBefore, `${v.code}:nb`)
  k += nb
  const unit = unitAt(tokens, k, v)
  if (!unit || (unit.unit !== 'week' && unit.unit !== 'month')) return null
  k += unit.n
  if (!nb) {
    const na = phraseAt(tokens, k, v.nextAfter, `${v.code}:na`)
    if (!na) return null
    k += na
  }
  return { date: unit.unit === 'week' ? startOfNextWeek(ctx.today, ctx.weekStart) : startOfNextMonth(ctx.today), n: k - j }
}

function inPeriodAt(tokens: readonly Token[], j: number, v: Vocabulary, ctx: DateContext): { date: string; n: number } | null {
  const inN = phraseAt(tokens, j, v.inWords, `${v.code}:in`)
  if (!inN) return null
  const count = countAt(tokens, j + inN, v)
  if (!count) return null
  const unit = unitAt(tokens, j + inN + count.n, v)
  if (!unit || unit.unit === 'hour') return null
  const n = inN + count.n + unit.n
  switch (unit.unit) {
    case 'day':
      return { date: addDays(ctx.today, count.count), n }
    case 'week':
      return { date: addDays(ctx.today, 7 * count.count), n }
    case 'month':
      return { date: addMonths(ctx.today, count.count), n }
  }
}

function monthDayAt(tokens: readonly Token[], j: number, v: Vocabulary, ctx: DateContext): { date: string; n: number } | null {
  // D [of] MONTH [YEAR]
  const d1 = dayNumber(tokens[j])
  if (d1) {
    let k = j + 1
    k += phraseAt(tokens, k, v.ofWords, `${v.code}:of`)
    const m = monthAt(tokens, k, v, true)
    if (m) {
      k += 1
      const y = yearAt(tokens[k])
      if (y) k += 1
      const date = resolveMonthDay(ctx.today, y, m, d1)
      return date ? { date, n: k - j } : null
    }
  }
  // MONTH D [YEAR]  |  MONTH (full name alone → the 1st)
  const mAbbr = monthAt(tokens, j, v, true)
  if (mAbbr) {
    const d2 = dayNumber(tokens[j + 1])
    if (d2) {
      let k = j + 2
      const y = yearAt(tokens[k])
      if (y) k += 1
      const date = resolveMonthDay(ctx.today, y, mAbbr, d2)
      return date ? { date, n: k - j } : null
    }
    const mFull = monthAt(tokens, j, v, false)
    if (mFull) {
      const date = resolveMonthDay(ctx.today, 0, mFull, 1)
      return date ? { date, n: 1 } : null
    }
  }
  return null
}

function resolveMonthDay(today: string, year: number, month: number, day: number): string | null {
  if (year) return isValidDate(year, month, day) ? toISO(year, month, day) : null
  return nextOccurrence(today, month, day)
}

const NUMERIC_RE = /^(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{2}|\d{4}))?\.?$/
const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/

function numericDateAt(tokens: readonly Token[], j: number, ctx: DateContext): { date: string; n: number } | null {
  const t = tokens[j]
  if (!t || t.quoted) return null
  const iso = ISO_RE.exec(t.norm)
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    return isValidDate(y, m, d) ? { date: toISO(y, m, d), n: 1 } : null
  }
  const m = NUMERIC_RE.exec(t.norm)
  if (!m) return null
  const dotted = m[2] === '.'
  // A trailing dot only belongs to the German "12.11." form.
  if (t.norm.endsWith('.') && !dotted) return null
  // "9.30" is a time or a number in month/day locales; dotted dates are D.M only.
  if (dotted && ctx.dayMonthOrder !== 'DM') return null
  const a = Number(m[1])
  const b = Number(m[3])
  let year = m[4] ? Number(m[4]) : 0
  if (year && year < 100) year += 2000
  let [day, month] = ctx.dayMonthOrder === 'DM' ? [a, b] : [b, a]
  const probeYear = year || fromISO(ctx.today)[0]
  // "25/12" in a M/D locale can only mean 25 December; dotted forms are never swapped.
  if (!dotted && !isValidDate(probeYear, month, day) && isValidDate(probeYear, day, month)) [day, month] = [month, day]
  const date = resolveMonthDay(ctx.today, year, month, day)
  return date ? { date, n: 1 } : null
}

// ---------- times ----------

/**
 * Longest time phrase at token `i`: an optional "at" word followed by a clock time
 * in 24-hour ("16:30", "15h30", "15 Uhr", "at 3"), 12-hour ("3pm", "3:30 pm") or
 * named ("noon") form, or "in N hours" relative to `now`.
 */
export function matchTimeAt(tokens: readonly Token[], i: number, ctx: DateContext): TimeMatch | null {
  if (!tokens[i] || tokens[i].quoted) return null
  let best: TimeMatch | null = null
  const consider = (m: TimeMatch | null) => {
    if (m && (!best || m.to > best.to)) best = m
  }
  const anyHourSuffix = ctx.vocabs.some((v) => v.hourSuffixH)
  for (const v of ctx.vocabs) {
    consider(inHoursAt(tokens, i, v, ctx))
    const at = phraseAt(tokens, i, v.atWords, `${v.code}:at`)
    const j = i + at
    const named = lookupAt(tokens, j, v.timeWords, `${v.code}:tw`)
    if (named) consider({ time: named.value, from: i, to: j + named.n })
    const c = clockAt(tokens, j, v, { afterAt: at > 0, hourSuffix: anyHourSuffix })
    if (c) consider({ time: c.time, from: i, to: j + c.n })
  }
  return best
}

function inHoursAt(tokens: readonly Token[], i: number, v: Vocabulary, ctx: DateContext): TimeMatch | null {
  if (!ctx.now) return null
  const inN = phraseAt(tokens, i, v.inWords, `${v.code}:in`)
  if (!inN) return null
  const count = countAt(tokens, i + inN, v)
  if (!count) return null
  const unit = unitAt(tokens, i + inN + count.n, v)
  if (!unit || unit.unit !== 'hour') return null
  const [h, m] = ctx.now.split(':').map(Number)
  const total = h + count.count
  return { time: clock(total % 24, m), date: addDays(ctx.today, Math.floor(total / 24)), from: i, to: i + inN + count.n + unit.n }
}

const HM_RE = /^(\d{1,2}):(\d{2})(am|pm|a\.m\.|p\.m\.)?$/
const HDOTM_RE = /^(\d{1,2})\.(\d{2})$/
const H12_RE = /^(\d{1,2})(am|pm|a\.m\.|p\.m\.)$/
const HH_RE = /^(\d{1,2})h(\d{2})?$/
const H_RE = /^(\d{1,2})$/

function meridiem(tokens: readonly Token[], k: number, v: Vocabulary): { n: number; pm: boolean } | null {
  if (phraseAt(tokens, k, v.pm, `${v.code}:pm`)) return { n: 1, pm: true }
  if (phraseAt(tokens, k, v.am, `${v.code}:am`)) return { n: 1, pm: false }
  return null
}

function to24(h: number, pm: boolean): number {
  if (h === 12) return pm ? 12 : 0
  return pm ? h + 12 : h
}

function clockAt(tokens: readonly Token[], j: number, v: Vocabulary, o: { afterAt: boolean; hourSuffix: boolean }): { time: string; n: number } | null {
  const t = tokens[j]
  if (!t || t.quoted) return null
  const s = t.norm
  let m: RegExpExecArray | null
  const hourWord = (k: number) => phraseAt(tokens, k, v.hourWords, `${v.code}:hw`)
  if ((m = HM_RE.exec(s))) {
    const h = Number(m[1])
    const min = Number(m[2])
    if (min > 59) return null
    const ampm = m[3] ? { n: 0, pm: m[3].startsWith('p') } : meridiem(tokens, j + 1, v)
    if (ampm) {
      if (h < 1 || h > 12) return null
      return { time: clock(to24(h, ampm.pm), min), n: 1 + ampm.n }
    }
    if (h > 23) return null
    return { time: clock(h, min), n: 1 + hourWord(j + 1) }
  }
  if ((m = HDOTM_RE.exec(s))) {
    const h = Number(m[1])
    const min = Number(m[2])
    const hw = hourWord(j + 1)
    if ((!o.afterAt && !hw) || h > 23 || min > 59) return null
    return { time: clock(h, min), n: 1 + hw }
  }
  if ((m = H12_RE.exec(s))) {
    const h = Number(m[1])
    if (h < 1 || h > 12) return null
    return { time: clock(to24(h, m[2].startsWith('p')), 0), n: 1 }
  }
  if ((m = HH_RE.exec(s))) {
    const h = Number(m[1])
    const min = m[2] ? Number(m[2]) : 0
    if (h > 23 || min > 59) return null
    if (!m[2] && !o.afterAt && !o.hourSuffix) return null
    return { time: clock(h, min), n: 1 }
  }
  if ((m = H_RE.exec(s))) {
    const h = Number(m[1])
    const ampm = meridiem(tokens, j + 1, v)
    if (ampm) {
      if (h < 1 || h > 12) return null
      return { time: clock(to24(h, ampm.pm), 0), n: 1 + ampm.n }
    }
    const hw = hourWord(j + 1)
    if ((!o.afterAt && !hw) || h > 23) return null
    return { time: clock(h, 0), n: 1 + hw }
  }
  return null
}
