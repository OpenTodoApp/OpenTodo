// The Statistics dashboard (OpenSpec change stats-dashboard, design D3, D4, D8):
// one pass over the counted rows and the user's own time entries builds per-day
// buckets for the whole window the dashboard can show (53 weeks for the heatmap,
// back to the start of the previous year for the year's comparison); every period
// is then a slice of those buckets, so changing the period never re-reads rows.
// Pure: no request, no write. Counting follows lib/stats.ts ("what is counted",
// "excluded rows", "whose tasks count in shared projects").
import { resolveRange, shiftISO, weekdayOf } from './filter/parse'
import { currentDayStart, logicalDay } from './dates'
import { minutesOf, type EntryLike } from './time'
import { countedTasks, monthStartOf, type Period, type StatsInput } from './stats'
import type { Task } from './types'
import { t } from './i18n'

type DashTask = Pick<Task, 'id' | 'title' | 'project_id' | 'created_at' | 'completed_at' | 'deleted_at' | 'due' | 'series_id' | 'assignee_id' | 'estimate_minutes' | 'labels'>
  & Partial<Pick<Task, 'skipped' | 'completed_by'>>

export interface DashboardInput<T extends DashTask = Task> extends StatsInput<T> {
  labels?: readonly { id: string; name: string }[]
  /** First day of the week, 0 = Sunday. */
  weekStart: number
  /** The day start in minutes after midnight (day-boundary); the device's by default. */
  dayStart?: number
  /** The local clock hour of an instant; the device's zone by default. */
  hourOf?: (ms: number) => number
}

interface Day {
  done: number
  created: number
  /** Completions whose task had a due date, and those of them on or before it. */
  dated: number
  onTime: number
  /** Completions per local clock hour. */
  hours: number[]
  /** Completions per project ('' = Inbox). */
  projects: Map<string, number>
  /** Own tracked minutes, in total and per project. */
  minutes: number
  tracked: Map<string, number>
}

interface Done<T> {
  day: string
  task: T
}

interface Tracked {
  day: string
  taskId: string
  minutes: number
}

export interface DashboardModel<T extends DashTask = Task> {
  today: string
  weekStart: number
  dayStart: number
  first: string
  days: Map<string, Day>
  /** Completed tasks with an estimate, for the estimates panel. */
  estimated: Done<T>[]
  entries: Tracked[]
  /** The user's own tracked minutes per task, all time. */
  minutesByTask: Map<string, number>
  tasks: Map<string, T>
  projectNames: Map<string, string>
  labelNames: Map<string, string>
}

const emptyDay = (): Day => ({ done: 0, created: 0, dated: 0, onTime: 0, hours: new Array(24).fill(0), projects: new Map(), minutes: 0, tracked: new Map() })
const add = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n)

/** The first day of the 53-week heatmap: its first column starts on the first day of the week. */
export function heatmapStart(today: string, weekStart: number): string {
  return shiftISO(resolveRange({ type: 'period', unit: 'week', offset: 0 }, today, weekStart).start, -52 * 7)
}

/** One pass over the rows (design D8). */
export function buildModel<T extends DashTask>(input: DashboardInput<T>): DashboardModel<T> {
  const dayStart = input.dayStart ?? currentDayStart()
  const dayOf = input.dayOf ?? ((ms: number) => logicalDay(ms, dayStart))
  const hourOf = input.hourOf ?? ((ms: number) => new Date(ms).getHours())
  const { today, weekStart } = input
  const heat = heatmapStart(today, weekStart)
  const prevYear = `${Number(today.slice(0, 4)) - 1}-01-01`
  const first = heat < prevYear ? heat : prevYear
  const days = new Map<string, Day>()
  const dayAt = (d: string) => { let x = days.get(d); if (!x) { x = emptyDay(); days.set(d, x) } return x }
  const inWindow = (d: string) => d >= first && d <= today
  const estimated: Done<T>[] = []
  const counted = countedTasks(input)
  for (const item of counted) {
    if (item.completed_at !== null) {
      const day = dayOf(item.completed_at)
      if (inWindow(day)) {
        const x = dayAt(day)
        x.done++
        x.hours[hourOf(item.completed_at)]++
        add(x.projects, item.project_id ?? '')
        if (item.due) {
          x.dated++
          if (day <= item.due.date) x.onTime++
        }
        if ((item.estimate_minutes ?? 0) > 0) estimated.push({ day, task: item })
      }
    }
    if (item.series_id === null) {
      const day = dayOf(item.created_at)
      if (inWindow(day)) dayAt(day).created++
    }
  }
  // Own entries on live tasks (time-tracking D3), counted whole on the day they started.
  const now = input.now ?? Date.now()
  const trashed = new Set(input.projects.filter((p) => p.deleted_at).map((p) => p.id))
  const live = new Map(input.tasks.filter((x) => !x.deleted_at && !(x.project_id && trashed.has(x.project_id))).map((x) => [x.id, x]))
  const entries: Tracked[] = []
  const minutesByTask = new Map<string, number>()
  for (const e of (input.entries ?? []) as readonly EntryLike[]) {
    const task = live.get(e.task_id)
    if (e.deleted_at || e.user_id !== input.me || !task) continue
    const m = minutesOf(e, now)
    add(minutesByTask, task.id, m)
    const day = dayOf(e.started_at)
    if (!inWindow(day)) continue
    const x = dayAt(day)
    x.minutes += m
    add(x.tracked, task.project_id ?? '', m)
    entries.push({ day, taskId: task.id, minutes: m })
  }
  return {
    today, weekStart, dayStart, first, days, estimated, entries, minutesByTask, tasks: live,
    projectNames: new Map(input.projects.map((p) => [p.id, p.name])),
    labelNames: new Map((input.labels ?? []).map((l) => [l.id, l.name])),
  }
}

// ---------------------------------------------------------------- slicing

export interface Range {
  start: string
  end: string
}

function eachDay(r: Range, fn: (day: string) => void): void {
  for (let d = r.start; d <= r.end; d = shiftISO(d, 1)) fn(d)
}

function sum(m: { days: Map<string, Day> }, r: Range, pick: (x: Day) => number): number {
  let n = 0
  eachDay(r, (d) => { const x = m.days.get(d); if (x) n += pick(x) })
  return n
}

export interface Tiles {
  done: { value: number; previous: number }
  /** Whole percent; null when nothing completed in the period had a due date. */
  onTime: { value: number | null; previous: number | null; dated: number }
  streak: { current: number; best: number }
  tracked: { minutes: number; previous: number; estimate: number; noEstimate: number; tasks: number }
}

const percent = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 100))

/** The tracked minutes of a range, and the estimates of the tasks they were tracked on, each task once (D4). */
function trackedIn<T extends DashTask>(m: DashboardModel<T>, r: Range) {
  const ids = new Set<string>()
  let minutes = 0
  for (const e of m.entries) {
    if (e.day < r.start || e.day > r.end) continue
    minutes += e.minutes
    ids.add(e.taskId)
  }
  let estimate = 0
  let noEstimate = 0
  for (const id of ids) {
    const est = m.tasks.get(id)?.estimate_minutes ?? 0
    if (est > 0) estimate += est
    else noEstimate++
  }
  return { minutes, estimate, noEstimate, tasks: ids.size }
}

/**
 * Consecutive logical days with a completion, ending today, or yesterday while
 * today has none yet; and the longest run in the heatmap's 53 weeks (D4).
 */
export function streakOf<T extends DashTask>(m: DashboardModel<T>): { current: number; best: number } {
  const has = (d: string) => (m.days.get(d)?.done ?? 0) > 0
  let day = has(m.today) ? m.today : shiftISO(m.today, -1)
  let current = 0
  while (day >= m.first && has(day)) { current++; day = shiftISO(day, -1) }
  let best = 0
  let run = 0
  eachDay({ start: heatmapStart(m.today, m.weekStart), end: m.today }, (d) => {
    run = has(d) ? run + 1 : 0
    if (run > best) best = run
  })
  return { current, best }
}

export function tilesOf<T extends DashTask>(m: DashboardModel<T>, period: Range, previous: Range): Tiles {
  const dated = sum(m, period, (x) => x.dated)
  const prevDated = sum(m, previous, (x) => x.dated)
  const tracked = trackedIn(m, period)
  return {
    done: { value: sum(m, period, (x) => x.done), previous: sum(m, previous, (x) => x.done) },
    onTime: { value: percent(sum(m, period, (x) => x.onTime), dated), previous: percent(sum(m, previous, (x) => x.onTime), prevDated), dated },
    streak: streakOf(m),
    tracked: { ...tracked, previous: trackedIn(m, previous).minutes },
  }
}

export interface Bucket {
  /** The bucket's first day. */
  start: string
  end: string
  done: number
  created: number
}

/** "Keeping up": completions and creations per day, week or month of the period (D3). */
export function keepingUpOf<T extends DashTask>(m: DashboardModel<T>, p: Pick<Period, 'start' | 'end' | 'unit'>): Bucket[] {
  const out: Bucket[] = []
  let start = p.start
  while (start <= p.end) {
    const next = p.unit === 'day' ? shiftISO(start, 1) : p.unit === 'week' ? shiftISO(start, 7) : monthStartOf(start, 1)
    const last = shiftISO(next, -1)
    const end = last < p.end ? last : p.end
    out.push({ start, end, done: sum(m, { start, end }, (x) => x.done), created: sum(m, { start, end }, (x) => x.created) })
    start = next
  }
  return out
}

export interface Share {
  /** The project id, '' for the Inbox, 'other' for the rest. */
  id: string
  name: string
  value: number
}

/** Five with most, then "other", in descending order. */
function topFive(totals: Map<string, number>, names: Map<string, string>): Share[] {
  const ranked = [...totals.entries()].filter(([, v]) => v > 0)
    .map(([id, value]) => ({ id, name: id ? names.get(id) ?? t('Project') : t('Inbox'), value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
  const top = ranked.slice(0, 5)
  const rest = ranked.slice(5).reduce((n, x) => n + x.value, 0)
  if (rest > 0) top.push({ id: 'other', name: t('Other'), value: rest })
  return top
}

/** "Where time goes": tracked minutes per project, or completions per project when nothing was tracked. */
export function timeOf<T extends DashTask>(m: DashboardModel<T>, r: Range): { kind: 'tracked' | 'completed'; rows: Share[] } {
  const tracked = new Map<string, number>()
  const done = new Map<string, number>()
  eachDay(r, (d) => {
    const x = m.days.get(d)
    if (!x) return
    for (const [k, v] of x.tracked) add(tracked, k, v)
    for (const [k, v] of x.projects) add(done, k, v)
  })
  const rows = topFive(tracked, m.projectNames)
  return rows.length > 0 ? { kind: 'tracked', rows } : { kind: 'completed', rows: topFive(done, m.projectNames) }
}

export interface HeatCell {
  date: string
  count: number
  /** 0 for no completion, 1–4 by quartile of the days with completions. */
  level: number
}

export interface Heatmap {
  /** Columns of seven days from the first day of the week; days after today are null. */
  weeks: (HeatCell | null)[][]
  total: number
  busiest: HeatCell | null
  /** The smallest count of each level 1–4. */
  thresholds: number[]
}

/** "A year of done tasks": 53 weeks ending today, whatever the period (D4). */
export function heatmapOf<T extends DashTask>(m: DashboardModel<T>): Heatmap {
  const start = heatmapStart(m.today, m.weekStart)
  const counts: number[] = []
  eachDay({ start, end: m.today }, (d) => { const n = m.days.get(d)?.done ?? 0; if (n > 0) counts.push(n) })
  counts.sort((a, b) => a - b)
  const q = (f: number) => counts[Math.min(counts.length - 1, Math.floor(f * counts.length))] ?? 1
  // Distinct, increasing thresholds: a sparse year may use fewer than four levels.
  const thresholds = [1, q(0.25), q(0.5), q(0.75)].map((v, i, a) => (i > 0 && v <= a[i - 1] ? a[i - 1] + 1 : v))
  const level = (n: number) => (n === 0 ? 0 : thresholds.reduce((l, th, i) => (n >= th ? i + 1 : l), 1))
  const weeks: (HeatCell | null)[][] = []
  let total = 0
  let busiest: HeatCell | null = null
  for (let w = 0; w < 53; w++) {
    const col: (HeatCell | null)[] = []
    for (let i = 0; i < 7; i++) {
      const date = shiftISO(start, w * 7 + i)
      if (date > m.today) { col.push(null); continue }
      const count = m.days.get(date)?.done ?? 0
      const cell = { date, count, level: level(count) }
      total += count
      if (count > 0 && (!busiest || count > busiest.count)) busiest = cell
      col.push(cell)
    }
    weeks.push(col)
  }
  return { weeks, total, busiest, thresholds }
}

export interface HourGrid {
  /** Weekdays (0 = Sunday) from the first day of the week. */
  weekdays: number[]
  /** Clock hours from the day start's hour. */
  hours: number[]
  /** counts[row][col], in the order above. */
  counts: number[][]
  max: number
  total: number
}

/** "When you get things done": completions by logical weekday and local clock hour (D4). */
export function hoursOf<T extends DashTask>(m: DashboardModel<T>, r: Range): HourGrid {
  const weekdays = Array.from({ length: 7 }, (_, i) => (m.weekStart + i) % 7)
  const from = Math.floor(m.dayStart / 60)
  const hours = Array.from({ length: 24 }, (_, i) => (from + i) % 24)
  const counts = weekdays.map(() => new Array(24).fill(0) as number[])
  let max = 0
  let total = 0
  eachDay(r, (d) => {
    const x = m.days.get(d)
    if (!x || x.done === 0) return
    const row = weekdays.indexOf(weekdayOf(d))
    hours.forEach((h, col) => {
      const n = x.hours[h]
      if (n === 0) return
      counts[row][col] += n
      total += n
      if (counts[row][col] > max) max = counts[row][col]
    })
  })
  return { weekdays, hours, counts, max, total }
}

export interface EstimateGroup {
  kind: 'project' | 'label'
  name: string
  median: number
  count: number
}

export type Estimates = { ok: true; median: number; count: number; groups: EstimateGroup[] } | { ok: false; count: number }

/** The fewest tasks the estimates panel and each of its groups need (D4). */
export const ESTIMATE_MIN_TASKS = 3
/** Own tracked minutes a task needs to say anything about its estimate. */
export const ESTIMATE_MIN_MINUTES = 5

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** "Estimates": median tracked ÷ estimate, and the projects or labels furthest from 1 (D4). */
export function estimatesOf<T extends DashTask>(m: DashboardModel<T>, r: Range): Estimates {
  const ratios: { ratio: number; task: T }[] = []
  for (const { day, task } of m.estimated) {
    if (day < r.start || day > r.end) continue
    const minutes = m.minutesByTask.get(task.id) ?? 0
    if (minutes < ESTIMATE_MIN_MINUTES) continue
    ratios.push({ ratio: minutes / (task.estimate_minutes as number), task })
  }
  if (ratios.length < ESTIMATE_MIN_TASKS) return { ok: false, count: ratios.length }
  const groups = new Map<string, { kind: EstimateGroup['kind']; name: string; values: number[] }>()
  const put = (key: string, kind: EstimateGroup['kind'], name: string, v: number) => {
    const g = groups.get(key) ?? { kind, name, values: [] }
    g.values.push(v)
    groups.set(key, g)
  }
  for (const { ratio, task } of ratios) {
    const pid = task.project_id ?? ''
    put(`p:${pid}`, 'project', pid ? m.projectNames.get(pid) ?? t('Project') : t('Inbox'), ratio)
    for (const id of task.labels ?? []) {
      const name = m.labelNames.get(id)
      if (name) put(`l:${id}`, 'label', name, ratio)
    }
  }
  const ranked = [...groups.values()].filter((g) => g.values.length >= ESTIMATE_MIN_TASKS)
    .map((g) => ({ kind: g.kind, name: g.name, median: median(g.values), count: g.values.length }))
    .sort((a, b) => Math.abs(Math.log(b.median)) - Math.abs(Math.log(a.median)) || a.name.localeCompare(b.name))
  return { ok: true, median: median(ratios.map((x) => x.ratio)), count: ratios.length, groups: ranked.slice(0, 3) }
}

export interface Dashboard {
  tiles: Tiles
  keepingUp: Bucket[]
  time: ReturnType<typeof timeOf>
  heatmap: Heatmap
  hours: HourGrid
  estimates: Estimates
}

/** Every panel of a period from the model: slicing only, no row is read again. */
export function dashboardOf<T extends DashTask>(m: DashboardModel<T>, p: Period, previous: Range): Dashboard {
  return {
    tiles: tilesOf(m, p, previous),
    keepingUp: keepingUpOf(m, p),
    time: timeOf(m, p),
    heatmap: heatmapOf(m),
    hours: hoursOf(m, p),
    estimates: estimatesOf(m, p),
  }
}
