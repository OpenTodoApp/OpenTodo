// The calendar's Plan mode math (OpenSpec change planner-view, design D5): pure
// functions over local rows. The span's dates, the rows of a column, the projected
// occurrences of recurring tasks and the load of a day from three sources (task
// estimates, busy calendar events, projections). Nothing here is ever written:
// every device with the same rows draws the same plan.
import { addDaysISO, daysBetweenISO, localDueOf } from './dates'
import { DAY_MINUTES, eventBlocks } from './calendar'
import { formatMinutes } from './duration'
import { t } from './i18n'
import { followingOccurrence } from './recurrence'
import { completedOccurrences, seriesRule } from './recurring'
import type { CalendarEvent, Due, Project, Task } from './types'

export type PlanSpan = 7 | 14 | 21
export const PLAN_SPANS: readonly PlanSpan[] = [7, 14, 21]
export const DEFAULT_PLAN_DAYS: PlanSpan = 14
/** Projections drawn per series at most (design D5's guard). */
export const MAX_PROJECTIONS = 31

/** `days` consecutive ISO dates starting on `anchor`. */
export function spanDates(anchor: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDaysISO(anchor, i))
}

/**
 * The anchor that brings `date` into the span `[anchor, anchor + days)`: the same
 * anchor when it is shown, else moved by whole weeks so the row layout does not jump.
 */
export function followAnchor(anchor: string, days: number, date: string): string {
  const offset = daysBetweenISO(anchor, date)
  if (offset >= 0 && offset < days) return anchor
  const weeks = offset < 0 ? -Math.ceil(-offset / 7) : Math.floor((offset - days) / 7) + 1
  return addDaysISO(anchor, weeks * 7)
}

/** A future occurrence of a recurring task, derived and read-only. */
export interface Projection {
  id: string
  seriesId: string
  /** The day it falls on in the viewer's zone. */
  date: string
  time?: string
  title: string
  estimate_minutes: number | null
  priority: number
  position: number
  project_id: string | null
}

/** Open, live recurring tasks with a date, leaving out archived projects (the calendar's selection without the range). */
export function planSeries(tasks: readonly Task[], projects: readonly Pick<Project, 'id' | 'archived'>[]): Task[] {
  const archived = new Set(projects.filter((p) => p.archived).map((p) => p.id))
  return tasks.filter((task) => task.due && !(task.project_id && archived.has(task.project_id)) && seriesRule(task) !== null)
}

/**
 * The occurrences that would follow each series' current one inside [from, to]
 * (viewer's days), computed with the shared calculator: calendar rules as if each
 * occurrence were completed on time, completion-relative rules as if each were
 * completed on its day (the first one not before today), `done` counting the
 * series' completed records so a `for N times` end stops the walk.
 */
export function projectedOccurrences(series: readonly Task[], allTasks: readonly Task[], today: string, from: string, to: string, zone?: string): Projection[] {
  const out: Projection[] = []
  for (const task of series) {
    const rule = seriesRule(task)
    if (!rule || !task.due) continue
    const done = completedOccurrences(task.id, allTasks)
    let cur = task.due.date
    // The walk reaches `from` first; the guard stops a runaway rule after that.
    const limit = MAX_PROJECTIONS + Math.max(0, Math.min(3700, daysBetweenISO(cur, from)))
    let drawn = 0
    for (let k = 0; k < limit && drawn < MAX_PROJECTIONS; k++) {
      const completedOn = rule.afterCompletion ? (k === 0 && cur < today ? today : cur) : today
      const next = followingOccurrence(rule, cur, today, completedOn, done + k)
      if (next === null || next <= cur) break
      const due: Due = task.due.time ? { date: next, time: task.due.time, ...(task.due.tz ? { tz: task.due.tz } : {}) } : { date: next }
      const seen = localDueOf(due, zone)
      if (seen.date > to) break
      if (seen.date >= from) {
        out.push({
          id: `proj:${task.id}:${next}`, seriesId: task.id, date: seen.date, ...(seen.time ? { time: seen.time } : {}),
          title: task.title, estimate_minutes: task.estimate_minutes, priority: task.priority, position: task.position, project_id: task.project_id,
        })
        drawn++
      }
      cur = next
    }
  }
  return out
}

/** One row of a column: a task or a projection, in the column's order. */
export type PlanEntry = { kind: 'task'; task: Task; time?: string } | { kind: 'projected'; projection: Projection; time?: string }

/**
 * A column's rows: the day's tasks (in the viewer's zone) and projections together,
 * timed first by time, then by priority, then by position, as the Month cell orders.
 */
export function columnEntries(tasks: readonly Task[], projections: readonly Projection[], date: string, zone?: string): PlanEntry[] {
  const out: (PlanEntry & { priority: number; position: number })[] = []
  for (const task of tasks) {
    const due = localDueOf(task.due, zone)
    if (due?.date === date) out.push({ kind: 'task', task, time: due.time, priority: task.priority, position: task.position })
  }
  for (const p of projections) if (p.date === date) out.push({ kind: 'projected', projection: p, time: p.time, priority: p.priority, position: p.position })
  out.sort((a, b) => {
    if (!!a.time !== !!b.time) return a.time ? -1 : 1
    if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.position - b.position
  })
  return out.map(({ priority: _p, position: _q, ...entry }) => entry as PlanEntry)
}

/**
 * Busy minutes of `date` in the viewer's zone: timed, non-free events clipped to
 * the day, overlapping intervals counted once. All-day and free events count zero.
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

export interface PlanLoad {
  /** Estimates of the day's open tasks. */
  tasks: number
  /** Busy event minutes of the day. */
  events: number
  /** Estimates of the day's projected occurrences. */
  projected: number
  /** Tasks and projections of the day without an estimate (counted as 0). */
  unestimated: number
  total: number
  over: boolean
}

/** The load of `date` against the day length, from the three sources. */
export function planLoad(tasks: readonly Task[], projections: readonly Projection[], events: readonly CalendarEvent[], date: string, dayLength: number, zone?: string): PlanLoad {
  let taskMinutes = 0, projected = 0, unestimated = 0
  for (const task of tasks) {
    if (task.completed_at || task.deleted_at || localDueOf(task.due, zone)?.date !== date) continue
    if (task.estimate_minutes) taskMinutes += task.estimate_minutes
    else unestimated++
  }
  for (const p of projections) {
    if (p.date !== date) continue
    if (p.estimate_minutes) projected += p.estimate_minutes
    else unestimated++
  }
  const ev = eventMinutes(events, date, zone)
  const total = taskMinutes + ev + projected
  return { tasks: taskMinutes, events: ev, projected, unestimated, total, over: total > dayLength }
}

/** `5h 5m / 8h`. */
export function formatPlanLoad(load: PlanLoad, dayLength: number): string {
  return `${formatMinutes(load.total)} / ${formatMinutes(dayLength)}`
}

/** "2h 50m of tasks, 1h 30m in calendar events, 45m repeating · 5 tasks without estimate". */
export function planLoadTooltip(load: PlanLoad, dayLength: number): string {
  const parts = [
    load.tasks ? t('{minutes} of tasks', { minutes: formatMinutes(load.tasks) }) : '',
    load.events ? t('{minutes} in calendar events', { minutes: formatMinutes(load.events) }) : '',
    load.projected ? t('{minutes} repeating', { minutes: formatMinutes(load.projected) }) : '',
  ].filter(Boolean)
  const head = parts.length ? parts.join(', ') : t('Nothing estimated against a {minutes} day', { minutes: formatMinutes(dayLength) })
  const tail = load.unestimated ? ` · ${t('{n, plural, one {# task} other {# tasks}} without estimate', { n: load.unestimated })}` : ''
  return `${load.over ? `${t('Over capacity.')} ` : ''}${head}${tail}`
}
