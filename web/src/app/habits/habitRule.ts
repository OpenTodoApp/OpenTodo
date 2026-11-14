// How a habit's rule reads in the form and on its page (habits-polish D3, D4):
// Every day, Days of the week, or the rule as typed.
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'

export type Often = 'daily' | 'days' | 'week' | 'month' | 'other'
export type Part = 'any' | 'morning' | 'afternoon' | 'evening'

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export const DAY_LABEL: Record<(typeof DAYS)[number], () => string> = {
  mon: () => t('Mon'), tue: () => t('Tue'), wed: () => t('Wed'), thu: () => t('Thu'), fri: () => t('Fri'), sat: () => t('Sat'), sun: () => t('Sun'),
}

/** The form's starting choice for a rule: Every day, Days of the week, or the rule as typed. */
export function oftenOf(rule: string): { often: Often; days: string[] } {
  if (/^every day$/i.test(rule.trim())) return { often: 'daily', days: [] }
  const m = /^every ((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*(?:,\s*(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)*)$/i.exec(rule.trim())
  if (m) return { often: 'days', days: m[1].split(/,\s*/).map((d) => d.slice(0, 3).toLowerCase()) }
  return { often: 'other', days: [] }
}

export function partOf(task: Pick<Task, 'evening' | 'day_part'> | null | undefined): Part {
  if (task?.evening) return 'evening'
  return task?.day_part === 'morning' || task?.day_part === 'afternoon' ? task.day_part : 'any'
}

export const PART_LABEL: Record<Part, () => string> = {
  any: () => t('Any time'), morning: () => t('Morning'), afternoon: () => t('Afternoon'), evening: () => t('This Evening'),
}

/** "Every day", "Mon, Wed, Fri", or the rule as stored. */
export function ruleSummary(rule: string | null | undefined): string {
  const { often, days } = oftenOf(rule ?? '')
  if (often === 'daily') return t('Every day')
  if (often === 'days') return DAYS.filter((d) => days.includes(d)).map((d) => DAY_LABEL[d]()).join(', ')
  return rule ?? ''
}

/** "3 times a week", "10 times a month", or how the rule reads (habit-targets D1). */
export function oftenSummary(task: Pick<Task, 'recurrence' | 'habit_target' | 'habit_period'>): string {
  const n = task.habit_target ?? 0
  if (n > 0 && task.habit_period === 'week') return t('{n, plural, one {Once a week} other {# times a week}}', { n })
  if (n > 0 && task.habit_period === 'month') return t('{n, plural, one {Once a month} other {# times a month}}', { n })
  return ruleSummary(task.recurrence)
}

/** The page's one line of facts: how often, the amount (when set), the part of the day (when set) and the anchor. */
export function habitFacts(task: Task): string {
  const part = partOf(task)
  const amount = task.habit_amount ? [String(task.habit_amount), task.habit_unit ?? ''].filter(Boolean).join(' ') : ''
  return [oftenSummary(task), amount, part === 'any' ? '' : PART_LABEL[part](), task.habit_anchor ?? ''].filter(Boolean).join(' · ')
}
