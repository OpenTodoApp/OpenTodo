// The calendar's Plan mode math (OpenSpec change planner-view, design D5): pure
// functions over local rows. The span's dates, the rows of a column, the projected
// occurrences of recurring tasks and the load of a day from three sources (task
// estimates, busy calendar events, projections). Nothing here is ever written:
// every device with the same rows draws the same plan.
import { addDaysISO, daysBetweenISO, localDueOf } from './dates'
import { eventMinutes } from './calendar'
import { formatMinutes } from './duration'
import { t } from './i18n'
import { seriesRule } from './recurring'
import type { Projection } from './occurrences'
import type { CalendarEvent, Project, Task } from './types'

// The walk lives in occurrences.ts since series-occurrences (design D2): Plan is one of its consumers.
export { MAX_PROJECTIONS, projectedOccurrences, type Projection } from './occurrences'

// The one definition of event minutes lives in calendar.ts (meeting-aware-capacity D1).
export { eventMinutes }

export type PlanSpan = 7 | 14 | 21
export const PLAN_SPANS: readonly PlanSpan[] = [7, 14, 21]
export const DEFAULT_PLAN_DAYS: PlanSpan = 14

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

/** Open, live recurring tasks with a date, leaving out archived projects (the calendar's selection without the range). */
export function planSeries(tasks: readonly Task[], projects: readonly Pick<Project, 'id' | 'archived'>[]): Task[] {
  const archived = new Set(projects.filter((p) => p.archived).map((p) => p.id))
  return tasks.filter((task) => task.due && !(task.project_id && archived.has(task.project_id)) && seriesRule(task) !== null)
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

/**
 * The load of `date` against the day length, from the three sources; `slots` is
 * what the day's calendar slots change (calendar-slots D6, lib/slots `slotCapacity`).
 */
export function planLoad(tasks: readonly Task[], projections: readonly Projection[], events: readonly CalendarEvent[], date: string, dayLength: number, zone?: string, slots = { extra: 0, covered: 0 }): PlanLoad {
  let taskMinutes = slots.extra, projected = 0, unestimated = -slots.covered
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
  unestimated = Math.max(0, unestimated)
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
