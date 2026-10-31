import { addDaysISO, daysBetweenISO, formatDateRange } from './dates'
import type { Due, Task } from './types'

/**
 * A task drawn across several days (OpenSpec change `multi-day-tasks`, design D1):
 * its first day is `start`, its last day `due.date`, `length` the number of days
 * it covers (at least 2).
 */
export interface Span {
  first: string
  last: string
  length: number
}

type SpanFields = Pick<Task, 'start' | 'span'> & { due: Due | null }

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The span a task is drawn as, or null: only when `span` is true, its start is a
 * date and its do-on date is later (D1). Any other combination draws as a plain
 * task and keeps the flag; nothing is ever refused on write.
 */
export function spanOf(task: SpanFields): Span | null {
  if (!task.span) return null
  const first = task.start
  const last = task.due?.date
  if (!first || !last || !DATE.test(first) || !DATE.test(last) || first >= last) return null
  return { first, last, length: daysBetweenISO(first, last) + 1 }
}

/** Whether `day` is one of the span's days. */
export function spanCovers(span: Span, day: string): boolean {
  return day >= span.first && day <= span.last
}

/** The position of `day` in the span, 1-based ("Day 2 of 3"). */
export function spanDay(span: Span, day: string): number {
  return daysBetweenISO(span.first, day) + 1
}

/** The span's days inside `from`..`to` (inclusive), clipped; null when none. */
export function spanClip(span: Span, from: string, to: string): { first: string; last: string; startsBefore: boolean; endsAfter: boolean } | null {
  if (span.last < from || span.first > to) return null
  return {
    first: span.first < from ? from : span.first,
    last: span.last > to ? to : span.last,
    startsBefore: span.first < from,
    endsAfter: span.last > to,
  }
}

/** One span laid out over a row of days: its columns, its lane and where it continues (D3). */
export interface SpanPiece<T> {
  item: T
  /** The first column (0-based) and the number of columns it covers. */
  col: number
  cols: number
  lane: number
  first: string
  last: string
  startsBefore: boolean
  endsAfter: boolean
}

/**
 * Packs spans over `days` (consecutive dates) into lanes, as the all-day strip packs
 * multi-day events: earlier first days first, longer spans first on a tie, each in the
 * lowest lane free over all of its columns. Spans outside the days are left out.
 */
export function packSpans<T extends { id: string; span: Span }>(items: readonly T[], days: readonly string[]): SpanPiece<T>[] {
  if (days.length === 0) return []
  const from = days[0], to = days[days.length - 1]
  const pieces: SpanPiece<T>[] = []
  for (const item of items) {
    const clip = spanClip(item.span, from, to)
    if (!clip) continue
    const col = daysBetweenISO(from, clip.first)
    pieces.push({ item, col, cols: daysBetweenISO(clip.first, clip.last) + 1, lane: 0, ...clip })
  }
  pieces.sort((a, b) => a.col - b.col || b.cols - a.cols || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0))
  // The last column each lane is taken up to.
  const taken: number[] = []
  for (const p of pieces) {
    let lane = taken.findIndex((end) => end < p.col)
    if (lane < 0) lane = taken.length
    taken[lane] = p.col + p.cols - 1
    p.lane = lane
  }
  return pieces
}

/** The number of lanes the pieces take. */
export const laneCount = (pieces: readonly { lane: number }[]): number => pieces.reduce((n, p) => Math.max(n, p.lane + 1), 0)

/** The span's range as text, "3–5 Nov" (the same as the When line and the range chip). */
export function formatSpan(span: Span): string {
  const sameYear = span.first.slice(0, 4) === span.last.slice(0, 4)
  return formatDateRange(span.first, span.last, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The span moved by `days` (start and due together, time and zone kept): the patch of one batch (D4). */
export function moveSpanPatch(task: Pick<Task, 'start'> & { due: Due | null }, days: number): { start: string; due: Due } | null {
  if (!task.start || !task.due || !DATE.test(task.start)) return null
  return { start: addDaysISO(task.start, days), due: { ...task.due, date: addDaysISO(task.due.date, days) } }
}

/**
 * The patch that moves one end of a span by `days` (D4): the first day changes
 * `start`, the last day `due.date` (time and zone kept). Neither end passes the
 * other: the span stops at one day. Null when nothing changes.
 */
export function resizeSpanPatch(task: SpanFields, end: 'first' | 'last', days: number): { start: string } | { due: Due } | null {
  const span = spanOf(task) ?? (task.span && task.start && task.due && DATE.test(task.start) && task.start === task.due.date
    ? { first: task.start, last: task.due.date, length: 1 } : null)
  if (!span || !task.due) return null
  if (end === 'first') {
    let next = addDaysISO(span.first, days)
    if (next > span.last) next = span.last
    return next === span.first ? null : { start: next }
  }
  let next = addDaysISO(span.last, days)
  if (next < span.first) next = span.first
  return next === span.last ? null : { due: { ...task.due, date: next } }
}

/**
 * The patch that makes a date-only task a span from its current do-on date to
 * `to` (D2, D4): start, due and the flag in one batch. A task with an earlier
 * start keeps nothing of it. Null when `to` is not later or the task has a time.
 */
export function extendToSpanPatch(task: { due: Due | null }, to: string): { start: string; due: Due; span: true } | null {
  const due = task.due
  if (!due || due.time || to <= due.date) return null
  return { start: due.date, due: { date: to }, span: true }
}

/**
 * The When popover's Multi-day switch turned on (D2): the flag, and a start the
 * day before the do-on date unless the start is already a date before it.
 */
export function multiDayOnPatch(task: Pick<Task, 'start'> & { due: Due | null }): { span: true; start?: string } | null {
  if (!task.due) return null
  const start = task.start
  if (start && DATE.test(start) && start < task.due.date) return { span: true }
  return { span: true, start: addDaysISO(task.due.date, -1) }
}
