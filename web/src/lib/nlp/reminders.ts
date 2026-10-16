// Reminder phrases in the quick-add line (OpenSpec change quick-add-recurrence,
// design D1, D3): a reminder word ("remind me", "erinnere mich", "rappelle-moi")
// followed by an offset ("30 min before", "1 hour after") or a moment (a time
// phrase, optionally with a date phrase: "at 9", "tomorrow at 9", "20 Oct at 9").
// The result is zone free; createTask resolves it against the final due date.
import { t } from '../i18n/catalog'
import { matchDuration } from './attributes'
import { countAt, matchDateAt, matchTimeAt, phraseAt, type DateContext } from './dates'
import type { Token } from './tokenize'
import type { Vocabulary } from './vocab'

/** A reminder as typed: an offset from the due (negative = before) or a floating wall-clock moment. */
export type ReminderPhrase =
  | { kind: 'offset'; minutes: number }
  | { kind: 'moment'; date: string | null; time: string }

export interface ReminderMatch {
  reminder: ReminderPhrase
  from: number
  to: number
}

const UNIT_MINUTES = { minute: 1, hour: 60, day: 1440, week: 10080 } as const

function offsetUnitAt(tokens: readonly Token[], i: number, v: Vocabulary): { n: number; minutes: number } | null {
  for (const unit of ['minute', 'hour', 'day', 'week'] as const) {
    const n = phraseAt(tokens, i, v.units[unit], `${v.code}:unit:${unit}`)
    if (n) return { n, minutes: UNIT_MINUTES[unit] }
  }
  return null
}

/** An offset at token k: a count and a unit, or a compact duration ("30min", "2h"), then a before or after word. */
function offsetAt(tokens: readonly Token[], k: number, ctx: DateContext): { n: number; minutes: number } | null {
  let best: { n: number; minutes: number } | null = null
  for (const v of ctx.vocabs) {
    let amount: { n: number; minutes: number } | null = null
    const count = countAt(tokens, k, v)
    if (count) {
      const unit = offsetUnitAt(tokens, k + count.n, v)
      if (unit) amount = { n: count.n + unit.n, minutes: count.count * unit.minutes }
    }
    if (!amount && tokens[k] && !tokens[k].quoted) {
      const m = matchDuration(tokens[k].text, { bareHourIsTime: false })
      if (m !== null) amount = { n: 1, minutes: m }
    }
    if (!amount || amount.minutes <= 0) continue
    const before = phraseAt(tokens, k + amount.n, v.beforeWords, `${v.code}:rbefore`)
    const after = before ? 0 : phraseAt(tokens, k + amount.n, v.afterWords, `${v.code}:rafter`)
    if (!before && !after) continue
    const n = amount.n + (before || after)
    if (!best || n > best.n) best = { n, minutes: before ? -amount.minutes : amount.minutes }
  }
  return best
}

/** A moment at token k: [date] time or time [date]. */
function momentAt(tokens: readonly Token[], k: number, ctx: DateContext): { n: number; date: string | null; time: string } | null {
  const dateFirst = matchDateAt(tokens, k, ctx)
  if (dateFirst) {
    const item = matchTimeAt(tokens, dateFirst.to, ctx)
    if (item) return { n: item.to - k, date: dateFirst.date, time: item.time }
  }
  const entry = matchTimeAt(tokens, k, ctx)
  if (!entry) return null
  const d = matchDateAt(tokens, entry.to, ctx)
  if (d) return { n: d.to - k, date: d.date, time: entry.time }
  return { n: entry.to - k, date: entry.date ?? null, time: entry.time }
}

/** The longest reminder phrase at token i; a reminder word alone does not match. */
export function matchReminderAt(tokens: readonly Token[], i: number, ctx: DateContext): ReminderMatch | null {
  if (!tokens[i] || tokens[i].quoted) return null
  let word = 0
  for (const v of ctx.vocabs) word = Math.max(word, phraseAt(tokens, i, v.remindWords, `${v.code}:remind`))
  if (!word) return null
  const r = parseReminderAt(tokens, i + word, ctx)
  return r ? { reminder: r.reminder, from: i, to: r.to } : null
}

/** The reminder body (offset or moment) at token k, without the reminder word. */
export function parseReminderAt(tokens: readonly Token[], k: number, ctx: DateContext): { reminder: ReminderPhrase; to: number } | null {
  const off = offsetAt(tokens, k, ctx)
  const mom = momentAt(tokens, k, ctx)
  if (off && (!mom || off.n >= mom.n)) return { reminder: { kind: 'offset', minutes: off.minutes }, to: k + off.n }
  if (mom) return { reminder: { kind: 'moment', date: mom.date, time: mom.time }, to: k + mom.n }
  return null
}

/** How a typed reminder is stored once the due date is known (design D3). */
export type ResolvedReminder =
  | { kind: 'relative'; offsetMinutes: number }
  | { kind: 'absolute'; date: string; time: string }

const dayNumberOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Resolve a typed reminder against the task's final due: an offset is relative;
 * a moment is relative to the due time (09:00 for a date-only due) on wall-clock
 * days and minutes, so every device computes the same offset; without a due a
 * moment is absolute, its date today, or tomorrow when the time has passed.
 */
export function resolveReminder(r: ReminderPhrase, due: { date: string; time?: string } | null, today: string, now: string): ResolvedReminder {
  if (r.kind === 'offset') return { kind: 'relative', offsetMinutes: r.minutes }
  if (due) {
    const dueAt = dayNumberOf(due.date) * 1440 + minutesOf(due.time ?? '09:00')
    const at = dayNumberOf(r.date ?? due.date) * 1440 + minutesOf(r.time)
    return { kind: 'relative', offsetMinutes: at - dueAt }
  }
  if (r.date) return { kind: 'absolute', date: r.date, time: r.time }
  if (minutesOf(r.time) > minutesOf(now)) return { kind: 'absolute', date: today, time: r.time }
  const [y, m, d] = today.split('-').map(Number)
  return { kind: 'absolute', date: new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10), time: r.time }
}

/** "30 min before", "1 hour after", "2 days before", "at due time" for an offset in minutes. */
export function describeOffset(minutes: number): string {
  if (minutes === 0) return t('at due time')
  const a = Math.abs(minutes)
  const before = minutes < 0
  if (a % 1440 === 0) return before ? t('{n, plural, one {# day before} other {# days before}}', { n: a / 1440 }) : t('{n, plural, one {# day after} other {# days after}}', { n: a / 1440 })
  if (a % 60 === 0) return before ? t('{n, plural, one {# hour before} other {# hours before}}', { n: a / 60 }) : t('{n, plural, one {# hour after} other {# hours after}}', { n: a / 60 })
  return before ? t('{n} min before', { n: a }) : t('{n} min after', { n: a })
}
