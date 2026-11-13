// Checks that a writer stores a rule a 1.0 client reads whenever one means the
// same thing (OpenSpec change recurrence-1-0-compatible), against the frozen 1.0
// grammar in ./recurrence-1.0. Test-only. Go: internal/recurrence/recurrence10.Check.
import { followingOccurrence, parseRule, type Rule } from '../recurrence'
import { parseRule as parse10 } from './recurrence-1.0'

/** A form newer than 1.0: every N weeks on <weekdays>, with its end. */
const WEEKS_ON = /^every ([0-9]+) weeks on ([a-z, ]+?)((?: until | for ).*)?$/

/**
 * The other form newer than 1.0, a weekday of one month every year
 * (yearly-weekday-of-month): 1.0's only yearly rule repeats on the same date,
 * which falls on another weekday from year to year, so no 1.0 rule gives these dates.
 */
const WEEKDAY_OF_MONTH = /^every (?:[1-4](?:st|nd|rd|th)|last) [a-z]+ of [a-z]+(?: until .*| for .*)?$/

/**
 * Null when `rule`, stored for a task due on `due`, is fine: 1.0 reads it, or no rule
 * 1.0 reads gives the same dates (every N weeks, every 7N days or every <weekdays>,
 * with the same end, over 60 occurrences completed on time). Otherwise why not.
 */
export function check10(rule: string, due: string | null | undefined): string | null {
  if (parse10(rule).ok) return null
  const r = parseRule(rule)
  if (!r.ok) return `"${rule}" is not a rule: ${r.error}`
  if (WEEKDAY_OF_MONTH.test(r.canonical)) return null
  const m = WEEKS_ON.exec(r.canonical)
  if (!m) return `"${rule}" is not readable by 1.0 and not a form this check knows`
  const end = m[3] ?? ''
  for (const c of [`every ${m[1]} weeks${end}`, `every ${7 * Number(m[1])} days${end}`, `every ${m[2]}${end}`]) {
    const old = parseRule(c)
    if (!old.ok || !parse10(c).ok) continue
    if (sameDates(r.rule, old.rule, due ?? null)) return `"${rule}" is stored for a task due ${due}, but "${c}", which 1.0 reads, gives the same dates`
  }
  return null
}

function sameDates(a: Rule, b: Rule, due: string | null): boolean {
  let today = due ?? '2026-11-04'
  let ca = due, cb = due
  for (let i = 0; i < 60; i++) {
    let na: string | null, nb: string | null
    try {
      na = followingOccurrence(a, ca, today, today, i)
      nb = followingOccurrence(b, cb, today, today, i)
    } catch {
      return false // not a date: no dates to compare
    }
    if (na !== nb) return false
    if (na === null || nb === null) return true
    ca = na
    cb = nb
    today = na
  }
  return true
}
