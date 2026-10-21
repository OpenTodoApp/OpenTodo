// The undo toast of the last action (OpenSpec change bulk-edit, design D5; one
// task's own actions too since ux-overhaul): module state so any list or panel can
// show it and the Shell renders it once. A new offer replaces the previous one.
import { useSyncExternalStore } from 'react'

export interface BulkToast {
  key: number
  label: string
  undoId: string | null
  /** After Undo: what came back, and what was kept because it changed since. */
  result?: string
  /** How long the offer stays, in milliseconds (the renderer's default otherwise). */
  ttl?: number
  /** A second control, such as "Open" for where a new task went (inbox-means-unplaced D5). */
  action?: { label: string; run: () => void }
}

let current: BulkToast | null = null
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

/** Show (or replace) the toast for a bulk action. */
export function showBulkToast(label: string, undoId: string | null, opts: { ttl?: number; action?: BulkToast['action'] } = {}): void {
  current = { key: ++seq, label, undoId, ...(opts.ttl ? { ttl: opts.ttl } : {}), ...(opts.action ? { action: opts.action } : {}) }
  emit()
}

/** Five seconds: the offer after one task's own action (task-list-presentation "Completion feedback"). */
export const ACTION_TOAST_MS = 5_000

/** Show (or replace) the Undo offer for one task's own action. */
export const showUndoToast = (label: string, undoId: string | null, ttl = ACTION_TOAST_MS): void => showBulkToast(label, undoId, { ttl })

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
