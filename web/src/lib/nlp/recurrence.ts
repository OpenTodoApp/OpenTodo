// Recurrence phrases in the quick-add line (OpenSpec change quick-add-recurrence,
// design D1, D2): "every Monday", "jeden Montag", "tous les 3 jours après
// achèvement", "every 2nd Tuesday until 31 Dec", "daily". A phrase is translated
// into the canonical English rule of the recurring-tasks grammar and accepted
// only if parseRule accepts it, so the parser never emits a rule the server
// would refuse.
import { parseRule } from '../recurrence'
import { countAt, dayNumber, lookupAt, matchDateAt, ofMonthAt, phraseAt, weekdayAt, weekdayOrdinalAt, type DateContext } from './dates'
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
  // [N] unit
  const count = /^\d{1,3}$/.test(tokens[k]?.norm ?? '') && !tokens[k].quoted ? Number(tokens[k].norm) : 0
  const unit = recUnitAt(tokens, k + (count ? 1 : 0), v)
  if (unit) {
    return { n: (count ? 1 : 0) + unit.n, pattern: count && count !== 1 ? `${count} ${unit.unit}s` : unit.unit, monthly: false }
  }
  if (count && anyUnitAt(tokens, k + 1, v)) return null // "every 3 hours": not expressible
  // ordinal weekday: "2nd monday", "2e lundis", "segunda segunda-feira" (quick-add-nth-weekday D3)
  const nth = weekdayOrdinalAt(tokens, k, v, (w) => weekdayPluralAt(tokens, w, v) >= 0)
  if (nth) {
    const wd = weekdayPluralAt(tokens, k + nth.n, v)
    return { n: nth.n + 1, pattern: `${ORDINAL_EN[nth.value]} ${WEEKDAY_EN[wd]}`, monthly: true }
  }
  // ordinal [weekday | day | weekday-collective]
  const ord = ordinalAt(tokens, k, v)
  if (ord) {
    const j = k + ord.n
    const wd = weekdayPluralAt(tokens, j, v)
    if (wd >= 0 && ord.value <= 4) return { n: ord.n + 1, pattern: `${ORDINAL_EN[ord.value]} ${WEEKDAY_EN[wd]}`, monthly: true }
    if (ord.value === -1) {
      const day = phraseAt(tokens, j, v.units.day, `${v.code}:unit:day`)
      if (day) return { n: ord.n + day, pattern: 'last day', monthly: true }
      const wall = phraseAt(tokens, j, v.weekdayAll, `${v.code}:wdall`)
      if (wall) return { n: ord.n + wall, pattern: 'last weekday', monthly: true }
      return null
    }
    // A bare day of the month ("every 15th"); ordinal words alone mean nothing.
    if (/^\d/.test(tokens[k].norm) && ord.value >= 1 && ord.value <= 31) {
      const suffix = ord.value % 10 === 1 && ord.value !== 11 ? 'st' : ord.value % 10 === 2 && ord.value !== 12 ? 'nd' : ord.value % 10 === 3 && ord.value !== 13 ? 'rd' : 'th'
      return { n: ord.n, pattern: `${ord.value}${suffix}`, monthly: true }
    }
    return null
  }
  // weekday list: Mon, Wed and Fri
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
  if (days.length) return { n: j - k, pattern: days.map((d) => WEEKDAY_EN[d]).join(', '), monthly: false }
  return null
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
 * The longest recurrence phrase at token i across the active vocabularies, with
 * its optional tails: of the month (after a monthly pattern), after completion,
 * until <date phrase>, for N times.
 */
export function matchRecurrenceAt(tokens: readonly Token[], i: number, ctx: DateContext): RecurrenceMatch | null {
  if (!tokens[i] || tokens[i].quoted) return null
  let best: RecurrenceMatch | null = null
  for (const v of ctx.vocabs) {
    let k = i
    let pattern: string | null = null
    const one = lookupAt(tokens, i, v.everyOne, `${v.code}:every1`)
    if (one) {
      pattern = one.value
      k = i + one.n
    } else {
      const ev = phraseAt(tokens, i, v.every, `${v.code}:every`)
      if (!ev) continue
      const p = patternAt(tokens, i + ev, v)
      if (!p) {
        const literal = countWeekdayAt(tokens, i + ev, v)
        if (literal && (!best || i + ev + literal > best.to)) best = { rule: '', from: i, to: i + ev + literal, literal: true }
        continue
      }
      pattern = p.pattern
      k = i + ev + p.n
      if (p.monthly) k += ofMonthAt(tokens, k, ctx)
    }
    let rule = `every ${pattern}`
    // Tails are tried in every active language: "every monday until 31 Dec" works with any vocabulary.
    const tail = (field: 'afterCompletion' | 'untilWords'): number => {
      let n = 0
      for (const w of ctx.vocabs) n = Math.max(n, phraseAt(tokens, k, w[field], `${w.code}:${field}`))
      return n
    }
    const ac = tail('afterCompletion')
    if (ac && parseRule(`${rule} after completion`).ok) {
      rule += ' after completion'
      k += ac
    }
    const until = tail('untilWords')
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
    const parsed = parseRule(rule)
    if (!parsed.ok) continue
    if (!best || k > best.to) best = { rule: parsed.canonical, from: i, to: k }
  }
  return best
}
