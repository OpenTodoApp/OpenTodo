// What a habit's days and colour read as (OpenSpec change habits-home, design D8):
// shared by the thread, the month grid, the Habits screen and the Today strip.
import { HUES, hueFor, type HueName } from '../../ui'
import type { DayState, HabitStats } from '../../lib/habits'
import { monthName, weekday } from '../../lib/dates'
import { msg, t, translatedMap } from '../../lib/i18n'
import type { Task } from '../../lib/types'

export const STATE_TEXT = translatedMap<DayState>({
  done: msg('done'), tiny: msg('tiny version'), partial: msg('part of the amount'), skipped: msg('skipped'), missed: msg('missed'), rest: msg('rest day'), pending: msg('due, not done yet'), upcoming: msg('upcoming'), blank: msg('not scheduled'),
})

/** "6 October, skipped": a day of the month grid; "…, with a note" when the day has one (habit-notes D3). */
export function dayLabel(iso: string, state: DayState, note = false): string {
  const month = monthName(iso.slice(0, 7), 'long', false)
  const day = `${Number(iso.slice(8, 10))} ${month}, ${STATE_TEXT[state]}`
  return note ? `${day}, ${t('with a note')}` : day
}

/** "5 of 8 glasses": an amount habit's day (habit-targets D3). */
export function amountText(amount: number, goal: number, unit?: string): string {
  return unit ? t('{amount} of {goal} {unit}', { amount, goal, unit }) : t('{amount} of {goal}', { amount, goal })
}

/** "Wednesday 11 November, skipped": a day of the thread; "…, 5 of 8 glasses" for an amount habit's day with some. */
export function threadDayLabel(iso: string, state: DayState, note = false, amount?: { amount: number; goal: number; unit?: string }): string {
  const day = `${weekday(iso)} ${dayLabel(iso, state, note)}`
  return amount ? `${day}, ${amountText(amount.amount, amount.goal, amount.unit)}` : day
}

/** A stable small hash of an id, so every device picks the same hue. */
function hashOf(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

/** The habit's hue (D8, habits-polish D5): its own colour, else its project's, else one of the 12 picked by its id. */
export function habitHue(task: Pick<Task, 'id' | 'split_from' | 'habit_color'>, projectColor?: string | null): HueName {
  if (task.habit_color) return hueFor(task.habit_color)
  if (projectColor) return hueFor(projectColor)
  // The pieces of a lineage keep the hue of the first; red is left out, so no habit reads as an alarm.
  const calm = HUES.filter((h) => h.name !== 'red')
  return calm[hashOf(task.split_from?.series ?? task.id) % calm.length].name
}

/** The measure of a row and a chip: "6 of 7", "Back on track", or nothing for a habit without history. */
export function measureText(stats: HabitStats | null, unit?: string): string | null {
  if (!stats) return null
  if (stats.backOnTrack) return t('Back on track')
  // "2 of 3 this week" (habit-targets D1); "5 of 8 glasses" for today's amount (D2).
  if (stats.period) return stats.period === 'week' ? t('{kept} of {of} this week', { kept: stats.kept, of: stats.keptOf }) : t('{kept} of {of} this month', { kept: stats.kept, of: stats.keptOf })
  if (stats.goal) return amountText(stats.amount ?? 0, stats.goal, unit)
  if (stats.keptOf === 0) return null
  return t('{kept} of {of}', { kept: stats.kept, of: stats.keptOf })
}
