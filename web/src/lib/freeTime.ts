// Free time (OpenSpec change assistant-time-blocks, design D1): the parts of each
// day's working hours that no calendar event, frame, slot or timed task takes, as
// the calendar draws them. internal/freetime computes the same, pinned by
// freeTime.vectors.json; the free time block and the on-device find_free_time use
// it. Only times are read, never titles, so encrypted accounts work the same.
import { addDaysISO, daysBetweenISO, localDueOf } from './dates'
import { clockMinutes, frameOccurrences } from './frames'
import type { Frame } from './types'

/** The most days one computation covers (find_free_time's limit). */
export const MAX_FREE_DAYS = 14
const DAY = 24 * 60
/** A timed task without an estimate, as the calendar draws it (DEFAULT_BLOCK_MINUTES). */
const TASK_MINUTES = 30
/** Today's free time starts at the current minute rounded up to the calendar's slot. */
const STEP = 15

/** One end of an event, or a task's due: a date, an optional wall time and zone. */
export interface FreeWhen { date: string; time?: string; tz?: string }
export interface FreeEvent { start: FreeWhen; end: FreeWhen; allDay: boolean; free: boolean }
export interface FreeSlotInput { date: string | null; start: string; minutes: number }
export interface FreeTask { due: FreeWhen | null; estimate_minutes: number | null; done: boolean }
export type FreeFrame = Pick<Frame, 'id' | 'weekdays' | 'start' | 'end' | 'from_date' | 'until_date' | 'position' | 'deleted_at'>

export interface FreeTimeInput {
  from: string
  to: string
  /** The viewer's IANA zone ("" or absent: UTC). */
  zone?: string
  /** The working day in minutes after midnight, [day_start, day_end). */
  day_start: number
  day_end: number
  min_minutes: number
  /** The zone's current date and minute: earlier days have nothing left, today starts at now. */
  today?: string
  now?: number
  events: readonly FreeEvent[]
  frames: readonly FreeFrame[]
  slots: readonly FreeSlotInput[]
  tasks: readonly FreeTask[]
}

export interface FreeStretch { start: string; end: string; minutes: number }
export interface FreeDay { date: string; free: FreeStretch[] }

/** "HH:MM" of minutes after midnight, "24:00" for the end of a day. */
export const freeClock = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** A timed point in the viewer's zone: zoned ones converted, floating ones as they are. */
function wall(w: FreeWhen, zone: string): { date: string; min: number } | null {
  if (!w.time) return null
  const local = w.tz ? localDueOf({ date: w.date, time: w.time, tz: w.tz }, zone) : { date: w.date, time: w.time }
  const min = clockMinutes(local.time)
  return min === null ? null : { date: local.date, min }
}

type Span = { start: number; end: number }

function busyOn(input: FreeTimeInput, date: string, zone: string, occ: Map<string, Span[]>): Span[] {
  const out: Span[] = []
  const add = (s: number, e: number) => {
    const end = Math.min(DAY, e)
    if (end > s) out.push({ start: s, end })
  }
  for (const ev of input.events) {
    if (ev.allDay || ev.free) continue
    const start = wall(ev.start, zone)
    if (!start) continue
    const end = wall(ev.end, zone) ?? start
    if (start.date > date || end.date < date) continue
    add(start.date < date ? 0 : start.min, end.date > date ? DAY : end.min)
  }
  for (const tk of input.tasks) {
    if (tk.done || !tk.due) continue
    const at = wall(tk.due, zone)
    if (!at || at.date !== date) continue
    add(at.min, at.min + (tk.estimate_minutes && tk.estimate_minutes > 0 ? tk.estimate_minutes : TASK_MINUTES))
  }
  for (const sl of input.slots) {
    if (sl.date !== date || !(sl.minutes > 0)) continue
    const s = clockMinutes(sl.start)
    if (s !== null) add(s, s + sl.minutes)
  }
  out.push(...(occ.get(date) ?? []))
  return out
}

/**
 * Each day of from..to with its free stretches of at least min_minutes (at least 1)
 * within the working day. Throws for a range out of order or longer than MAX_FREE_DAYS.
 */
export function freeTime(input: FreeTimeInput): FreeDay[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to) || input.to < input.from) throw new RangeError('freeTime: from and to must be dates in order')
  if (daysBetweenISO(input.from, input.to) + 1 > MAX_FREE_DAYS) throw new RangeError(`freeTime: at most ${MAX_FREE_DAYS} days`)
  const zone = input.zone || 'UTC'
  const occ = new Map<string, Span[]>()
  for (const o of frameOccurrences(input.frames as Frame[], input.from, input.to)) {
    const list = occ.get(o.date) ?? []
    list.push({ start: o.start, end: o.end })
    occ.set(o.date, list)
  }
  const least = Math.max(1, input.min_minutes)
  const out: FreeDay[] = []
  for (let date = input.from; date <= input.to; date = addDaysISO(date, 1)) {
    const day: FreeDay = { date, free: [] }
    let from = Math.max(0, input.day_start)
    const to = Math.min(DAY, input.day_end)
    if (input.today) {
      if (date < input.today) from = to
      else if (date === input.today) from = Math.max(from, Math.ceil((input.now ?? 0) / STEP) * STEP)
    }
    const busy = busyOn(input, date, zone, occ).sort((a, b) => a.start - b.start)
    let cur = from
    const emit = (end: number) => {
      if (end - cur >= least) day.free.push({ start: freeClock(cur), end: freeClock(end), minutes: end - cur })
    }
    for (const b of busy) {
      if (cur >= to) break
      if (b.start > cur) emit(Math.min(b.start, to))
      cur = Math.max(cur, b.end)
    }
    if (cur < to) emit(to)
    out.push(day)
  }
  return out
}
