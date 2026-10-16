// Recurrence rules (OpenSpec change recurring-tasks): parser, canonical form and
// next-occurrence calculator. Mirrors internal/recurrence/recurrence.go; both are
// checked against recurrence.vectors.json, so change them together.
//
// Dates are floating YYYY-MM-DD strings. All arithmetic runs on proleptic
// Gregorian day numbers, never on `Date`, so results do not depend on the
// device's time zone or on daylight saving changes. See docs/recurrence.md.

export const MAX_RULE_LENGTH = 200
const MAX_INTERVAL = 999
const MAX_COUNT = 10000

type Unit = 'day' | 'week' | 'month' | 'year'

export type Rule =
  | Ends & { kind: 'interval'; interval: number; unit: Unit; afterCompletion: boolean }
  | Ends & { kind: 'weekday'; days: number; afterCompletion: false }
  | Ends & { kind: 'weekdays'; days: number; afterCompletion: false }
  | Ends & { kind: 'monthDay'; monthDay: number; afterCompletion: false }
  | Ends & { kind: 'lastDay'; afterCompletion: false }
  | Ends & { kind: 'lastWeekday'; afterCompletion: false }
  | Ends & { kind: 'nthWeekday'; ordinal: number; weekday: number; afterCompletion: false }

interface Ends {
  /** YYYY-MM-DD or null. */
  until: string | null
  /** `for N times`, 0 when absent. */
  count: number
}

export type ParseResult = { ok: true; rule: Rule; canonical: string } | { ok: false; error: string }

const WEEKDAY_NAMES = ['', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const WEEKDAY_ALIASES: Record<string, number> = {
  monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6, sunday: 7, sun: 7,
}
const WORD_ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, last: -1 }
const UNITS: Unit[] = ['day', 'week', 'month', 'year']

export function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  return n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'
}

function numericOrdinal(tok: string): number | null {
  const m = /^([1-9][0-9]?)(st|nd|rd|th)$/.exec(tok)
  if (!m) return null
  const n = Number(m[1])
  return n <= 31 && m[2] === ordinalSuffix(n) ? n : null
}

function positiveInt(tok: string | undefined, max: number): number | null {
  if (!tok || !/^[1-9][0-9]*$/.test(tok)) return null
  const n = Number(tok)
  return n <= max ? n : null
}

const has = (o: Record<string, number>, k: string | undefined): k is string => k !== undefined && Object.prototype.hasOwnProperty.call(o, k)

class RuleError extends Error {}

/** Parse a rule; on success `canonical` is the form to store. */
export function parseRule(input: string): ParseResult {
  try {
    const rule = parseOrThrow(input)
    return { ok: true, rule, canonical: canonicalOf(rule) }
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message }
    throw e
  }
}

/** The canonical form of a valid rule, or null when it does not parse. */
export function canonicalRule(input: string): string | null {
  const r = parseRule(input)
  return r.ok ? r.canonical : null
}

function parseOrThrow(input: string): Rule {
  if (input.length > MAX_RULE_LENGTH) throw new RuleError(`longer than ${MAX_RULE_LENGTH} characters`)
  const toks = input.toLowerCase().replaceAll(',', ' , ').split(/\s+/).filter(Boolean)
  if (toks[0] !== 'every') throw new RuleError('must start with "every"')
  let i = 1
  const peek = (k = 0) => toks[i + k]
  const ends: Ends = { until: null, count: 0 }
  let rule: Rule
  const tok = peek()
  if (tok === undefined) throw new RuleError('missing pattern after "every"')
  if (tok === 'day' || tok === 'week' || tok === 'month' || tok === 'year') {
    rule = { kind: 'interval', interval: 1, unit: tok, afterCompletion: false, ...ends }
    i++
  } else if (tok === 'weekday' || tok === 'weekdays') {
    rule = { kind: 'weekday', days: 0b00111110, afterCompletion: false, ...ends }
    i++
  } else if (/^[0-9]+$/.test(tok)) {
    const n = positiveInt(tok, MAX_INTERVAL)
    if (n === null) throw new RuleError(`interval must be from 1 to ${MAX_INTERVAL}`)
    const singular = (peek(1) ?? '').replace(/s$/, '')
    if (!(UNITS as string[]).includes(singular)) throw new RuleError(`expected day(s), week(s), month(s) or year(s) after ${tok}`)
    rule = { kind: 'interval', interval: n, unit: singular as Unit, afterCompletion: false, ...ends }
    i += 2
  } else if (tok === 'last' && (peek(1) === 'day' || peek(1) === 'weekday')) {
    rule = peek(1) === 'day' ? { kind: 'lastDay', afterCompletion: false, ...ends } : { kind: 'lastWeekday', afterCompletion: false, ...ends }
    i += 2
  } else if (has(WEEKDAY_ALIASES, tok)) {
    let days = 0
    for (;;) {
      const item = peek()
      if (!has(WEEKDAY_ALIASES, item)) throw new RuleError(`expected a weekday, got "${item}"`)
      days |= 1 << WEEKDAY_ALIASES[item]
      i++
      let j = i
      if (toks[j] === ',') j++
      if (toks[j] === 'and') j++
      if (j === i) break
      if (j >= toks.length) throw new RuleError('expected a weekday after the list separator')
      i = j
    }
    rule = { kind: 'weekdays', days, afterCompletion: false, ...ends }
  } else {
    const word = has(WORD_ORDINALS, tok) ? WORD_ORDINALS[tok] : null
    const num = numericOrdinal(tok)
    if (word === null && num === null) throw new RuleError(`unknown pattern "${tok}"`)
    const next = peek(1)
    if (has(WEEKDAY_ALIASES, next)) {
      const ordinal = num ?? (word as number)
      if (ordinal > 4) throw new RuleError('weekday ordinal must be 1st to 4th or last')
      rule = { kind: 'nthWeekday', ordinal, weekday: WEEKDAY_ALIASES[next], afterCompletion: false, ...ends }
      i += 2
    } else {
      if (num === null) throw new RuleError(`expected a weekday after "${tok}"`)
      rule = { kind: 'monthDay', monthDay: num, afterCompletion: false, ...ends }
      i++
    }
  }
  if (peek() === 'after') {
    if (peek(1) !== 'completion') throw new RuleError('expected "completion" after "after"')
    if (rule.kind !== 'interval') throw new RuleError('"after completion" only applies to day, week, month and year intervals')
    rule.afterCompletion = true
    i += 2
  }
  if (peek() === 'until') {
    const d = peek(1)
    if (d === undefined || dayNumber(d) === null) throw new RuleError('until needs a date YYYY-MM-DD')
    rule.until = d
    i += 2
  } else if (peek() === 'for') {
    const n = positiveInt(peek(1), MAX_COUNT)
    if (n === null || (peek(2) !== 'times' && peek(2) !== 'time')) throw new RuleError(`expected "for N times" with N from 1 to ${MAX_COUNT}`)
    rule.count = n
    i += 3
  }
  if (i < toks.length) throw new RuleError(`unexpected "${toks[i]}"`)
  return rule
}

function canonicalOf(r: Rule): string {
  let s = 'every '
  switch (r.kind) {
    case 'interval':
      s += r.interval === 1 ? r.unit : `${r.interval} ${r.unit}s`
      break
    case 'weekday':
      s += 'weekday'
      break
    case 'weekdays':
      s += WEEKDAY_NAMES.filter((_, wd) => wd > 0 && r.days & (1 << wd)).join(', ')
      break
    case 'monthDay':
      s += `${r.monthDay}${ordinalSuffix(r.monthDay)}`
      break
    case 'lastDay':
      s += 'last day'
      break
    case 'lastWeekday':
      s += 'last weekday'
      break
    case 'nthWeekday':
      s += `${r.ordinal < 0 ? 'last' : `${r.ordinal}${ordinalSuffix(r.ordinal)}`} ${WEEKDAY_NAMES[r.weekday]}`
      break
  }
  if (r.afterCompletion) s += ' after completion'
  if (r.until) s += ` until ${r.until}`
  if (r.count === 1) s += ' for 1 time'
  else if (r.count > 1) s += ` for ${r.count} times`
  return s
}

// ---- calendar arithmetic on day numbers (days since 1970-01-01) ----

function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

function civilFromDays(z: number): [number, number, number] {
  z += 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d]
}

const isLeap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)

function monthLen(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31
}

/** ISO weekday, 1 = Monday … 7 = Sunday; day 0 (1970-01-01) was a Thursday. */
const isoWeekday = (z: number) => ((((z % 7) + 7 + 3) % 7) + 1)

/** Day number of a valid YYYY-MM-DD date, or null. */
function dayNumber(s: string): number | null {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > monthLen(y, mo)) return null
  return daysFromCivil(y, mo, d)
}

function formatDate(z: number): string {
  const [y, m, d] = civilFromDays(z)
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function mustDate(s: string, what: string): number {
  const z = dayNumber(s)
  if (z === null) throw new Error(`recurrence: ${what} "${s}" is not a valid YYYY-MM-DD date`)
  return z
}

function addMonths(z: number, n: number): number {
  const [y, m, d] = civilFromDays(z)
  const idx = y * 12 + (m - 1) + n
  const ny = Math.floor(idx / 12)
  const nm = idx - ny * 12 + 1
  return daysFromCivil(ny, nm, Math.min(d, monthLen(ny, nm)))
}

function step(r: Rule & { kind: 'interval' }, anchor: number, k: number): number {
  switch (r.unit) {
    case 'week': return anchor + 7 * r.interval * k
    case 'month': return addMonths(anchor, r.interval * k)
    case 'year': return addMonths(anchor, 12 * r.interval * k)
    default: return anchor + r.interval * k
  }
}

function lastWeekdayOf(y: number, m: number): number {
  let z = daysFromCivil(y, m, monthLen(y, m))
  while (isoWeekday(z) > 5) z--
  return z
}

function nthWeekdayOf(y: number, m: number, ordinal: number, wd: number): number {
  if (ordinal < 0) {
    const z = daysFromCivil(y, m, monthLen(y, m))
    return z - ((isoWeekday(z) - wd + 7) % 7)
  }
  const first = daysFromCivil(y, m, 1)
  return first + ((wd - isoWeekday(first) + 7) % 7) + 7 * (ordinal - 1)
}

function inMonth(r: Rule, y: number, m: number): number {
  switch (r.kind) {
    case 'monthDay': return daysFromCivil(y, m, Math.min(r.monthDay, monthLen(y, m)))
    case 'lastDay': return daysFromCivil(y, m, monthLen(y, m))
    case 'lastWeekday': return lastWeekdayOf(y, m)
    case 'nthWeekday': return nthWeekdayOf(y, m, r.ordinal, r.weekday)
    default: throw new Error('recurrence: not a month pattern')
  }
}

/** First date matching the pattern strictly after day z. */
function firstAfter(r: Rule, z: number): number {
  switch (r.kind) {
    case 'interval':
      return step(r, z, 1)
    case 'weekday':
    case 'weekdays':
      for (let i = 1; i <= 7; i++) if (r.days & (1 << isoWeekday(z + i))) return z + i
      return z + 7
    default: {
      const [y, m] = civilFromDays(z)
      const c = inMonth(r, y, m)
      if (c > z) return c
      return m === 12 ? inMonth(r, y + 1, 1) : inMonth(r, y, m + 1)
    }
  }
}

function asRule(rule: Rule | string): Rule {
  if (typeof rule !== 'string') return rule
  const p = parseRule(rule)
  if (!p.ok) throw new Error(`recurrence: ${p.error}`)
  return p.rule
}

/**
 * Next occurrence of a calendar rule: the first match strictly after `due`, or,
 * when that is already before `today`, the first match strictly after today
 * (catch-up). Interval rules keep their phase while catching up. No due = today.
 */
export function nextCalendar(rule: Rule | string, due: string | null, today: string): string {
  const r = asRule(rule)
  const item = mustDate(today, 'today')
  const d = due ? mustDate(due, 'due') : item
  let c = firstAfter(r, d)
  if (c >= item) return formatDate(c)
  if (r.kind !== 'interval') return formatDate(firstAfter(r, item))
  if (r.unit === 'day' || r.unit === 'week') {
    const size = r.unit === 'week' ? 7 * r.interval : r.interval
    return formatDate(d + size * (Math.floor((item - d) / size) + 1))
  }
  for (let k = 2; ; k++) {
    c = step(r, d, k)
    if (c > item) return formatDate(c)
  }
}

/** Next occurrence of an interval rule counted from the local completion date. */
export function nextAfterCompletion(rule: Rule | string, completedOn: string): string {
  const r = asRule(rule)
  if (r.kind !== 'interval') throw new Error('recurrence: only interval rules are completion-relative')
  return formatDate(step(r, mustDate(completedOn, 'completedOn'), 1))
}

/**
 * What completing the current occurrence does: the next due date, or null when
 * the end condition is reached and the series completes like a plain task.
 * `done` is the number of completed occurrence records already in the series.
 */
export function followingOccurrence(rule: Rule | string, due: string | null, today: string, completedOn: string, done = 0): string | null {
  const r = asRule(rule)
  const next = r.afterCompletion ? nextAfterCompletion(r, completedOn) : nextCalendar(r, due, today)
  if (r.count > 0 && done + 1 >= r.count) return null
  if (r.until && next > r.until) return null
  return next
}

/** First occurrence on or after `from`: the due date given to an undated task that gets a rule. */
export function firstOccurrence(rule: Rule | string, from: string): string {
  const r = asRule(rule)
  const z = mustDate(from, 'from')
  return r.kind === 'interval' ? from : formatDate(firstAfter(r, z - 1))
}

/**
 * Up to n occurrences that would follow the current one if each were completed on
 * time (calendar rules), or today and then on each due date (completion-relative),
 * stopping at the end condition. Drives the detail panel preview.
 */
export function previewOccurrences(rule: Rule | string, due: string | null, today: string, done = 0, n = 3): string[] {
  const r = asRule(rule)
  const out: string[] = []
  let cur = due
  for (let i = 1; i <= n; i++) {
    const completedOn = r.afterCompletion && i > 1 && cur ? cur : today
    const next = followingOccurrence(r, cur, today, completedOn, done + i - 1)
    if (next === null) break
    out.push(next)
    cur = next
  }
  return out
}

/** Example rules offered as suggestions in the detail panel (all documented in docs/recurrence.md). */
export const RULE_SUGGESTIONS = [
  'every day', 'every weekday', 'every week', 'every 2 weeks', 'every month', 'every year',
  'every monday', 'every mon, wed, fri', 'every 15th', 'every last day', 'every last weekday',
  'every 2nd tuesday', 'every last friday', 'every 3 days after completion', 'every week for 10 times',
]
