// Check-in notes (OpenSpec change habit-notes, design D1, D3, D6): the records of a
// habit with a note, the days that have one, and the kept measure of a span of days,
// from the device's rows. Out of the first load: only the habit screens, the habit's
// page and the weekly review read it.
import type { DayCell } from './habits'
import { lineageOf } from './lineage'
import { isRecordOf, recordDate } from './recurring'
import type { Task } from './types'

/** A record of a habit with a note (habit-notes D3): its date, its state and the record itself. */
export interface CheckIn {
  date: string
  state: 'done' | 'tiny' | 'skipped'
  record: Task
}

/**
 * The habit's records with a note, newest first (habit-notes D3), across the
 * pieces of a split lineage. A record written before habit-notes copied its
 * piece's note; one that still holds exactly that note is not a check-in (D1).
 */
export function checkInsOf(series: Task, rows: Iterable<Task>): CheckIn[] {
  const list = Array.isArray(rows) ? (rows as Task[]) : [...rows]
  const pieces = lineageOf(series, list).map((p) => p.task)
  const out: CheckIn[] = []
  for (const piece of pieces) {
    const copied = piece.description.trim()
    for (const record of list) {
      if (record.deleted_at || !record.completed_at || !isRecordOf(piece.id, record)) continue
      const note = record.description.trim()
      if (!note || note === copied) continue
      const date = recordDate(record) as string
      out.push({ date, state: record.skipped ? 'skipped' : record.tiny ? 'tiny' : 'done', record })
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

/** The dates of the habit's check-ins with a note: the thread and the month grid mark them (D3). */
export function noteDatesOf(series: Task, rows: Iterable<Task>): Set<string> {
  return new Set(checkInsOf(series, rows).map((c) => c.date))
}

/**
 * The kept measure of a span of days (habit-notes D6, the weekly review): done or tiny
 * days among the scheduled days that have passed, skipped ones included as in the
 * Kept number; today counts once it is kept, later days not at all.
 */
export function spanMeasure(days: readonly DayCell[]): { kept: number; of: number } {
  let kept = 0
  let of = 0
  for (const d of days) {
    if (d.state === 'done' || d.state === 'tiny') { kept++; of++ }
    else if (d.state === 'skipped' || d.state === 'missed') of++
  }
  return { kept, of }
}
