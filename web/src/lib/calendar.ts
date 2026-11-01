// Time-blocking calendar math (OpenSpec `time-blocking`). Pure functions: the Day and
// Week views, the drag layer and the keyboard handlers only turn pixels and keys into
// minutes through these, and every write they produce is an ordinary `due` or
// `estimate_minutes` edit (design D1, D5).
import { addDaysISO, localDueOf } from './dates'
import { formatMinutes, MAX_ESTIMATE_MINUTES } from './duration'
import type { CalendarEvent, CalendarWhen, Due, Project, Task } from './types'
import { spanClip, spanOf } from './span'

export const SLOT_MINUTES = 15
/**
 * The shortest a block is drawn, in minutes of the grid (20 px at 0.8 px a minute):
 * room for its title. Blocks closer together than that sit side by side (issue 526).
 */
export const MIN_BLOCK_MINUTES = 25
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

/**
 * Start from dragging a block's upper edge (GitHub issue 355): whole slots, the end stays
 * where it is, so the estimate grows or shrinks by the same amount; at least one slot
 * long, at most the longest estimate, never before 00:00. `blockEnd` is minutes from
 * midnight (start plus the estimate, or the visual 30 minutes of an unestimated block).
 */
export function resizeStart(blockEnd: number, pointerOffsetPx: number, pxPerMinute: number): { start: number; estimate: number } {
  const raw = pxPerMinute > 0 && Number.isFinite(pointerOffsetPx) ? pointerOffsetPx / pxPerMinute : 0
  const start = clamp(Math.round(raw / SLOT_MINUTES) * SLOT_MINUTES, Math.max(0, blockEnd - MAX_ESTIMATE_MINUTES), clamp(blockEnd - SLOT_MINUTES, 0, LAST_SLOT))
  return { start, estimate: blockEnd - start }
}

/** Keyboard: move a block's start by `delta` minutes keeping its end (the upper-edge twin of `stepEstimate`). */
export function stepStart(start: number, estimate: number | null, delta: number): { start: number; estimate: number } {
  const end = start + (estimate ?? DEFAULT_BLOCK_MINUTES)
  const snapped = delta > 0 ? Math.floor(start / SLOT_MINUTES) * SLOT_MINUTES : Math.ceil(start / SLOT_MINUTES) * SLOT_MINUTES
  const next = clamp(snapped + delta, Math.max(0, end - MAX_ESTIMATE_MINUTES), clamp(end - SLOT_MINUTES, 0, LAST_SLOT))
  return { start: next, estimate: end - next }
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
    const span = timedSpan(ev, zone)
    const b = span && blockOn(ev, span, date)
    if (b) out.push(b)
  }
  return out.sort(byStart)
}

const byStart = (a: EventBlock, b: EventBlock) => a.start - b.start || b.end - a.end

type TimedSpan = { start: { date: string; minutes: number }; end: { date: string; minutes: number } }

/** A timed event's start and end in the viewer's zone; null for all-day events. */
function timedSpan(ev: CalendarEvent, zone?: string): TimedSpan | null {
  if (ev.allDay) return null
  const start = wallPoint(ev.start, zone)
  if (!start) return null
  return { start, end: wallPoint(ev.end, zone) ?? { date: start.date, minutes: start.minutes } }
}

/** The part of a timed event inside `date`, or null when it is not on that day. */
function blockOn(ev: CalendarEvent, { start, end }: TimedSpan, date: string): EventBlock | null {
  if (start.date > date || end.date < date) return null
  const from = start.date < date ? 0 : start.minutes
  const to = end.date > date ? DAY_MINUTES : end.minutes
  // An event ending at 00:00 is not on the next day; a zero-length one still gets a slot-high block.
  if (to <= from && !(start.date === date && to === from)) return null
  return { id: `event:${ev.id}`, start: from, end: Math.max(to, Math.min(DAY_MINUTES, from + SLOT_MINUTES)), event: ev }
}

/** One day's events for Month and Year: all-day ones as allDayEvents orders them, timed ones as eventBlocks. */
export interface DayEvents {
  allDay: CalendarEvent[]
  timed: EventBlock[]
}

/**
 * The events of every day in [from, to] (calendar-events-all-views): each event is
 * placed once on the days it covers, with the same rules as allDayEvents and
 * eventBlocks, so a Month or a Year does not test every event against every day.
 * Days without events are absent.
 */
export function eventsByDay(events: readonly CalendarEvent[], from: string, to: string, zone?: string): Map<string, DayEvents> {
  const out = new Map<string, DayEvents>()
  const day = (d: string) => {
    let x = out.get(d)
    if (!x) out.set(d, (x = { allDay: [], timed: [] }))
    return x
  }
  for (const ev of events) {
    if (ev.allDay) {
      const end = ev.end.date > ev.start.date ? ev.end.date : addDaysISO(ev.start.date, 1)
      for (let d = ev.start.date < from ? from : ev.start.date; d < end && d <= to; d = addDaysISO(d, 1)) day(d).allDay.push(ev)
      continue
    }
    const span = timedSpan(ev, zone)
    if (!span) continue
    for (let d = span.start.date < from ? from : span.start.date; d <= span.end.date && d <= to; d = addDaysISO(d, 1)) {
      const b = blockOn(ev, span, d)
      if (b) day(d).timed.push(b)
    }
  }
  for (const x of out.values()) {
    x.allDay.sort((a, b) => (a.start.date < b.start.date ? -1 : a.start.date > b.start.date ? 1 : a.summary.localeCompare(b.summary)))
    x.timed.sort(byStart)
  }
  return out
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

/** Live tasks due in [from, to], or spans covering a day of it, optionally including completed work; archived projects stay excluded. */
export function calendarTasks(tasks: readonly Task[], projects: readonly Pick<Project, 'id' | 'archived'>[], from: string, to: string, showCompleted = false): Task[] {
  const archived = new Set(projects.filter((p) => p.archived).map((p) => p.id))
  // A span is on screen when any of its days is (multi-day-tasks D3).
  const inRange = (t: Task) => {
    if (!t.due) return false
    if (t.due.date >= from && t.due.date <= to) return true
    const span = spanOf(t)
    return !!span && spanClip(span, from, to) !== null
  }
  return tasks.filter((t) => !t.deleted_at && (showCompleted || !t.completed_at) && inRange(t) && !(t.project_id && archived.has(t.project_id)))
}

/**
 * Deadlines on the calendar (OpenSpec change calendar-clarity, design D1): per date in
 * [from, to], the open, live tasks of non-archived projects whose `deadline` falls on it
 * (a floating date, no zone conversion). A task whose (viewed) due is on its deadline
 * day is drawn there already and carries the diamond instead, so it is left out. Never
 * part of capacity: markers are not tasks of the day.
 */
export function deadlineMarkers(tasks: readonly Task[], projects: readonly Pick<Project, 'id' | 'archived'>[], from: string, to: string): Map<string, Task[]> {
  const archived = new Set(projects.filter((p) => p.archived).map((p) => p.id))
  const out = new Map<string, Task[]>()
  for (const t of tasks) {
    const d = t.deadline
    if (!d || t.deleted_at || t.completed_at || d < from || d > to || (t.project_id && archived.has(t.project_id))) continue
    if (t.due?.date === d) continue
    const list = out.get(d)
    if (list) list.push(t)
    else out.set(d, [t])
  }
  for (const list of out.values()) list.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title))
  return out
}

/** Calendar visibility is a device-local display choice, independent of grid settings. */
export const CALENDAR_COMPLETED_META_KEY = 'calendar.showCompleted'

const NO_SLOT_LOAD = { extra: 0, covered: 0 }

export interface DayLoad {
  /** What the line shows: the task estimates plus the counted event minutes. */
  planned: number
  /** Sum of estimates of the day's open tasks, timed and untimed. */
  tasks: number
  /** Busy event minutes counted (0 unless "Count meetings in capacity" is on). */
  events: number
  /** Estimates of the projected occurrences drawn on the day (series-occurrences D5). */
  projected: number
  /** Open tasks of the day without an estimate (counted as 0). */
  unestimated: number
  /** The tasks alone exceed the day length (the danger tone). */
  overTasks: boolean
  /** The tasks fit, but tasks plus event minutes exceed the day length (the warning tone). */
  overWithEvents: boolean
  /** Either of the two. */
  over: boolean
}

/**
 * The load of `date` against the day length (OpenSpec `time-blocking` "Overlap and
 * capacity"): the open tasks' estimates, plus `eventMinutes` when the device counts
 * meetings (meeting-aware-capacity D3). `slots` is what the day's calendar slots
 * change (calendar-slots D6, lib/slots `slotCapacity`): each slot counts once with
 * the greater of its length and its tasks' estimates. `projected` are the day's drawn
 * projected occurrences (series-occurrences D5): their estimates join the tasks', named
 * apart, and one without an estimate joins the unestimated count.
 */
export function dayLoad(tasks: readonly Pick<Task, 'due' | 'estimate_minutes' | 'completed_at' | 'deleted_at'>[], date: string, dayLength: number, eventMinutes = 0, slots: { extra: number; covered: number } = NO_SLOT_LOAD, projected: readonly { estimate_minutes: number | null }[] = []): DayLoad {
  let taskMinutes = slots.extra
  let unestimated = -slots.covered
  for (const t of tasks) {
    if (t.completed_at || t.deleted_at || t.due?.date !== date) continue
    if (t.estimate_minutes) taskMinutes += t.estimate_minutes
    else unestimated++
  }
  unestimated = Math.max(0, unestimated)
  let repeating = 0
  for (const p of projected) {
    if (p.estimate_minutes) repeating += p.estimate_minutes
    else unestimated++
  }
  const events = Math.max(0, eventMinutes)
  const planned = taskMinutes + repeating + events
  const overTasks = taskMinutes + repeating > dayLength
  const overWithEvents = !overTasks && planned > dayLength
  return { planned, tasks: taskMinutes, events, projected: repeating, unestimated, overTasks, overWithEvents, over: overTasks || overWithEvents }
}

/**
 * Busy minutes of `date` in the viewer's zone (OpenSpec `planner-view` "Event minutes
 * in the capacity"): timed, non-free events clipped to the day, overlapping intervals
 * counted once. All-day and free events count zero.
 */
export function eventMinutes(events: readonly CalendarEvent[], date: string, zone?: string): number {
  const busy = events.filter((ev) => !ev.free && !ev.allDay && !(ev.start.date === ev.end.date && ev.start.time === ev.end.time && ev.start.tz === ev.end.tz))
  // eventBlocks gives a zero-length remainder a slot-high block; a part that ends at
  // its start (an event ending at 00:00 of this day) is not inside the day.
  const spans = eventBlocks(busy, date, zone)
    .map((b) => ({ start: b.start, end: realEnd(b.event, date, b.start, b.end, zone) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start)
  let total = 0
  let curStart = -1, curEnd = -1
  for (const s of spans) {
    if (s.start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart
      curStart = s.start
      curEnd = s.end
    } else curEnd = Math.max(curEnd, s.end)
  }
  if (curEnd > curStart) total += curEnd - curStart
  return Math.min(total, DAY_MINUTES)
}

/** The block's end without the minimum height eventBlocks adds for drawing. */
function realEnd(ev: CalendarEvent, date: string, start: number, end: number, zone?: string): number {
  if (!ev.end.time) return end
  const local = ev.end.tz ? localDueOf({ date: ev.end.date, time: ev.end.time, tz: ev.end.tz }, zone) : { date: ev.end.date, time: ev.end.time }
  if (local.date !== date || !local.time) return end
  const [h, m] = local.time.split(':').map(Number)
  return Math.max(start, Math.min(end, h * 60 + m))
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
  /** Days the Plan shows (planner-view D7): 7, 14 or 21. */
  planDays: 7 | 14 | 21
  /** "Count meetings in capacity" (meeting-aware-capacity D2): busy event minutes join Day, Week and Month capacity. */
  countEvents: boolean
}

export const DEFAULT_GRID_PREFS: GridPrefs = { startHour: 6, endHour: 22, dayLength: 480, planDays: 14, countEvents: false }
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
  const planDays = r.planDays === 7 || r.planDays === 21 ? r.planDays : DEFAULT_GRID_PREFS.planDays
  return { startHour, endHour, dayLength, planDays, countEvents: r.countEvents === true }
}
