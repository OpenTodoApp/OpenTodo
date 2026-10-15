// The undo toast of the last bulk action (OpenSpec change bulk-edit, design D5):
// module state so any list can show it and the Shell renders it once.
import { useSyncExternalStore } from 'react'

export interface BulkToast {
  key: number
  label: string
  undoId: string | null
  /** After Undo: what came back, and what was kept because it changed since. */
  result?: string
}

let current: BulkToast | null = null
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

/** Show (or replace) the toast for a bulk action. */
export function showBulkToast(label: string, undoId: string | null): void {
  current = { key: ++seq, label, undoId }
  emit()
}

export function updateBulkToast(patch: Partial<BulkToast>): void {
  if (!current) return
  current = { ...current, ...patch }
  emit()
}

export function hideBulkToast(key?: number): void {
  if (key !== undefined && current?.key !== key) return
  current = null
  emit()
}

export function bulkToast(): BulkToast | null {
  return current
}

export function useBulkToast(): BulkToast | null {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => current, () => null)
}
