// The Habits switch on the device (OpenSpec change habits-home, design D1, D2):
// the synced user_prefs.habits, read with whether the device holds an open habit.
// Every habit control reads useHabitsEnabled() and renders nothing while it is
// false; no write path checks it, so records keep accruing while Habits is off.
import { habitsChoice, habitsEnabled, isOpenHabit, type HabitsChoice } from './habits'
import { useUserPrefsRow } from './localData'
import { useLiveTasks } from './liveTasks'
import { mutate, mutateMany } from './ops'
import { perList } from './taskDelta'
import type { Task } from './types'
import { USER_PREFS_ID } from './userPrefs'

/** Whether a snapshot holds an open habit, once per snapshot (a write that touches none keeps the answer). */
export const holdsOpenHabit = perList<boolean>(
  (tasks) => tasks.some(isOpenHabit),
  (prev, changes) => (changes.some((c) => (c.after && isOpenHabit(c.after)) || (c.before && isOpenHabit(c.before))) ? null : prev),
)

/** The stored choice, live: 'on', 'off' or 'undecided'; undefined while loading. */
export function useHabitsChoice(): HabitsChoice | undefined {
  const prefs = useUserPrefsRow()
  return prefs === undefined ? undefined : habitsChoice(prefs)
}

/** Whether habits are shown on this device (D1), live; false while loading. */
export function useHabitsEnabled(): boolean {
  const prefs = useUserPrefsRow()
  const tasks = useLiveTasks()
  return habitsEnabled(prefs, !!tasks && holdsOpenHabit(tasks))
}

/** Turns Habits on or off for the account: one synced op, offline included, and nothing on any task (D2). */
export function setHabitsOn(on: boolean): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { habits: on ? 'on' : 'off' })
}

/**
 * Track as a habit (D1): the flag on the task and, while Habits is not decided,
 * `habits: "on"` in the same batch. Returns whether Habits was turned on by it, so
 * the caller can say once where Habits lives.
 */
export async function trackAsHabit(task: Pick<Task, 'id'>, on: boolean, choice: HabitsChoice): Promise<boolean> {
  const turnOn = on && choice === 'undecided'
  await mutateMany([
    { entity: 'task', entityId: task.id, patch: { habit: on } },
    ...(turnOn ? [{ entity: 'user_prefs' as const, entityId: USER_PREFS_ID, patch: { habits: 'on' } }] : []),
  ])
  return turnOn
}
