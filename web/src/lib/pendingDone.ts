// A completion shows in the frame of the click (OpenSpec change
// list-rendering-at-scale, design D3). Completing a task writes it and the
// shared task data catches up a moment later; until then the row draws the
// state the user asked for. An entry stops counting as soon as the row's stored
// data changes (the write arrived: completed, or a series moved on) and is
// dropped after PENDING_MS in any case, so a failed write shows the stored
// state again.
import { useCallback, useSyncExternalStore } from 'react'
import { resettable } from './moduleState'
import type { Task } from './types'

/** How long an unconfirmed completion is drawn at most. */
export const PENDING_MS = 10_000

// `clock` is the row's field clocks object: a new one arrives with every stored change,
// and copies of a row made for drawing share it.
interface Pending { done: boolean; clock: unknown; timer: ReturnType<typeof setTimeout> }

const pending = new Map<string, Pending>()
const listeners = new Map<string, Set<() => void>>()

resettable('pendingDone', () => {
  for (const p of pending.values()) clearTimeout(p.timer)
  pending.clear()
  listeners.clear()
})

function notify(id: string) {
  for (const l of listeners.get(id) ?? []) l()
}

/** The user asked to complete (or reopen) `row`: draw it so until its stored data changes. */
export function markPendingDone(row: Task | undefined, done: boolean): void {
  if (!row) return
  const old = pending.get(row.id)
  if (old) clearTimeout(old.timer)
  const timer = setTimeout(() => {
    if (pending.get(row.id)?.timer !== timer) return
    pending.delete(row.id)
    notify(row.id)
  }, PENDING_MS)
  pending.set(row.id, { done, clock: row._clock, timer })
  notify(row.id)
}

function subscribe(id: string, fn: () => void): () => void {
  let set = listeners.get(id)
  if (!set) listeners.set(id, (set = new Set()))
  set.add(fn)
  return () => {
    set.delete(fn)
    if (set.size === 0) listeners.delete(id)
  }
}

/**
 * Whether `task` should be drawn completed: the pending choice while the row's
 * stored data is still the one the user acted on, else what is stored.
 */
export function usePendingDone(task: Task): boolean {
  const id = task.id
  const sub = useCallback((fn: () => void) => subscribe(id, fn), [id])
  const entry = useSyncExternalStore(sub, () => pending.get(id), () => undefined)
  return entry && entry.clock === task._clock ? entry.done : !!task.completed_at
}
