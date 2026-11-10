// The urgency order in the web app (OpenSpec change urgency-sort, design D4): one
// scorer per task snapshot, worked out only when a list asks for a score, and the
// score chip a row shows while its list is ordered by urgency. The chip and its
// breakdown load with their own chunk.
import { createContext, lazy, Suspense, useMemo } from 'react'
import { currentDayStart } from '../lib/dates'
import { liveBlocked } from '../lib/dependencies'
import { useRunningEntry } from '../lib/timeEntries'
import type { Task } from '../lib/types'
import { blocksCount, urgency, type Urgency } from '../lib/urgency'

/** A task's urgency, null for a completed or deleted one; the same object for the same row. */
export type UrgencyOf = (task: Task) => Urgency | null

/** The scorer of one task snapshot: the blocking facts are worked out once, on the first score asked. */
export function urgencyOf(tasks: readonly Task[], today: string, zone: string, running: string | null, dayStart = currentDayStart()): UrgencyOf {
  let blocks: Map<string, number> | undefined
  let blocked: Map<string, number> | undefined
  const cache = new WeakMap<Task, Urgency | null>()
  return (task) => {
    let u = cache.get(task)
    if (u === undefined) {
      blocks ??= blocksCount(tasks)
      blocked ??= liveBlocked(tasks)
      u = urgency(task, { today, zone, dayStart, blocks: blocks.get(task.id) ?? 0, blocked: blocked.has(task.id), timer: running === task.id })
      cache.set(task, u)
    }
    return u
  }
}

/** The score alone, for an order's comparator (lib/views `score`). */
export const scoreOf = (of: UrgencyOf) => (task: Task): number | null => of(task)?.score ?? null

/** The live scorer of the live task snapshot, following the viewer's running timer. */
export function useUrgencyOf(tasks: readonly Task[], today: string, zone: string): UrgencyOf {
  const running = useRunningEntry()?.task_id ?? null
  return useMemo(() => urgencyOf(tasks, today, zone, running), [tasks, today, zone, running])
}

/** The scorer of the list on screen while it is ordered by urgency, else null (the chip and the touch menu's "Why here?"). */
export const UrgencyContext = createContext<UrgencyOf | null>(null)

const ChipBody = lazy(() => import('./UrgencyChip'))

/** The score chip of a top-level row (only under the urgency order; hidden below 640 px with the row's trailing group). */
export function UrgencyChip({ of, task }: { of: UrgencyOf; task: Task }) {
  const u = of(task)
  if (!u) return null
  return <Suspense fallback={null}><ChipBody urgency={u} /></Suspense>
}
