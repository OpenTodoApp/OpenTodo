// A repeat rule in the interface language (OpenSpec change repeat-rule-words).
// The stored rule stays the canonical English grammar of recurrence.ts; this is
// only how it reads on screen, built from the parsed rule with whole messages.
import { formatDate, monthName, weekdayName } from './dates'
import { formatList, t } from './i18n'
import { parseRule, type Rule } from './recurrence'

const ORDINALS: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' }
const WEEKDAY_KEYS = ['', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** The name of ISO weekday `wd` (1 = Monday … 7 = Sunday). */
const dayName = (wd: number) => weekdayName(wd % 7)

function patternWords(r: Rule): string {
  switch (r.kind) {
    case 'interval': {
      const n = r.interval
      switch (r.unit) {
        case 'day': return n === 1 ? t('Every day') : t('Every {n, plural, one {# day} other {# days}}', { n })
        case 'week': return n === 1 ? t('Every week') : t('Every {n, plural, one {# week} other {# weeks}}', { n })
        case 'month': return n === 1 ? t('Every month') : t('Every {n, plural, one {# month} other {# months}}', { n })
        case 'year': return n === 1 ? t('Every year') : t('Every {n, plural, one {# year} other {# years}}', { n })
      }
      break
    }
    case 'weekday': return t('Every weekday')
    case 'weekdays': {
      const weekday = formatList([1, 2, 3, 4, 5, 6, 7].filter((wd) => r.days & (1 << wd)).map(dayName))
      return r.interval > 1
        ? t('Every {n, plural, one {# week} other {# weeks}} on {weekday}', { n: r.interval, weekday })
        : t('Every week on {weekday}', { weekday })
    }
    case 'monthDay': return t('Every month on day {day}', { day: r.monthDay })
    case 'lastDay': return t('Every month on the last day')
    case 'workday':
      return t('Every month on the {ordinal, select, first {first} second {second} third {third} fourth {fourth} other {last}} weekday', { ordinal: ORDINALS[r.ordinal] })
    case 'nthWeekday': {
      const values = { ordinal: ORDINALS[r.ordinal], wd: WEEKDAY_KEYS[r.weekday] }
      // The weekday is a choice, not a name, so a language can make the ordinal agree with it.
      return r.month
        ? t('Every year on the {ordinal, select, first {first} second {second} third {third} fourth {fourth} other {last}} {wd, select, mon {Monday} tue {Tuesday} wed {Wednesday} thu {Thursday} fri {Friday} sat {Saturday} other {Sunday}} of {month}', { ...values, month: monthName(`2026-${String(r.month).padStart(2, '0')}`) })
        : t('Every month on the {ordinal, select, first {first} second {second} third {third} fourth {fourth} other {last}} {wd, select, mon {Monday} tue {Tuesday} wed {Wednesday} thu {Thursday} fri {Friday} sat {Saturday} other {Sunday}}', values)
    }
  }
  return ''
}

/**
 * `rule` (a stored repeat rule) in the interface language: "Every 2 weeks on
 * Saturday". A rule this version cannot read is shown as stored.
 */
export function ruleWords(rule: string): string {
  const parsed = parseRule(rule)
  if (!parsed.ok) return rule
  const r = parsed.rule
  let words = patternWords(r)
  if (r.afterCompletion) words = t('{rule} after completion', { rule: words })
  if (r.until) words = t('{rule} until {date}', { rule: words, date: formatDate(r.until, 'compact') })
  if (r.count) words = t('{rule}, {n, plural, one {# time} other {# times}}', { rule: words, n: r.count })
  return words
}
