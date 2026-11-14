// What the habit numbers read besides the task rows (OpenSpec change
// habit-targets): every live habit tally on the device and the week start the
// user chose. The Habits screen, a habit's page and its history read it.
import { useMemo } from 'react'
import type { HabitOptions } from '../../lib/habits'
import { useHabitTallies } from '../../lib/localData'
import { useDateTimeFormat } from '../DateTimePrefsProvider'

export function useHabitOptions(): HabitOptions {
  const tallies = useHabitTallies()
  const weekStart = useDateTimeFormat().resolved.weekStart
  return useMemo(() => ({ tallies, weekStart }), [tallies, weekStart])
}
