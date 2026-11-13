// What a habit's days and colour read as (OpenSpec change habits-home, design D8):
// shared by the thread, the month grid, the Habits screen and the Today strip.
import { HUES, hueFor, type HueName } from '../../ui'
import type { DayState, HabitStats } from '../../lib/habits'
import { monthName, weekday } from '../../lib/dates'
import { msg, t, translatedMap } from '../../lib/i18n'
import type { Task } from '../../lib/types'

export const STATE_TEXT = translatedMap<DayState>({
  done: msg('done'), tiny: msg('tiny version'), skipped: msg('skipped'), missed: msg('missed'), pending: msg('due, not done yet'), upcoming: msg('upcoming'), blank: msg('not scheduled'),
})

/** "6 October, skipped": a day of the month grid. */
export function dayLabel(iso: string, state: DayState): string {
  const month = monthName(iso.slice(0, 7), 'long', false)
  return `${Number(iso.slice(8, 10))} ${month}, ${STATE_TEXT[state]}`
}

/** "Wednesday 11 November, skipped": a day of the thread. */
export function threadDayLabel(iso: string, state: DayState): string {
  return `${weekday(iso)} ${dayLabel(iso, state)}`
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
export function measureText(stats: HabitStats | null): string | null {
  if (!stats) return null
  if (stats.backOnTrack) return t('Back on track')
  if (stats.keptOf === 0) return null
  return t('{kept} of {of}', { kept: stats.kept, of: stats.keptOf })
}
