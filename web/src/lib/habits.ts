// Habits (OpenSpec change habits, design D3): streaks and the month history of a
// recurring task, derived on the device from the series row and its occurrence
// records. Nothing here is stored or sent; the functions are pure, so two devices
// holding the same rows compute the same answer. Pinned by habits.vectors.json.
//
// Dates are floating YYYY-MM-DD strings and all arithmetic runs on day numbers
// (Date.UTC), never on local `Date` values, so time zones and daylight saving
// changes cannot shift a day.
import { parseRule, weeklyInPhase, type Rule } from './recurrence'
import { lineageOf, pieceEnd } from './lineage'
import { isRecordOf, recordDate } from './recurring'
import type { Task, UserPrefs } from './types'
import type { TaskChange } from './taskDelta'
import { t } from './i18n'

export type DayState = 'blank' | 'done' | 'tiny' | 'skipped' | 'missed' | 'pending' | 'upcoming'

export interface HabitStats {
  /** Consecutive scheduled days with a record, walking back from the day before the current occurrence. */
  current: number
  /** The longest such run in the series' history. */
  best: number
  /** The current occurrence has no record yet. */
  pending: boolean
  /** The current occurrence is before today: the streak ends unless it is done or skipped. */
  overdue: boolean
  /** Done or tiny days among the last seven scheduled dates before the current occurrence (habits-home D4). */
  kept: number
  /** How many scheduled dates `kept` is counted over: seven, fewer for a young habit. */
  keptOf: number
  /** 0–100: an exponential moving average over the scheduled dates, a miss lowering it a little (D4). */
  strength: number
  /** The two latest scheduled dates before the current occurrence were both missed. */
  atRisk: boolean
  /** The latest scheduled date was kept after two or more missed ones. */
  backOnTrack: boolean
}

export interface DayCell {
  date: string
  state: DayState
  today: boolean
}

// ---- the Habits switch (habits-home D1) ----

/** The stored preference: '' not decided, 'on', 'off'; any other value reads as not decided and is kept. */
export type HabitsChoice = 'on' | 'off' | 'undecided'

export function habitsChoice(prefs: Partial<Pick<UserPrefs, 'habits'>> | null | undefined): HabitsChoice {
  const v = prefs?.habits
  return v === 'on' || v === 'off' ? v : 'undecided'
}

/**
 * Whether habits are shown (D1): on when the preference says so, or when it is not
 * decided and the device holds an open habit (an account that already has one keeps
 * everything without a write). Off, and not decided without a habit, show none.
 */
export function habitsEnabled(prefs: Partial<Pick<UserPrefs, 'habits'>> | null | undefined, hasOpenHabit: boolean): boolean {
  const choice = habitsChoice(prefs)
  return choice === 'on' || (choice === 'undecided' && hasOpenHabit)
}

/** An open, live habit series (graduated ones included): what makes a not-decided account on. */
export function isOpenHabit(task: Pick<Task, 'habit' | 'completed_at' | 'deleted_at' | 'series_id'>): boolean {
  return !!task.habit && !task.completed_at && !task.deleted_at && !task.series_id
}

/** Graduated (habits-home D7): in no list, projection, reminder or Today limit until resumed. */
export function isGraduated(task: Pick<Task, 'habit_graduated_at'>): boolean {
  return task.habit_graduated_at != null
}

// ---- day numbers ----

const DAY_MS = 86_400_000

function dayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

function isoOf(z: number): string {
  return new Date(z * DAY_MS).toISOString().slice(0, 10)
}

function civil(z: number): [number, number, number] {
  const d = new Date(z * DAY_MS)
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]
}

function monthLen(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
function isoWeekday(z: number): number {
  return ((((z % 7) + 7 + 3) % 7) + 1)
}

// ---- the schedule ----

/** True for a rule a habit can be measured against: a calendar rule, not `after completion`. */
export function isCalendarRule(rule: Rule | null | undefined): rule is Rule {
  return !!rule && !rule.afterCompletion
}

/** The calendar rule of a task, or null (no rule, invalid, or completion-relative). */
export function habitRule(task: Pick<Task, 'recurrence'>): Rule | null {
  if (!task.recurrence) return null
  const p = parseRule(task.recurrence)
  return p.ok && isCalendarRule(p.rule) ? p.rule : null
}

/**
 * Whether the rule schedules `date`. Predicate kinds match the date itself;
 * interval kinds are anchored at `dueDate` (the series' current occurrence) and
 * step by the interval in both directions, months clamped to the month's length
 * like the forward calculator.
 */
export function scheduled(rule: Rule, dueDate: string | null, date: string): boolean {
  const z = dayOf(date)
  const [y, m, d] = civil(z)
  if (rule.until && date > rule.until) return false
  switch (rule.kind) {
    case 'weekday':
      return (rule.days & (1 << isoWeekday(z))) !== 0
    case 'weekdays':
      // `every 2 weeks on saturday` is anchored at the due date's week, like an interval.
      if (rule.interval > 1 && !dueDate) return false
      return weeklyInPhase(rule, dueDate ? dayOf(dueDate) : z, z)
    case 'monthDay':
      return d === Math.min(rule.monthDay, monthLen(y, m))
    case 'lastDay':
      return d === monthLen(y, m)
    case 'workday': {
      if (isoWeekday(z) > 5) return false
      if (rule.ordinal < 0) {
        // No weekday follows z in its month.
        for (let k = d + 1; k <= monthLen(y, m); k++) if (isoWeekday(z + k - d) <= 5) return false
        return true
      }
      let n = 0
      for (let k = 1; k <= d; k++) if (isoWeekday(z - d + k) <= 5) n++
      return n === rule.ordinal
    }
    case 'nthWeekday': {
      if (isoWeekday(z) !== rule.weekday) return false
      if (rule.ordinal < 0) return d + 7 > monthLen(y, m)
      return Math.ceil(d / 7) === rule.ordinal
    }
    case 'interval': {
      if (!dueDate) return false
      const a = dayOf(dueDate)
      if (rule.unit === 'day' || rule.unit === 'week') {
        const size = rule.unit === 'week' ? 7 * rule.interval : rule.interval
        return (((z - a) % size) + size) % size === 0
      }
      const [ay, am, ad] = civil(a)
      const months = (y * 12 + m) - (ay * 12 + am)
      const step = rule.unit === 'year' ? 12 * rule.interval : rule.interval
      return months % step === 0 && d === Math.min(ad, monthLen(y, m))
    }
  }
}

/**
 * The occurrence records of a series by the date they stand for: done, skipped or
 * open (moved or edited, still to do). A record's date is its occurrence date,
 * even when it was moved to another day (series-exceptions); detached copies made
 * before records carried one are not records.
 */
export function recordsByDate(seriesId: string, tasks: Iterable<Task>): Map<string, RecordMark> {
  const out = new Map<string, RecordMark>()
  for (const task of tasks) {
    if (task.deleted_at || !isRecordOf(seriesId, task)) continue
    out.set(recordDate(task) as string, task.completed_at ? (task.skipped ? 'skipped' : task.tiny ? 'tiny' : 'done') : 'open')
  }
  return out
}

/** A record's mark: done, done as the tiny version (habits-home D5), skipped, or open. */
export type RecordMark = 'done' | 'tiny' | 'skipped' | 'open'

/** Done, tiny and skipped records; an open one is not (yet) a record of its day. */
const marks = (r: RecordMark | undefined): r is 'done' | 'tiny' | 'skipped' => r === 'done' || r === 'tiny' || r === 'skipped'
/** A kept day: done, or its tiny version, which counts as done everywhere. */
const kept = (r: RecordMark | undefined): boolean => r === 'done' || r === 'tiny'

/** Whether the habit's schedule (one series, or the pieces of a split lineage) has a date. */
type Schedule = (date: string) => boolean

/**
 * What a habit is measured against (series-split D5): its schedule and its records
 * by date. For a split lineage each piece's rule schedules the dates of its own
 * range, the records of every piece count, and an earlier piece that reached its
 * end counts its last occurrence as done (completing it wrote no record). Null when
 * the series has no calendar rule.
 */
function measureOf(series: Task, tasks: Iterable<Task>): Measure | null {
  const rule = habitRule(series)
  if (!rule) return null
  const list = [...tasks]
  const pieces = lineageOf(series, list)
  if (pieces.length === 1) {
    const dueDate = series.due?.date ?? null
    return { sched: (d) => scheduled(rule, dueDate, d), records: recordsByDate(series.id, list), pieceOf: () => series }
  }
  const records = new Map<string, RecordMark>()
  const parts = pieces.map((p, i) => {
    const end = pieceEnd(pieces, i)
    const last = p.task.due?.date
    for (const [d, m] of recordsByDate(p.task.id, list)) records.set(d, m)
    if (p.task.id !== series.id && p.task.completed_at && last && (!end || last <= end) && !records.has(last)) records.set(last, 'done')
    return { task: p.task, rule: habitRule(p.task), due: last ?? null, start: p.start, end }
  })
  const partOf = (d: string) => {
    let part = parts[0]
    for (const p of parts) if (!p.start || p.start <= d) part = p
    return part
  }
  const sched: Schedule = (d) => {
    const part = partOf(d)
    return !!part.rule && (!part.end || d <= part.end) && scheduled(part.rule, part.due, d)
  }
  return { sched, records, pieceOf: (d) => partOf(d).task }
}

interface Measure {
  sched: Schedule
  records: Map<string, RecordMark>
  /** The piece of the lineage whose range holds `date` (the series itself when it was never split). */
  pieceOf: (date: string) => Task
}

/** The first day of the habit's history: its earliest record, or the current occurrence. */
function firstDay(dueDate: string, records: Map<string, unknown>): string {
  let first = dueDate
  for (const d of records.keys()) if (d < first) first = d
  return first
}

/** A record proves its day was scheduled, even when the rule changed since. */
function isScheduled(sched: Schedule, records: Map<string, unknown>, date: string): boolean {
  return records.has(date) || sched(date)
}

/**
 * The latest scheduled date strictly before `before`, or null when the habit's
 * history (from its first record) has none.
 */
export function previousScheduled(rule: Rule, dueDate: string, before: string, records: Map<string, unknown>): string | null {
  return previousIn((d) => scheduled(rule, dueDate, d), dueDate, before, records)
}

function previousIn(sched: Schedule, dueDate: string, before: string, records: Map<string, unknown>): string | null {
  const first = dayOf(firstDay(dueDate, records))
  for (let z = dayOf(before) - 1; z >= first; z--) {
    const date = isoOf(z)
    if (isScheduled(sched, records, date)) return date
  }
  return null
}

/** Scheduled dates from the first record up to, not including, the current occurrence, oldest first. */
function pastSchedule(sched: Schedule, dueDate: string, records: Map<string, unknown>): string[] {
  const out: string[] = []
  const end = dayOf(dueDate)
  for (let z = dayOf(firstDay(dueDate, records)); z < end; z++) {
    const date = isoOf(z)
    if (isScheduled(sched, records, date)) out.push(date)
  }
  return out
}

/**
 * The rule's scheduled dates per day (habits-home D4): over the 364 days up to its
 * current occurrence, so a daily rule reads 1 and `every mon, wed, fri` 3/7.
 */
export function frequency(rule: Rule, dueDate: string): number {
  const end = dayOf(dueDate)
  let n = 0
  for (let z = end - 363; z <= end; z++) if (scheduled(rule, dueDate, isoOf(z))) n++
  return Math.max(n, 1) / 364
}

/** Strength's smoothing for `f` scheduled dates per day: the half-life of Loop Habit Tracker (D4). */
export function strengthAlpha(f: number): number {
  return 1 - Math.pow(0.5, Math.sqrt(f) / 13)
}

/**
 * Streak and the forgiving measure of a habit (habits-home D4). Null when the task
 * cannot be measured: no calendar rule or no current occurrence. A skipped record
 * keeps the chain without extending it; a scheduled day before the current
 * occurrence without a record ends it; the current occurrence is pending and never
 * breaks it. A tiny day counts as done. A split series is measured over its lineage
 * as one series (series-split D5).
 */
export function habitStats(series: Task, tasks: Iterable<Task>, today: string): HabitStats | null {
  const m = measureOf(series, tasks)
  const dueDate = series.due?.date
  if (!m || !dueDate) return null
  const { records } = m
  const past = pastSchedule(m.sched, dueDate, records)
  // Best: every maximal run of records, skipped days neither breaking nor counting.
  let best = 0
  let run = 0
  for (const date of past) {
    const r = records.get(date)
    if (!marks(r)) run = 0
    else if (kept(r)) best = Math.max(best, ++run)
  }
  // Current: the run that reaches the day before the current occurrence.
  let current = 0
  for (let i = past.length - 1; i >= 0; i--) {
    const r = records.get(past[i])
    if (!marks(r)) break
    if (kept(r)) current++
  }
  // A concurrent completion on another device can leave a record on the current day.
  const own = records.get(dueDate)
  if (kept(own)) current++
  best = Math.max(best, current)
  // Kept: the last seven scheduled dates before the current occurrence.
  const last = past.slice(-7)
  const keptN = last.filter((d) => kept(records.get(d))).length
  // Strength: skipped dates leave it as it is; the current day counts once kept.
  const a = strengthAlpha(frequency(habitRule(series)!, dueDate))
  let s = 0
  for (const date of kept(own) ? [...past, dueDate] : past) {
    const r = records.get(date)
    if (r === 'skipped') continue
    s = s * (1 - a) + a * (kept(r) ? 1 : 0)
  }
  const missed = (d: string | undefined) => d !== undefined && !marks(records.get(d))
  const n = past.length
  const atRisk = missed(past[n - 1]) && missed(past[n - 2])
  let gap = 0
  for (let i = n - 2; i >= 0 && missed(past[i]); i--) gap++
  const backOnTrack = n > 0 && kept(records.get(past[n - 1])) && gap >= 2
  return {
    current, best, pending: !marks(own), overdue: !marks(own) && dueDate < today,
    kept: keptN, keptOf: last.length, strength: Math.round(s * 100), atRisk, backOnTrack,
  }
}

/** Done and tiny days over the habit's lineage: "Kept for 94 days" (habits-home D7). */
export function keptDays(series: Task, tasks: Iterable<Task>): number {
  const m = measureOf(series, tasks)
  if (!m) return 0
  let n = 0
  for (const r of m.records.values()) if (kept(r)) n++
  return n
}

/**
 * Stats of every open, live habit in `tasks`, keyed by series id, computed once per
 * list from the rows it already holds (design D5): records are grouped by series
 * in one pass, so a list does not scan every task per row. A habit of a split
 * lineage reads the whole list (series-split D5).
 */
export function habitStatsMap(tasks: readonly Task[], today: string): Map<string, HabitStats> {
  const bySeries = new Map<string, Task[]>()
  const split = new Set<string>()
  for (const task of tasks) {
    if (task.split_from && !task.deleted_at) split.add(task.id).add(task.split_from.series)
    if (!task.series_id) continue
    const list = bySeries.get(task.series_id)
    if (list) list.push(task)
    else bySeries.set(task.series_id, [task])
  }
  const out = new Map<string, HabitStats>()
  for (const tk of tasks) {
    if (!tk.habit || tk.completed_at || tk.deleted_at) continue
    const stats = habitStats(tk, split.has(tk.id) ? tasks : bySeries.get(tk.id) ?? [], today)
    if (stats) out.set(tk.id, stats)
  }
  return out
}

/**
 * The rows each habit's numbers read, from one pass over `tasks` (as habitStatsMap):
 * a series' own records, or the whole list for a piece of a split lineage.
 */
export function habitRowsOf(tasks: readonly Task[]): (series: Task) => readonly Task[] {
  const bySeries = new Map<string, Task[]>()
  const split = new Set<string>()
  for (const task of tasks) {
    if (task.split_from && !task.deleted_at) split.add(task.id).add(task.split_from.series)
    if (!task.series_id) continue
    const list = bySeries.get(task.series_id)
    if (list) list.push(task)
    else bySeries.set(task.series_id, [task])
  }
  return (series) => (split.has(series.id) ? tasks : bySeries.get(series.id) ?? [])
}

/** Whether a later piece continues `series` (it was resumed): only the newest piece of a lineage is listed. */
export function continuedIds(tasks: readonly Task[]): Set<string> {
  const out = new Set<string>()
  for (const task of tasks) if (task.split_from && !task.deleted_at) out.add(task.split_from.series)
  return out
}

/** A row a habit's streak reads: a habit, an occurrence record of a series, or part of a split lineage. */
const habitRow = (t: Task | undefined) => !!t && (!!t.habit || !!t.series_id || !!t.split_from)

/**
 * habitStatsMap after `changes` (incremental-list-updates D2): the same map when no
 * changed row is one a streak reads; null (worked out in full) otherwise.
 */
export function patchHabitStats(prev: Map<string, HabitStats>, changes: readonly TaskChange[]): Map<string, HabitStats> | null {
  for (const c of changes) if (habitRow(c.before) || habitRow(c.after)) return null
  return prev
}

/** The streak chip's accessible name: "12-day streak", with "at risk" when the day has passed. */
export function streakLabel(stats: HabitStats): string {
  return stats.overdue ? t('{n}-day streak, at risk', { n: stats.current }) : t('{n}-day streak', { n: stats.current })
}

/**
 * The days of one month (`month` 1–12) with their state. Records decide done, tiny
 * and skipped; the current occurrence is pending; a scheduled day before it with no
 * record is missed, a later one upcoming; anything else, and every day before the
 * habit's first record, is blank. A split series shows its lineage.
 */
export function monthGrid(series: Task, tasks: Iterable<Task>, year: number, month: number, today: string): DayCell[] {
  const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-`
  return habitDays(series, tasks, `${prefix}01`, prefix + String(monthLen(year, month)).padStart(2, '0'), today)
}

/** The days from `from` to `to` (inclusive) with their state, as in monthGrid: the thread's seven days (habits-home D8). */
export function habitDays(series: Task, tasks: Iterable<Task>, from: string, to: string, today: string): DayCell[] {
  const m = measureOf(series, tasks)
  const dueDate = series.due?.date ?? null
  const records = m?.records ?? recordsByDate(series.id, tasks)
  const first = dueDate ? firstDay(dueDate, records) : null
  const out: DayCell[] = []
  for (let z = dayOf(from); z <= dayOf(to); z++) {
    const date = isoOf(z)
    out.push({ date, state: dayState(m?.sched ?? null, dueDate, first, records, date), today: date === today })
  }
  return out
}

/** The thread's days: the seven days ending on `today`. */
export function threadDays(series: Task, tasks: Iterable<Task>, today: string): DayCell[] {
  return habitDays(series, tasks, isoOf(dayOf(today) - 6), today, today)
}

/**
 * Whether a day can be set to Done, Tiny, Skipped or Cleared (habits-home D6): a
 * scheduled day of the habit's history before its current occurrence, up to the
 * logical today. Later days and days before its first scheduled date cannot.
 */
export function editableDay(cell: Pick<DayCell, 'date' | 'state'>, today: string): boolean {
  return cell.date <= today && (cell.state === 'done' || cell.state === 'tiny' || cell.state === 'skipped' || cell.state === 'missed')
}

/** The piece of the habit's lineage a record of `date` belongs to (the series when it was never split). */
export function pieceFor(series: Task, tasks: Iterable<Task>, date: string): Task {
  return measureOf(series, tasks)?.pieceOf(date) ?? series
}

function dayState(sched: Schedule | null, dueDate: string | null, first: string | null, records: Map<string, RecordMark>, date: string): DayState {
  const r = records.get(date)
  // An open record is pending until it is done or skipped, missed once the series is past it.
  if (r === 'open') return dueDate && date < dueDate ? 'missed' : 'pending'
  if (r) return r
  if (!sched || !dueDate || !first) return 'blank'
  if (date === dueDate) return 'pending'
  if (date < first || !sched(date)) return 'blank'
  return date < dueDate ? 'missed' : 'upcoming'
}
