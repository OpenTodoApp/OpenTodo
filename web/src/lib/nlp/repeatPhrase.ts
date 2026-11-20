// A repeat rule typed in a task's Repeat field (OpenSpec change repeat-field-language):
// the stored grammar (recurrence.ts, English) first, then the same phrases quick add
// reads in the user's languages ("elke vrijdag", "tous les 3 jours après achèvement").
// The result is always a canonical rule parseRule accepts, or nothing.
import { parseRule } from '../recurrence'
import type { DateContext } from './dates'
import { matchRecurrenceAt } from './recurrence'
import { tokenize } from './tokenize'
import { vocabulariesFor, type DayMonthOrder } from './vocab'

export interface RepeatPhraseContext {
  /** Language tags in preference order (the quick-add languages); English is always read. */
  languages: readonly string[]
  /** The reference day, YYYY-MM-DD, for an end date such as "until 31 Dec". */
  today: string
  dayMonthOrder?: DayMonthOrder
  weekStart?: number
}

/**
 * The canonical rule `text` means, or null. The whole text must be the rule: a
 * phrase with other words around it, or one with a start date ("every day from
 * Monday"), is not a rule for this field.
 */
export function ruleFromText(text: string, ctx: RepeatPhraseContext): string | null {
  const typed = text.trim()
  if (!typed) return null
  const stored = parseRule(typed)
  if (stored.ok) return stored.canonical
  const { tokens } = tokenize(typed)
  const dates: DateContext = { today: ctx.today, vocabs: vocabulariesFor(ctx.languages), dayMonthOrder: ctx.dayMonthOrder ?? 'DM', weekStart: ctx.weekStart }
  const m = matchRecurrenceAt(tokens, 0, dates)
  if (!m || m.literal || m.start || m.from !== 0 || m.to !== tokens.length) return null
  const parsed = parseRule(m.rule)
  return parsed.ok ? parsed.canonical : null
}
