// A daily note's identity (OpenSpec change daily-notes, D1), pure so the
// routine planner on a device shares it: the name-based id of the user and the
// day (Go sync.DailyNoteID) and the title pattern (Go rules.DailyTitle).
import { nameId } from './ids'

/** The id of `userId`'s daily note for `day` (YYYY-MM-DD), the same on every device. */
export function dailyNoteId(userId: string, day: string): string {
  return nameId('daily-note', `${userId}:${day}`)
}

/** A daily note's title: its weekday and date, filled from the placeholders. */
export const DAILY_TITLE = '{{weekday}} {{date}}'
