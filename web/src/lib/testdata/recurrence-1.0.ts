// A frozen copy of the rule grammar of OpenTodo 1.0.0 (web/src/lib/recurrence.ts
// at v1.0.0, the parser only; the strings are not translated). Tests check against
// it that every writer stores a rule a 1.0 client reads whenever one means the same
// thing (OpenSpec change recurrence-1-0-compatible). Never change it; it is not
// imported by the app. Go: internal/recurrence/recurrence10.
const t = (s: string, vars: Record<string, string | number | undefined> = {}) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k]))

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
  /** The ordinal-th Monday-to-Friday day of the month (1–4, or -1 for the last). */
  | Ends & { kind: 'workday'; ordinal: number; afterCompletion: false }
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
  if (input.length > MAX_RULE_LENGTH) throw new RuleError(t('longer than {n} characters', { n: MAX_RULE_LENGTH }))
  const toks = input.toLowerCase().replaceAll(',', ' , ').split(/\s+/).filter(Boolean)
  if (toks[0] !== 'every') throw new RuleError(t('must start with "every"'))
  let i = 1
  const peek = (k = 0) => toks[i + k]
  const ends: Ends = { until: null, count: 0 }
  let rule: Rule
  const tok = peek()
  if (tok === undefined) throw new RuleError(t('missing pattern after "every"'))
  if (tok === 'day' || tok === 'week' || tok === 'month' || tok === 'year') {
    rule = { kind: 'interval', interval: 1, unit: tok, afterCompletion: false, ...ends }
    i++
  } else if (tok === 'weekday' || tok === 'weekdays') {
    rule = { kind: 'weekday', days: 0b00111110, afterCompletion: false, ...ends }
    i++
  } else if (/^[0-9]+$/.test(tok)) {
    const n = positiveInt(tok, MAX_INTERVAL)
    if (n === null) throw new RuleError(t('interval must be from 1 to {n}', { n: MAX_INTERVAL }))
    const singular = (peek(1) ?? '').replace(/s$/, '')
    if (!(UNITS as string[]).includes(singular)) throw new RuleError(t('expected day(s), week(s), month(s) or year(s) after {word}', { word: tok }))
    rule = { kind: 'interval', interval: n, unit: singular as Unit, afterCompletion: false, ...ends }
    i += 2
  } else if (tok === 'last' && (peek(1) === 'day' || peek(1) === 'weekday')) {
    rule = peek(1) === 'day' ? { kind: 'lastDay', afterCompletion: false, ...ends } : { kind: 'workday', ordinal: -1, afterCompletion: false, ...ends }
    i += 2
  } else if (has(WEEKDAY_ALIASES, tok)) {
    let days = 0
    for (;;) {
      const item = peek()
      if (!has(WEEKDAY_ALIASES, item)) throw new RuleError(t('expected a weekday, got "{word}"', { word: item }))
      days |= 1 << WEEKDAY_ALIASES[item]
      i++
      let j = i
      if (toks[j] === ',') j++
      if (toks[j] === 'and') j++
      if (j === i) break
      if (j >= toks.length) throw new RuleError(t('expected a weekday after the list separator'))
      i = j
    }
    rule = { kind: 'weekdays', days, afterCompletion: false, ...ends }
  } else {
    const word = has(WORD_ORDINALS, tok) ? WORD_ORDINALS[tok] : null
    const num = numericOrdinal(tok)
    if (word === null && num === null) throw new RuleError(t('unknown pattern "{word}"', { word: tok }))
    const next = peek(1)
    if (next === 'weekday') {
      const ordinal = num ?? word ?? 0
      if (ordinal > 4) throw new RuleError(t('weekday ordinal must be 1st to 4th or last'))
      rule = { kind: 'workday', ordinal, afterCompletion: false, ...ends }
      i += 2
    } else if (has(WEEKDAY_ALIASES, next)) {
      // One of the two is set (checked above).
      const ordinal = num ?? word ?? 0
      if (ordinal > 4) throw new RuleError(t('weekday ordinal must be 1st to 4th or last'))
      rule = { kind: 'nthWeekday', ordinal, weekday: WEEKDAY_ALIASES[next], afterCompletion: false, ...ends }
      i += 2
    } else {
      if (num === null) throw new RuleError(t('expected a weekday after "{word}"', { word: tok }))
      rule = { kind: 'monthDay', monthDay: num, afterCompletion: false, ...ends }
      i++
    }
  }
  if (peek() === 'after') {
    if (peek(1) !== 'completion') throw new RuleError(t('expected "completion" after "after"'))
    if (rule.kind !== 'interval') throw new RuleError(t('"after completion" only applies to day, week, month and year intervals'))
    rule.afterCompletion = true
    i += 2
  }
  if (peek() === 'until') {
    const d = peek(1)
    if (d === undefined || dayNumber(d) === null) throw new RuleError(t('until needs a date YYYY-MM-DD'))
    rule.until = d
    i += 2
  } else if (peek() === 'for') {
    const n = positiveInt(peek(1), MAX_COUNT)
    if (n === null || (peek(2) !== 'times' && peek(2) !== 'time')) throw new RuleError(t('expected "for N times" with N from 1 to {n}', { n: MAX_COUNT }))
    rule.count = n
    i += 3
  }
  if (i < toks.length) throw new RuleError(t('unexpected "{word}"', { word: toks[i] }))
  return rule
}

/** The canonical text of a parsed rule (Go: Rule.Canonical). */
export function canonicalOf(r: Rule): string {
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
    case 'workday':
      s += `${r.ordinal < 0 ? 'last' : `${r.ordinal}${ordinalSuffix(r.ordinal)}`} weekday`
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

function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

const isLeap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)

function monthLen(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31
}

/** Day number of a valid YYYY-MM-DD date, or null. */
function dayNumber(s: string): number | null {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > monthLen(y, mo)) return null
  return daysFromCivil(y, mo, d)
}
