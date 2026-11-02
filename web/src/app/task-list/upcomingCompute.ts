// Upcoming's projected days (OpenSpec change series-occurrences, design D4), loaded
// only once "Show repeating occurrences" is on: the projections of the 14 days after
// today for the series Upcoming's filters keep, joined to their day groups.
import { addDaysISO, formatDate, formatDateHeading, type ResolvedDateTime } from '../../lib/dates'
import { durationPredicate, type DurationFilter } from '../../lib/filters'
import { t } from '../../lib/i18n'
import type { ListGroup } from '../../lib/listGroups'
import { projectedOccurrences, type Projection } from '../../lib/occurrences'
import { planSeries } from '../../lib/plan'
import type { Project, Task } from '../../lib/types'
import { UPCOMING_PROJECTION_DAYS } from '../calendar/projectionSwitches'

export interface UpcomingInput {
  allTasks: readonly Task[]
  projects: readonly Pick<Project, 'id' | 'archived'>[]
  today: string
  zone?: string
  duration: DurationFilter | null
  queryTest: ((task: Task) => boolean) | null
  resolved: ResolvedDateTime
}

/** A day group's key (YYYY-MM-DD); Today's own groups have names (earlier, today, evening, …). */
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Each day's projections join its group, a day with projections only gets its own
 * heading, and the last such day carries the note naming the date they are shown up to.
 * Upcoming's groups are keyed by date, so the date order is the key order.
 */
export function withProjectedDays(groups: readonly ListGroup[], projections: readonly Projection[], heading: (date: string) => string, until: string): ListGroup[] {
  if (projections.length === 0) return groups as ListGroup[]
  const byDate = new Map<string, Projection[]>()
  for (const pr of projections) byDate.set(pr.date, [...(byDate.get(pr.date) ?? []), pr])
  // Today's own groups (Start with Today, upcoming-start-with-today D2) lead and keep their order; projections start tomorrow.
  const lead = groups.filter((g) => !DATE_KEY.test(g.key))
  const out = groups.filter((g) => DATE_KEY.test(g.key)).map((g) => (byDate.has(g.key) ? { ...g, projected: byDate.get(g.key) } : g))
  for (const [date, list] of byDate) if (!groups.some((g) => g.key === date)) out.push({ key: date, heading: heading(date), rows: [], projected: list })
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  out.unshift(...lead)
  const last = [...byDate.keys()].sort().at(-1)!
  return out.map((g) => (g.key === last ? { ...g, projectedNote: t('Repeating tasks shown up to {date}', { date: until }) } : g))
}

/** Upcoming's groups with the projections of the 14 days after today (today's occurrence is the series row itself). */
export function upcomingWithProjections(groups: readonly ListGroup[], { allTasks, projects, today, zone, duration, queryTest, resolved }: UpcomingInput): ListGroup[] {
  const byDuration = duration ? durationPredicate(duration) : null
  const series = planSeries(allTasks, projects).filter((task) => (!byDuration || byDuration(task)) && (!queryTest || queryTest(task)))
  const from = addDaysISO(today, 1), to = addDaysISO(today, UPCOMING_PROJECTION_DAYS)
  const projections = projectedOccurrences(series, allTasks, today, from, to, zone)
  return withProjectedDays(groups, projections, (date) => formatDateHeading(date, today, resolved), formatDate(to, 'full', resolved, today))
}
