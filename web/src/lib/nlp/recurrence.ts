// Recurrence phrases in the quick-add line (OpenSpec change quick-add-recurrence,
// design D1, D2): "every Monday", "jeden Montag", "tous les 3 jours après
// achèvement", "every 2nd Tuesday until 31 Dec", "daily". A phrase is translated
// into the canonical English rule of the recurring-tasks grammar and accepted
// only if parseRule accepts it, so the parser never emits a rule the server
// would refuse.
import { parseRule } from '../recurrence'
import { countAt, dayNumber, lookupAt, matchDateAt, phraseAt, weekdayAt, type DateContext } from './dates'
import type { Token } from './tokenize'
import type { Vocabulary } from './vocab'

export interface RecurrenceMatch {
  /** The canonical rule, e.g. "every monday". */
  rule: string
  from: number
  to: number
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

/** A weekday at i; Romance plurals ("lundis", "segundas") match without their final s. */
function weekdayPluralAt(tokens: readonly Token[], i: number, v: Vocabulary): number {
  const wd = weekdayAt(tokens, i, v)
  if (wd >= 0) return wd
  const t = tokens[i]
  if (!t || t.quoted || !t.norm.endsWith('s') || t.norm.length < 4) return -1
  return weekdayAt([{ ...t, norm: t.norm.slice(0, -1) }], 0, v)
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
function patternAt(tokens: readonly Token[], k: number, v: Vocabulary): { n: number; pattern: string } | null {
  const all = phraseAt(tokens, k, v.weekdayAll, `${v.code}:wdall`)
  if (all) return { n: all, pattern: 'weekday' }
  // [N] unit
  const count = /^\d{1,3}$/.test(tokens[k]?.norm ?? '') && !tokens[k].quoted ? Number(tokens[k].norm) : 0
  const unit = recUnitAt(tokens, k + (count ? 1 : 0), v)
  if (unit) {
    return { n: (count ? 1 : 0) + unit.n, pattern: count && count !== 1 ? `${count} ${unit.unit}s` : unit.unit }
  }
  if (count && anyUnitAt(tokens, k + 1, v)) return null // "every 3 hours": not expressible
  // ordinal [weekday | day | weekday-collective]
  const ord = ordinalAt(tokens, k, v)
  if (ord) {
    const j = k + ord.n
    const wd = weekdayPluralAt(tokens, j, v)
    if (wd >= 0 && ord.value <= 4) return { n: ord.n + 1, pattern: `${ORDINAL_EN[ord.value]} ${WEEKDAY_EN[wd]}` }
    if (ord.value === -1) {
      const day = phraseAt(tokens, j, v.units.day, `${v.code}:unit:day`)
      if (day) return { n: ord.n + day, pattern: 'last day' }
      const wall = phraseAt(tokens, j, v.weekdayAll, `${v.code}:wdall`)
      if (wall) return { n: ord.n + wall, pattern: 'last weekday' }
      return null
    }
    // A bare day of the month ("every 15th"); ordinal words alone mean nothing.
    if (/^\d/.test(tokens[k].norm) && ord.value >= 1 && ord.value <= 31) {
      const suffix = ord.value % 10 === 1 && ord.value !== 11 ? 'st' : ord.value % 10 === 2 && ord.value !== 12 ? 'nd' : ord.value % 10 === 3 && ord.value !== 13 ? 'rd' : 'th'
      return { n: ord.n, pattern: `${ord.value}${suffix}` }
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
  if (days.length) return { n: j - k, pattern: days.map((d) => WEEKDAY_EN[d]).join(', ') }
  return null
}

/**
 * The longest recurrence phrase at token i across the active vocabularies, with
 * its optional tails: after completion, until <date phrase>, for N times.
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
      if (!p) continue
      pattern = p.pattern
      k = i + ev + p.n
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
