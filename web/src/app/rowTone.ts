// The colour rules of a task row (OpenSpec change rows-v2, task-list-presentation
// "Metadata language"): colour carries meaning only, and these are the one copy of
// the tables, used by the list row, the board card and the Plan's rows.
import { addDaysISO } from '../lib/dates'
import type { Tone } from '../ui'

/** The priority ring of an open task: P1 and P2 in their colours, P3 and P4 the neutral ring. */
export const PRIORITY_RING: Record<number, string> = {
  1: 'border-p1 bg-p1-soft',
  2: 'border-p2 bg-p2-soft',
  3: 'border-input',
  4: 'border-input',
}

/**
 * The due ladder (OpenSpec change page-rhythm, design D7): a date after tomorrow is
 * muted, tomorrow the default text, today the accent (timed or not), a day before
 * today danger, so nothing goes from invisible to red overnight. `date` and `today`
 * are local ISO days; the logical today moves the ladder at the user's day start.
 */
export function ladderTone(date: string, today: string): Tone {
  if (date < today) return 'danger'
  if (date === today) return 'accent'
  return date === addDaysISO(today, 1) ? 'default' : 'muted'
}

/** A deadline countdown's tone (OpenSpec change deadlines, design D2). */
export const DEADLINE_TONE: Record<'overdue' | 'soon' | 'later', Tone> = { overdue: 'danger', soon: 'warning', later: 'muted' }
