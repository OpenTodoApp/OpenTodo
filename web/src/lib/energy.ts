// A task's energy (OpenSpec change task-energy): Deep, Medium or Low, stored as
// task.energy ("" for none). The value is chosen from a menu, never typed, so it
// is not content (design D2). A value this client does not know reads as none
// and is never rewritten (D1). The Energy levels switch (`user_prefs.energy`)
// only decides whether the interface offers it (D3); a value already set is
// always shown, with a way to clear it.
import { db } from './db'
import { t } from './i18n'
import { mutate } from './ops'
import type { Task, UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'

export type Energy = 'deep' | 'medium' | 'low'
/** The levels in menu order. */
export const ENERGY_LEVELS: readonly Energy[] = ['deep', 'medium', 'low']

/** Whether `v` is one of the stored levels. */
export function isEnergy(v: unknown): v is Energy {
  return v === 'deep' || v === 'medium' || v === 'low'
}

/** The task's energy; '', a missing field and an unknown value read as none. */
export function energyOf(task: Pick<Task, 'energy'> | null | undefined): Energy | null {
  const v = task?.energy
  return isEnergy(v) ? v : null
}

/** The level's name ("Deep", "Medium", "Low"). */
export function energyName(e: Energy): string {
  switch (e) {
    case 'deep': return t('Deep')
    case 'medium': return t('Medium')
    case 'low': return t('Low')
  }
}

/** The quick-add chip's label ("Deep energy"). */
export function energyChipLabel(e: Energy): string {
  switch (e) {
    case 'deep': return t('Deep energy')
    case 'medium': return t('Medium energy')
    case 'low': return t('Low energy')
  }
}

/** Whether the account offers energy; '' and unknown values read as off. */
export function energyLevelsOn(row: Partial<UserPrefs> | null | undefined): boolean {
  return row?.energy === 'on'
}

/** The account's choice read now (one keyed read), for code outside React (the bar's add). */
export async function energyLevelsPreferred(): Promise<boolean> {
  return energyLevelsOn(await db.userPrefs.get(USER_PREFS_ID))
}

/** Turns Energy levels on or off for the account: one synced op, offline included. */
export function setEnergyLevels(on: boolean): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { energy: on ? 'on' : 'off' })
}

/** Sets (or with null clears) a task's energy: one op, undoable like any edit. */
export function setTaskEnergy(taskId: string, e: Energy | null): Promise<void> {
  return mutate('task', taskId, { energy: e ?? '' })
}
