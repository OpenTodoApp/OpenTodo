// Time-blocking calendar math (OpenSpec `time-blocking`). Pure functions: the Day and
// Week views, the drag layer and the keyboard handlers only turn pixels and keys into
// minutes through these, and every write they produce is an ordinary `due` or
// `estimate_minutes` edit (design D1, D5).
import { addDaysISO, localDueOf } from './dates'
import { formatMinutes, MAX_ESTIMATE_MINUTES } from './duration'
import type { CalendarEvent, CalendarWhen, Due, Project, Task } from './types'

export const SLOT_MINUTES = 15
export const DAY_MINUTES = 24 * 60
/** Visual length of an unestimated block; it does not count towards capacity. */
export const DEFAULT_BLOCK_MINUTES = 30
/** Latest slot a block may start at. */
export const LAST_SLOT = DAY_MINUTES - SLOT_MINUTES

// ---- time strings ----

/** `HH:MM` → minutes from midnight; null for anything else. */
export function parseTime(time: string | undefined | null): number | null {
  const m = time ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time) : null
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Minutes from midnight → `HH:MM`, clamped to the day. */
export function formatTime(minutes: number): string {
  const n = clamp(Math.round(minutes), 0, DAY_MINUTES - 1)
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

// ---- slot math (pointer → minutes) ----

/** The slot under a pointer `offsetPx` below the top of a day column (00:00). Floors, so the slot under the pointer wins. */
export function slotFromOffset(offsetPx: number, pxPerMinute: number): number {
  if (!(pxPerMinute > 0) || !Number.isFinite(offsetPx)) return 0
  return clamp(Math.floor(offsetPx / pxPerMinute / SLOT_MINUTES) * SLOT_MINUTES, 0, LAST_SLOT)
}

/**
 * Start slot for a dragged block: the pointer offset minus where the block was grabbed,
 * rounded to the nearest slot so the ghost follows the hand.
 */
export function dropStart(pointerOffsetPx: number, grabOffsetPx: number, pxPerMinute: number): number {
  if (!(pxPerMinute > 0)) return 0
  const minutes = (pointerOffsetPx - grabOffsetPx) / pxPerMinute
  return clamp(Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES, 0, LAST_SLOT)
}

/** Estimate from dragging a block's lower edge: whole slots, at least one, at most one week. */
export function resizeEstimate(startMinutes: number, pointerOffsetPx: number, pxPerMinute: number): number {
  if (!(pxPerMinute > 0)) return SLOT_MINUTES
  const length = pointerOffsetPx / pxPerMinute - startMinutes
  return clamp(Math.round(length / SLOT_MINUTES) * SLOT_MINUTES, SLOT_MINUTES, MAX_ESTIMATE_MINUTES)
}

/** Keyboard: estimate ± `delta` minutes from the current one (an unestimated block starts at its visual 30). */
export function stepEstimate(current: number | null, delta: number): number {
  const base = current ?? DEFAULT_BLOCK_MINUTES
  // Snap odd estimates (e.g. 20 from shorthand) onto the 15-minute grid in the direction of travel.
  const snapped = delta > 0 ? Math.floor(base / SLOT_MINUTES) * SLOT_MINUTES : Math.ceil(base / SLOT_MINUTES) * SLOT_MINUTES
  return clamp(snapped + delta, SLOT_MINUTES, MAX_ESTIMATE_MINUTES)
}

/**
 * Keyboard: move a due by `minutes` and/or `days`. A timed due moves within its day
 * (clamped to 00:00 and the last slot); a date-only due keeps no time unless
 * `minutes` is non-zero, in which case it lands on `fallbackStart` (the grid start).
 */
export function nudgeDue(due: Due, opts: { minutes?: number; days?: number; fallbackStart?: number }): Due {
  const date = opts.days ? addDaysISO(due.date, opts.days) : due.date
  const start = parseTime(due.time)
  if (start === null) {
    if (!opts.minutes) return { date }
    return { date, time: formatTime(clamp(opts.fallbackStart ?? 9 * 60, 0, LAST_SLOT)) }
  }
  return { date, time: formatTime(clamp(start + (opts.minutes ?? 0), 0, LAST_SLOT)) }
}

// ---- blocks and days ----

export interface Block {
  id: string
  start: number
  end: number
  /** False when the task has no estimate: drawn dashed, 30 minutes long, no label. */
  estimated: boolean
}

/** A task's block on its due date: due time plus estimate (design D1); null without a valid time. */
export function blockFor(task: Pick<Task, 'id' | 'due' | 'estimate_minutes'>): Block | null {
  const start = parseTime(task.due?.time)
  if (start === null) return null
  const estimated = task.estimate_minutes !== null && task.estimate_minutes > 0
  const length = estimated ? task.estimate_minutes! : DEFAULT_BLOCK_MINUTES
  // A block that runs past midnight is drawn to the end of its day.
  return { id: task.id, start, end: Math.min(DAY_MINUTES, start + length), estimated }
}

export interface EventBlock {
  id: string
  start: number
  end: number
  event: CalendarEvent
}

/** A timed event point as a wall date and minutes in `zone`: floating points are wall time already. */
function wallPoint(p: CalendarWhen, zone?: string): { date: string; minutes: number } | null {
  if (!p.time) return null
  const local = p.tz ? localDueOf({ date: p.date, time: p.time, tz: p.tz }, zone) : { date: p.date, time: p.time }
  const minutes = parseTime(local.time)
  return minutes === null ? null : { date: local.date, minutes }
}

/**
 * Timed events on `date` as grid blocks (OpenSpec calendar-feeds, design D8): zoned
 * points converted to the viewer's zone, floating ones taken as wall time, and an
 * event that crosses midnight clipped to the part inside this day.
 */
export function eventBlocks(events: readonly CalendarEvent[], date: string, zone?: string): EventBlock[] {
  const out: EventBlock[] = []
  for (const ev of events) {
    if (ev.allDay) continue
    const start = wallPoint(ev.start, zone)
    if (!start) continue
    const end = wallPoint(ev.end, zone) ?? { date: start.date, minutes: start.minutes }
    if (start.date > date || end.date < date) continue
    const from = start.date < date ? 0 : start.minutes
    const to = end.date > date ? DAY_MINUTES : end.minutes
    // An event ending at 00:00 is not on the next day; a zero-length one still gets a slot-high block.
    if (to <= from && !(start.date === date && to === from)) continue
    out.push({ id: `event:${ev.id}`, start: from, end: Math.max(to, Math.min(DAY_MINUTES, from + SLOT_MINUTES)), event: ev })
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end)
}

/** All-day events covering `date` (the end date is exclusive, as in iCalendar). */
export function allDayEvents(events: readonly CalendarEvent[], date: string): CalendarEvent[] {
  return events
    .filter((ev) => {
      if (!ev.allDay) return false
      const end = ev.end.date > ev.start.date ? ev.end.date : addDaysISO(ev.start.date, 1)
      return ev.start.date <= date && date < end
    })
    .sort((a, b) => (a.start.date < b.start.date ? -1 : a.start.date > b.start.date ? 1 : a.summary.localeCompare(b.summary)))
}

/** Open, live tasks due in [from, to] (inclusive ISO dates), leaving out archived projects. */
export function calendarTasks(tasks: readonly Task[], projects: readonly Pick<Project, 'id' | 'archived'>[], from: string, to: string): Task[] {
  const archived = new Set(projects.filter((p) => p.archived).map((p) => p.id))
  return tasks.filter((t) => !t.deleted_at && !t.completed_at && t.due && t.due.date >= from && t.due.date <= to && !(t.project_id && archived.has(t.project_id)))
}

export interface DayLoad {
  /** Sum of estimates of the day's open tasks, timed and untimed. */
  planned: number
  /** Open tasks of the day without an estimate (counted as 0). */
  unestimated: number
  over: boolean
}

export function dayLoad(tasks: readonly Pick<Task, 'due' | 'estimate_minutes' | 'completed_at' | 'deleted_at'>[], date: string, dayLength: number): DayLoad {
  let planned = 0
  let unestimated = 0
  for (const t of tasks) {
    if (t.completed_at || t.deleted_at || t.due?.date !== date) continue
    if (t.estimate_minutes) planned += t.estimate_minutes
    else unestimated++
  }
  return { planned, unestimated, over: planned > dayLength }
}

/** `9h / 8h`, `1h 30m / 8h`. */
export function formatLoad(load: DayLoad, dayLength: number): string {
  return `${formatMinutes(load.planned)} / ${formatMinutes(dayLength)}`
}

/**
 * The week containing `iso`, starting on `weekStart` (0 = Sunday … 6 = Saturday;
 * the user's first day of the week, date-time-preferences D5). Monday by default.
 */
export function weekDates(iso: string, weekStart = 1): string[] {
  const [y, m, d] = iso.split('-').map(Number)
  const back = (new Date(y, m - 1, d).getDay() - weekStart + 7) % 7
  const first = addDaysISO(iso, -back)
  return Array.from({ length: 7 }, (_, i) => addDaysISO(first, i))
}

/**
 * Where placement mode puts a task first: its own due time when it has one, else the
 * next slot after `nowMinutes` when that falls inside the grid hours of today, else
 * the grid start.
 */
export function placementStart(task: Pick<Task, 'due'>, date: string, today: string, nowMinutes: number, prefs: GridPrefs): number {
  const own = task.due?.date === date ? parseTime(task.due.time) : null
  if (own !== null) return own
  const gridStart = prefs.startHour * 60
  if (date === today) {
    const next = Math.ceil(nowMinutes / SLOT_MINUTES) * SLOT_MINUTES
    if (next >= gridStart && next < prefs.endHour * 60) return clamp(next, 0, LAST_SLOT)
  }
  return gridStart
}

// ---- per-device grid preferences (design D7) ----

export interface GridPrefs {
  startHour: number
  endHour: number
  /** Capacity of a day in minutes. */
  dayLength: number
}

export const DEFAULT_GRID_PREFS: GridPrefs = { startHour: 6, endHour: 22, dayLength: 480 }
export const GRID_PREFS_META_KEY = 'calendar.grid'

/** Coerce a stored value into valid preferences; anything missing or invalid takes its default. */
export function normalizeGridPrefs(raw: unknown): GridPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const int = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null)
  let startHour = int(r.startHour, 0, 23) ?? DEFAULT_GRID_PREFS.startHour
  let endHour = int(r.endHour, 1, 24) ?? DEFAULT_GRID_PREFS.endHour
  if (endHour <= startHour) {
    // Keep whichever was stored and repair the other.
    if (int(r.startHour, 0, 23) !== null && int(r.endHour, 1, 24) === null) endHour = Math.min(24, startHour + 1)
    else if (int(r.endHour, 1, 24) !== null && int(r.startHour, 0, 23) === null) startHour = Math.max(0, endHour - 1)
    else ({ startHour, endHour } = DEFAULT_GRID_PREFS)
  }
  const dayLength = int(r.dayLength, SLOT_MINUTES, DAY_MINUTES) ?? DEFAULT_GRID_PREFS.dayLength
  return { startHour, endHour, dayLength }
}
