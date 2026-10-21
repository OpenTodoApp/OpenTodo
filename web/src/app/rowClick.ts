// "Click a task to" (OpenSpec change inline-task-editing, design D6): a device-local
// choice between editing the title in place (the default) and opening the task's
// details, as clicks did before. Habits are per device and per pointer, so it does
// not sync. Read through a store so every list follows a change at once.
import { useSyncExternalStore } from 'react'

export type RowClick = 'edit' | 'open'
export const ROW_CLICK_KEY = 'opentodo.rowClick'
const listeners = new Set<() => void>()

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function rowClick(): RowClick {
  try { return storage()?.getItem(ROW_CLICK_KEY) === 'open' ? 'open' : 'edit' } catch { return 'edit' }
}

export function setRowClick(v: RowClick): void {
  try {
    if (v === 'open') storage()?.setItem(ROW_CLICK_KEY, 'open')
    else storage()?.removeItem(ROW_CLICK_KEY)
  } catch {
    // Storage refused: the choice just does not stick.
  }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => { if (e.key === ROW_CLICK_KEY || e.key === null) fn() }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

export function useRowClick(): RowClick {
  return useSyncExternalStore(subscribe, rowClick, () => 'edit')
}
