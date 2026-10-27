// The undo toast of the last action (OpenSpec change bulk-edit, design D5; one
// task's own actions too since ux-overhaul): module state so any list or panel can
// show it and the Shell renders it once. A new offer replaces the previous one.
import { resettable } from '../../lib/moduleState'
import { createStore } from '../../lib/store'

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

const store = createStore<BulkToast | null>('bulkToast', null)
let seq = 0
resettable('bulkToastSeq', () => { seq = 0 })

/** Show (or replace) the toast for a bulk action. */
export function showBulkToast(label: string, undoId: string | null, opts: { ttl?: number; action?: BulkToast['action'] } = {}): void {
  store.set({ key: ++seq, label, undoId, ...(opts.ttl ? { ttl: opts.ttl } : {}), ...(opts.action ? { action: opts.action } : {}) })
}

/** Five seconds: the offer after one task's own action (task-list-presentation "Completion feedback"). */
export const ACTION_TOAST_MS = 5_000

/** Show (or replace) the Undo offer for one task's own action. */
export const showUndoToast = (label: string, undoId: string | null, ttl = ACTION_TOAST_MS): void => showBulkToast(label, undoId, { ttl })

export function updateBulkToast(patch: Partial<BulkToast>): void {
  const current = store.get()
  if (current) store.set({ ...current, ...patch })
}

export function hideBulkToast(key?: number): void {
  if (key !== undefined && store.get()?.key !== key) return
  store.set(null)
}

export const bulkToast = store.get
export const useBulkToast = store.use
