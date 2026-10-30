// A review interval per project and the Maintenance status (OpenSpec change
// project-review-cadence, design D1 to D3). The interval is personal
// (`project_prefs.review_every`), the status is shared (`project.status`). Both
// are kept as received: an empty, missing or unknown value reads as the default
// and is never rewritten. Pure functions; nothing here writes.
import { addMonths } from './nlp/dates'
import { addDaysISO, logicalDay } from './dates'
import { msg, translatedMap } from './i18n'
import type { Project } from './types'

export type ReviewEvery = 'week' | '2weeks' | 'month' | 'quarter' | 'paused'
export const REVIEW_EVERY: readonly ReviewEvery[] = ['week', '2weeks', 'month', 'quarter', 'paused']

/** The interval's name on the walk card and in the menu. */
export const REVIEW_EVERY_NAMES = translatedMap<ReviewEvery>({
  week: msg('Every week'), '2weeks': msg('Every 2 weeks'), month: msg('Every month'), quarter: msg('Every quarter'), paused: msg('Paused'),
})

/** A stored interval: empty, missing or unknown values read as weekly. */
export function reviewEveryOf(v: string | null | undefined): ReviewEvery {
  return (REVIEW_EVERY as readonly string[]).includes(v ?? '') ? (v as ReviewEvery) : 'week'
}

/**
 * The logical date from which a project reviewed at `reviewedAt` is due again
 * (design D3): the logical day of the stamp plus 7 or 14 days, or one or three
 * calendar months clamped to the month's last day. Null when paused or never reviewed.
 */
export function reviewDate(reviewedAt: number, every: ReviewEvery, dayStart: number): string | null {
  if (every === 'paused' || !reviewedAt) return null
  const day = logicalDay(reviewedAt, dayStart)
  switch (every) {
    case 'week': return addDaysISO(day, 7)
    case '2weeks': return addDaysISO(day, 14)
    case 'month': return addMonths(day, 1)
    case 'quarter': return addMonths(day, 3)
  }
}

/** Due for review (weekly-review "Review interval per project"): never reviewed, or on or after the review date; paused never. */
export function reviewIsDue(reviewedAt: number, every: ReviewEvery, today: string, dayStart: number): boolean {
  if (every === 'paused') return false
  if (!reviewedAt) return true
  return today >= reviewDate(reviewedAt, every, dayStart)!
}

export type ProjectStatus = 'active' | 'maintenance'

/** A project's status: empty, missing or unknown values read as active. */
export function projectStatusOf(p: Pick<Project, 'status'> | null | undefined): ProjectStatus {
  return p?.status === 'maintenance' ? 'maintenance' : 'active'
}

export const inMaintenance = (p: Pick<Project, 'status'> | null | undefined): boolean => projectStatusOf(p) === 'maintenance'
