// Recurrence phrases in the quick-add line (OpenSpec change quick-add-recurrence,
// design D1, D2): "every Monday", "jeden Montag", "tous les 3 jours après
// achèvement", "every 2nd Tuesday until 31 Dec", "daily". A phrase is translated
// into the canonical English rule of the recurring-tasks grammar and accepted
// only if parseRule accepts it, so the parser never emits a rule the server
// would refuse.
import { parseRule } from '../recurrence'
import { countAt, dayNumber, lookupAt, matchDateAt, ofMonthAt, phraseAt, weekdayAt, weekdayOrdinalAt, type DateContext, monthAt } from './dates'
import type { Token } from './tokenize'
import type { Vocabulary } from './vocab'

export interface RecurrenceMatch {
  /** The canonical rule, e.g. "every monday"; empty for a literal match. */
  rule: string
  from: number
  to: number
  /**
   * A phrase the grammar cannot express that must stay in the title as a unit
   * ("every 2 Mondays", quick-add-nth-weekday D3): it wins the longest-match
   * comparison like any match but records no attribute.
   */
  literal?: true
  /**
   * The date of a start phrase next to the rule ("starting tomorrow", "from 3 March",
   * quick-add-weekday-recurrence D3): the series starts on its first date on or after it.
   */
  start?: string
}

/** A pattern after "every"; `monthly` patterns accept the "of the month" tail (D2). */
interface Pattern {
  n: number
  pattern: string
  monthly: boolean
}

const WEEKDAY_EN = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const ORDINAL_EN: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', [-1]: 'last' }

type RecUnit = 'day' | 'week' | 'month' | 'year'

function recUnitAt(tokens: readonly Token[], i: number, v: Vocabulary): { n: number; unit: RecUnit } | null {
  for (const unit of ['day', 'week', 'month', 'year'] as const) {
    const n = phraseAt(tokens, i, v.units[unit], `${v.code}:unit:${unit}`)
    if (n) return { n, unit }
  }
  return null
}

/** Any unit word at i, including hours and minutes (a number before one is never an ordinal). */
function anyUnitAt(tokens: readonly Token[], i: number, v: Vocabulary): boolean {
  return (['minute', 'hour', 'day', 'week', 'month', 'year'] as const).some((u) => phraseAt(tokens, i, v.units[u], `${v.code}:unit:${u}`) > 0)
}

/**
 * A weekday at i, or its plural after "every": Romance plurals without their final
 * s ("lundis", "segundas"), hyphenated ones without the s of each part
 * ("segundas-feiras"), German ones without their final e ("Montage").
 */
function weekdayPluralAt(tokens: readonly Token[], i: number, v: Vocabulary): number {
  const wd = weekdayAt(tokens, i, v)
  if (wd >= 0) return wd
  const t = tokens[i]
  if (!t || t.quoted) return -1
  for (const stem of pluralStems(t.norm)) {
    const w = weekdayAt([{ ...t, norm: stem }], 0, v)
    if (w >= 0) return w
  }
  return -1
}

/** Candidate singular forms of a plural weekday token (the Go port mirrors it). */
function pluralStems(norm: string): string[] {
  const out: string[] = []
  if (norm.length >= 4 && norm.endsWith('s')) out.push(norm.slice(0, -1))
  if (norm.length >= 6 && norm.endsWith('e')) out.push(norm.slice(0, -1))
  if (norm.includes('-')) out.push(norm.split('-').map((p) => (p.endsWith('s') ? p.slice(0, -1) : p)).join('-'))
  return out
}

/** An ordinal at i: a day number with a suffix ("2nd", "15.", "3º") or an ordinal word. */
function ordinalAt(tokens: readonly Token[], i: number, v: Vocabulary): { n: number; value: number } | null {
  const t = tokens[i]
  if (!t || t.quoted) return null
  if (!/^\d+$/.test(t.norm)) {
    const d = dayNumber(t)
    if (d) return { n: 1, value: d }
  }
  const word = lookupAt(tokens, i, v.ordinals, `${v.code}:ord`)
  return word ? { n: word.n, value: word.value } : null
}

/** The pattern after "every" at token k: [N] unit, weekday list, collective weekday, ordinal forms. */
function patternAt(tokens: readonly Token[], k: number, v: Vocabulary): Pattern | null {
  const all = phraseAt(tokens, k, v.weekdayAll, `${v.code}:wdall`)
  if (all) return { n: all, pattern: 'weekday', monthly: false }
  // [N] unit, and "[N] weeks on <weekdays>" (quick-add-weekday-recurrence D1)
  const count = /^\d{1,3}$/.test(tokens[k]?.norm ?? '') && !tokens[k].quoted ? Number(tokens[k].norm) : 0
  const unit = recUnitAt(tokens, k + (count ? 1 : 0), v)
  if (unit) {
    const n = (count ? 1 : 0) + unit.n
    const pattern = count && count !== 1 ? `${count} ${unit.unit}s` : unit.unit
    const on = unit.unit === 'week' ? weeksOnAt(tokens, k + n, v) : null
    if (on) return { n: n + on.n, pattern: `${pattern} on ${on.days}`, monthly: false }
    return { n, pattern, monthly: false }
  }
  if (count && anyUnitAt(tokens, k + 1, v)) return null // "every 3 hours": not expressible
  // ordinal weekday: "2nd monday", "2e lundis", "segunda segunda-feira" (quick-add-nth-weekday D3)
  const nth = weekdayOrdinalAt(tokens, k, v, (w) => weekdayPluralAt(tokens, w, v) >= 0)
  if (nth) {
    const wd = weekdayPluralAt(tokens, k + nth.n, v)
    return ofAMonth(tokens, k + nth.n + 1, v, { n: nth.n + 1, pattern: `${ORDINAL_EN[nth.value]} ${WEEKDAY_EN[wd]}`, monthly: true })
  }
  // ordinal [weekday | day | weekday-collective]
  const ord = ordinalAt(tokens, k, v)
  if (ord) {
    const j = k + ord.n
    const wd = weekdayPluralAt(tokens, j, v)
    if (wd >= 0 && ord.value <= 4) return ofAMonth(tokens, j + 1, v, { n: ord.n + 1, pattern: `${ORDINAL_EN[ord.value]} ${WEEKDAY_EN[wd]}`, monthly: true })
    // "1st weekday" … "last weekday": the n-th Monday-to-Friday day of the month.
    const wall = ord.value <= 4 ? phraseAt(tokens, j, v.weekdayAll, `${v.code}:wdall`) : 0
    if (wall) return { n: ord.n + wall, pattern: `${ORDINAL_EN[ord.value]} weekday`, monthly: true }
    if (ord.value === -1) {
      const day = phraseAt(tokens, j, v.units.day, `${v.code}:unit:day`)
      if (day) return { n: ord.n + day, pattern: 'last day', monthly: true }
      return null
    }
    // A bare day of the month ("every 15th"); ordinal words alone mean nothing.
    if (/^\d/.test(tokens[k].norm) && ord.value >= 1 && ord.value <= 31) {
      const suffix = ord.value % 10 === 1 && ord.value !== 11 ? 'st' : ord.value % 10 === 2 && ord.value !== 12 ? 'nd' : ord.value % 10 === 3 && ord.value !== 13 ? 'rd' : 'th'
      return { n: ord.n, pattern: `${ord.value}${suffix}`, monthly: true }
    }
    return null
  }
  const list = weekdayListAt(tokens, k, v)
  return list ? { n: list.n, pattern: list.days, monthly: false } : null
}

const MONTH_EN = ['', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/**
 * An ordinal weekday followed by a month ("last sunday in march", "letzten Sonntag
 * im März") is yearly: `every last sunday of march` (yearly-weekday-of-month D3),
 * with the same "of"/"in" words and month names one-off dates read. Otherwise the
 * monthly pattern as it is.
 */
function ofAMonth(tokens: readonly Token[], k: number, v: Vocabulary, p: { n: number; pattern: string; monthly: boolean }): { n: number; pattern: string; monthly: boolean } {
  const of = phraseAt(tokens, k, v.ordinalOf, `${v.code}:ordof`)
  const month = of ? monthAt(tokens, k + of, v, true) : 0
  return month ? { n: p.n + of + 1, pattern: `${p.pattern} of ${MONTH_EN[month]}`, monthly: false } : p
}

/** A weekday list at k ("Mon, Wed and Fri") as the rule's English list, or null. */
function weekdayListAt(tokens: readonly Token[], k: number, v: Vocabulary): { n: number; days: string } | null {
  const days: number[] = []
  let j = k
  for (;;) {
    const wd = weekdayPluralAt(tokens, j, v)
    if (wd < 0) break
    days.push(wd)
    j += 1
    const and = phraseAt(tokens, j, v.andWords, `${v.code}:and`)
    if (and && weekdayPluralAt(tokens, j + and, v) >= 0) {
      j += and
      continue
    }
    // "mon, wed": the comma was folded off by normalize; a following weekday continues the list.
    if (/[,;]$/.test(tokens[j - 1].text) && weekdayPluralAt(tokens, j, v) >= 0) continue
    break
  }
  return days.length ? { n: j - k, days: days.map((d) => WEEKDAY_EN[d]).join(', ') } : null
}

/** "on Saturday", "am Samstag", "le samedi" after a week count: the weekdays the rule keeps. */
function weeksOnAt(tokens: readonly Token[], k: number, v: Vocabulary): { n: number; days: string } | null {
  const on = phraseAt(tokens, k, v.weekOnWords, `${v.code}:weekon`)
  if (!on) return null
  const list = weekdayListAt(tokens, k + on, v)
  return list ? { n: on + list.n, days: list.days } : null
}

/**
 * A bare count between the "every" word and a weekday ("every 2 Mondays", "alle 2
 * Montage"): a count the grammar cannot express, so a literal match over the
 * phrase keeps it whole in the title (quick-add-nth-weekday D3).
 */
function countWeekdayAt(tokens: readonly Token[], k: number, v: Vocabulary): number {
  const t = tokens[k]
  if (!t || t.quoted || !/^\d{1,3}$/.test(t.norm)) return 0
  return weekdayPluralAt(tokens, k + 1, v) >= 0 ? 2 : 0
}

/**
 * "every other" with a unit or a weekday at token i (quick-add-month-and-every-other
 * D3): "every other week" is every 2 weeks; "every other friday" is every 2 weeks on
 * Friday (quick-add-weekday-recurrence D1), so the rule keeps its weekday whatever
 * the due date. Also the French form around the noun, "une semaine sur deux",
 * "un vendredi sur deux".
 */
function everyOtherAt(tokens: readonly Token[], i: number, v: Vocabulary): { n: number; pattern: string } | null {
  const noun = (k: number): { n: number; pattern: string } | null => {
    const unit = recUnitAt(tokens, k, v)
    if (unit) return { n: unit.n, pattern: `2 ${unit.unit}s` }
    const wd = weekdayPluralAt(tokens, k, v)
    if (wd >= 0) return { n: 1, pattern: `2 weeks on ${WEEKDAY_EN[wd]}` }
    return null
  }
  const ev = phraseAt(tokens, i, v.everyOther, `${v.code}:other`)
  if (ev) {
    const m = noun(i + ev)
    return m ? { ...m, n: ev + m.n } : null
  }
  const pre = phraseAt(tokens, i, v.everyOtherAround.before, `${v.code}:otherb`)
  if (!pre) return null
  const m = noun(i + pre)
  const post = m ? phraseAt(tokens, i + pre + m.n, v.everyOtherAround.after, `${v.code}:othera`) : 0
  return m && post ? { ...m, n: pre + m.n + post } : null
}

/** The longest phrase of a vocabulary list at token k across the active languages. */
function anyPhraseAt(tokens: readonly Token[], k: number, ctx: DateContext, field: 'afterCompletion' | 'untilWords' | 'repeatWords' | 'startWords'): number {
  let n = 0
  for (const w of ctx.vocabs) n = Math.max(n, phraseAt(tokens, k, w[field], `${w.code}:${field}`))
  return n
}

/** A start phrase at k ("starting tomorrow", "ab Montag", "à partir du 3 mars"): its date and the token after it. */
function startAt(tokens: readonly Token[], k: number, ctx: DateContext): { date: string; to: number } | null {
  const sw = anyPhraseAt(tokens, k, ctx, 'startWords')
  const dm = sw ? matchDateAt(tokens, k + sw, ctx) : null
  return dm ? { date: dm.date, to: dm.to } : null
}

/**
 * The longest recurrence phrase at token i, with what may surround it
 * (quick-add-weekday-recurrence D3, D4): a connector before it ("and repeat",
 * "und dann") and a start phrase before or after it ("starting today every
 * other Saturday", "every day from Monday"), which go with the rule only when
 * a rule follows or precedes them, so "Repeat the test" keeps its words.
 */
export function matchRecurrenceAt(tokens: readonly Token[], i: number, ctx: DateContext): RecurrenceMatch | null {
  if (!tokens[i] || tokens[i].quoted) return null
  let k = i + anyPhraseAt(tokens, i, ctx, 'repeatWords')
  const lead = startAt(tokens, k, ctx)
  if (lead) k = lead.to + anyPhraseAt(tokens, lead.to, ctx, 'repeatWords')
  if (k === i) return ruleAt(tokens, i, ctx)
  const m = ruleAt(tokens, k, ctx)
  if (!m || m.literal) return ruleAt(tokens, i, ctx)
  return { ...m, from: i, ...(lead && !m.start ? { start: lead.date } : {}) }
}

/**
 * The longest rule at token i across the active vocabularies, with its optional
 * tails: of the month (after a monthly pattern), after completion, until <date
 * phrase>, for N times, and a start phrase.
 */
function ruleAt(tokens: readonly Token[], i: number, ctx: DateContext): RecurrenceMatch | null {
  if (!tokens[i] || tokens[i].quoted) return null
  let best: RecurrenceMatch | null = null
  // Tails are tried in every active language: "every monday until 31 Dec" works with any vocabulary.
  const tail = (k: number, field: 'afterCompletion' | 'untilWords'): number => anyPhraseAt(tokens, k, ctx, field)
  /** A head (the pattern after "every", ending before token k) with its tails; kept when longer than the best so far. */
  const consider = (pattern: string, k: number) => {
    let start: string | undefined
    const startTail = () => {
      const st = start === undefined ? startAt(tokens, k, ctx) : null
      if (st) {
        start = st.date
        k = st.to
      }
    }
    let rule = `every ${pattern}`
    const ac = tail(k, 'afterCompletion')
    if (ac && parseRule(`${rule} after completion`).ok) {
      rule += ' after completion'
      k += ac
    }
    startTail()
    const until = tail(k, 'untilWords')
    if (until) {
      const dm = matchDateAt(tokens, k + until, ctx)
      if (dm && parseRule(`${rule} until ${dm.date}`).ok) {
        rule += ` until ${dm.date}`
        k = dm.to
      }
    } else {
      for (const w of ctx.vocabs) {
        const pre = phraseAt(tokens, k, w.timesWords.before, `${w.code}:tb4`)
        const count = countAt(tokens, k + pre, w)
        if (!count || !/^\d+$/.test(tokens[k + pre].norm)) continue
        const post = phraseAt(tokens, k + pre + count.n, w.timesWords.after, `${w.code}:taft`)
        if (post && parseRule(`${rule} for ${count.count} times`).ok) {
          rule += ` for ${count.count} times`
          k += pre + count.n + post
          break
        }
      }
    }
    startTail()
    const parsed = parseRule(rule)
    if (!parsed.ok) return
    if (!best || k > best.to) best = { rule: parsed.canonical, from: i, to: k, ...(start ? { start } : {}) }
  }
  for (const v of ctx.vocabs) {
    // "every other" first: on a tie it wins over the ordinal reading of "jeden zweiten Freitag".
    const other = everyOtherAt(tokens, i, v)
    if (other) consider(other.pattern, i + other.n)
    const one = lookupAt(tokens, i, v.everyOne, `${v.code}:every1`)
    if (one) {
      consider(one.value, i + one.n)
      continue
    }
    const ev = phraseAt(tokens, i, v.every, `${v.code}:every`)
    if (!ev) continue
    const p = patternAt(tokens, i + ev, v)
    if (!p) {
      const literal = countWeekdayAt(tokens, i + ev, v)
      if (literal && (!best || i + ev + literal > best.to)) best = { rule: '', from: i, to: i + ev + literal, literal: true }
      continue
    }
    consider(p.pattern, i + ev + p.n + (p.monthly ? ofMonthAt(tokens, i + ev + p.n, ctx) : 0))
  }
  return best
}
