// Which New habit form is open (OpenSpec change habits-home, design D9): one form
// for New habit (the Habits screen, its starters, the command palette) and Make it a
// habit (a task's menu and page). Tiny, on the first load; the form itself is lazy.
import { useSyncExternalStore } from 'react'
import { resettable } from '../../lib/moduleState'

export interface HabitFormRequest {
  /** Make it a habit: the task to change. */
  taskId?: string
  /** A starter's title. */
  title?: string
}

let current: HabitFormRequest | null = null
const listeners = new Set<() => void>()
resettable('habit form', () => { current = null })

export function openHabitForm(req: HabitFormRequest = {}): void {
  current = req
  for (const l of listeners) l()
}

export function closeHabitForm(): void {
  current = null
  for (const l of listeners) l()
}

export function useHabitForm(): HabitFormRequest | null {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => current, () => null)
}
