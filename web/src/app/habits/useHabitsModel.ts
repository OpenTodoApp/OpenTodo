// The Habits screen's model (OpenSpec changes habits-home D9, habits-complete D1):
// every open habit by part of the day, ordered by time and title, the graduated ones
// last, and the chosen day's progress. Shared by the desktop screen and the phone's,
// so both group, order and count alike. From the device's rows only, offline too.
import { useMemo } from 'react'
import { continuedIds, habitRowsOf, isGraduated, isOpenHabit } from '../../lib/habits'
import { dayProgress } from '../../lib/habitDay'
import { t } from '../../lib/i18n'
import { useLiveTasks } from '../../lib/liveTasks'
import { useProjects } from '../../lib/localData'
import type { Task } from '../../lib/types'
import type { HueName } from '../../ui'
import { habitHue } from './habitText'
import { useHabitOptions } from './useHabitOptions'

export type HabitGroup = 'morning' | 'afternoon' | 'evening' | 'any'

export function groupOf(task: Task): HabitGroup {
  if (task.evening) return 'evening'
  if (task.day_part === 'morning' || task.day_part === 'afternoon') return task.day_part
  return 'any'
}

export const GROUP_TITLE: Record<HabitGroup, () => string> = {
  morning: () => t('Morning'), afternoon: () => t('Afternoon'), evening: () => t('This Evening'), any: () => t('Any time'),
}
const ORDER: HabitGroup[] = ['morning', 'afternoon', 'evening', 'any']

/** By time of day, then title (habits-home D9: no manual order). */
function compareHabits(a: Task, b: Task): number {
  const ta = a.due?.time ?? '99:99'
  const tb = b.due?.time ?? '99:99'
  return ta < tb ? -1 : ta > tb ? 1 : a.title.localeCompare(b.title) || (a.id < b.id ? -1 : 1)
}

export function useHabitsModel(day: string, today: string) {
  const tasks = useLiveTasks()
  const projects = useProjects()
  const opts = useHabitOptions()
  const colours = useMemo(() => new Map(projects.map((p) => [p.id, p.color])), [projects])
  const model = useMemo(() => {
    const all = tasks ?? []
    const rowsOf = habitRowsOf(all)
    const continued = continuedIds(all)
    const habits = all.filter((x) => isOpenHabit(x) && !continued.has(x.id))
    const open = habits.filter((x) => !isGraduated(x)).sort(compareHabits)
    const graduated = habits.filter(isGraduated).sort((a, b) => (b.habit_graduated_at ?? 0) - (a.habit_graduated_at ?? 0))
    return {
      rowsOf, open, graduated,
      groups: ORDER.map((g) => ({ g, items: open.filter((x) => groupOf(x) === g) })).filter((x) => x.items.length > 0),
      count: open.length,
    }
  }, [tasks])
  const progress = useMemo(() => dayProgress(model.open, model.rowsOf, day, today, opts), [model, day, today, opts])
  const hue = (x: Task): HueName => habitHue(x, x.project_id ? colours.get(x.project_id) : null)
  return { loaded: tasks !== undefined, ...model, progress, opts, hue }
}

/** The lead line (habits-complete D9): "3 of 5 today", or "3 of 5" on an earlier day; nothing with no habit due. */
export function progressText(p: { kept: number; due: number }, isToday: boolean): string | undefined {
  if (!p.due) return undefined
  return isToday ? t('{kept} of {due} today', { kept: p.kept, due: p.due }) : t('{kept} of {of}', { kept: p.kept, of: p.due })
}
