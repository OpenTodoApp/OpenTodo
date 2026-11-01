// The undo toast of the last action (OpenSpec change bulk-edit, design D5; one
// task's own actions too since ux-overhaul): module state so any list or panel can
// show it and the Shell renders it once. A new offer replaces the previous one.
import { useEffect, useRef } from 'react'
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
  /** A second control (a routine run's Undo on the server, routines-engine); it keeps the toast for its result. */
  second?: { label: string; run: () => void }
}

/** A background failure or notice (the focus engine's failed time entry): no undo, one message, the same window. */
export interface ActionToast {
  key: number
  label: string
  tone: 'danger' | 'info'
}

const store = createStore<BulkToast | null>('bulkToast', null)
let seq = 0
resettable('bulkToastSeq', () => { seq = 0 })

// The action toast lives beside the undo offer in the same module so its timing and
// reset stay in one place; only one of the two renders at a time (the hosts check).
const actions = createStore<ActionToast | null>('actionToast', null)
let actionSeq = 0
resettable('actionToastSeq', () => { actionSeq = 0 })

/** Show (or replace) the background action's message. */
export function showActionToast(label: string, tone: ActionToast['tone'] = 'danger'): void {
  actions.set({ key: ++actionSeq, label, tone })
}

/** The background action's message now shown, if any. */
export const actionToast = actions.get
export const useActionToast = actions.use
export function hideActionToast(key?: number): void {
  if (key !== undefined && actions.get()?.key !== key) return
  actions.set(null)
}

/** Show (or replace) the toast for a bulk action. */
export function showBulkToast(label: string, undoId: string | null, opts: { ttl?: number; action?: BulkToast['action']; second?: BulkToast['second'] } = {}): void {
  store.set({ key: ++seq, label, undoId, ...(opts.ttl ? { ttl: opts.ttl } : {}), ...(opts.action ? { action: opts.action } : {}), ...(opts.second ? { second: opts.second } : {}) })
}

/** Five seconds: the offer after one task's own action (task-list-presentation "Completion feedback"). */
export const ACTION_TOAST_MS = 5_000

/**
 * The toast's timer: ttl ms of being shown, not counting the time it is held (hover or
 * focus). A new message in the same toast (the result after Undo) starts it again. Shared
 * by the undo offer and the background-failure host so both behave alike.
 */
export function useToastTimer(key: number | undefined, message: string | undefined, ttl: number, held: boolean, onHide: (key: number) => void = hideBulkToast) {
  const left = useRef(ttl)
  const hide = useRef(onHide)
  useEffect(() => { hide.current = onHide })
  useEffect(() => { left.current = ttl }, [key, message, ttl])
  useEffect(() => {
    if (key === undefined || held) return
    const started = Date.now()
    const timer = setTimeout(() => hide.current(key), left.current)
    return () => { clearTimeout(timer); left.current = Math.max(0, left.current - (Date.now() - started)) }
  }, [key, message, held])
}

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
