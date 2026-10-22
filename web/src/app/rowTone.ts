// The colour rules of a task row (OpenSpec change rows-v2, task-list-presentation
// "Metadata language"): colour carries meaning only, and these are the one copy of
// the tables, used by the list row, the board card and the Plan's rows.
import type { Tone } from '../ui'

/** The priority ring of an open task: P1 and P2 in their colours, P3 and P4 the neutral ring. */
export const PRIORITY_RING: Record<number, string> = {
  1: 'border-p1 bg-p1-soft',
  2: 'border-p2 bg-p2-soft',
  3: 'border-input',
  4: 'border-input',
}

/** A due's tone: danger when overdue, the accent for a timed task due today, muted otherwise. */
export function dueTone(tone: 'overdue' | 'today' | 'soon' | 'later', timed: boolean): Tone {
  return tone === 'overdue' ? 'danger' : tone === 'today' && timed ? 'accent' : 'muted'
}

/** A deadline countdown's tone (OpenSpec change deadlines, design D2). */
export const DEADLINE_TONE: Record<'overdue' | 'soon' | 'later', Tone> = { overdue: 'danger', soon: 'warning', later: 'muted' }
