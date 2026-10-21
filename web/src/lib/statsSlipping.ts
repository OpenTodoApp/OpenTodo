// "Keeps slipping" (OpenSpec change stats-dashboard, design D5): open tasks whose
// due date this device saw moved later, or removed, three or more times in the
// last 90 days. It reads the local activity record (lib/activity), which is not
// synced and is capped per project, so two devices can list different tasks; the
// panel says so. Nothing is written or requested.
import { db } from './db'
import { countedTasks, type StatsInput } from './stats'
import type { ActivityEntry, Task } from './types'

export const SLIP_WINDOW_DAYS = 90
export const SLIP_MIN_MOVES = 3

type Due = { date?: string } | null | undefined

/** Whether one recorded due change moved a set date later or removed it. Setting a first date is not a slip. */
export function isSlip(row: Pick<ActivityEntry, 'from' | 'value'>): boolean {
  const from = row.from as Due
  const to = row.value as Due
  if (!from?.date) return false
  return !to?.date || to.date > from.date
}

export interface Slipping<T> {
  task: T
  moves: number
}

/**
 * The open live tasks of the user (stats "what is counted") with at least three
 * slips in the window, most moves first. A repeating task is left out: completing
 * an occurrence moves its due date forward by design.
 */
export function slippingFrom<T extends Task>(rows: readonly Pick<ActivityEntry, 'entity' | 'entityId' | 'field' | 'from' | 'value' | 'ts'>[],
  input: Pick<StatsInput<T>, 'tasks' | 'projects' | 'shared' | 'me'>, now: number): Slipping<T>[] {
  const since = now - SLIP_WINDOW_DAYS * 86_400_000
  const moves = new Map<string, number>()
  for (const r of rows) {
    if (r.entity !== 'task' || r.field !== 'due' || r.ts < since || !isSlip(r)) continue
    moves.set(r.entityId, (moves.get(r.entityId) ?? 0) + 1)
  }
  const out: Slipping<T>[] = []
  for (const task of countedTasks(input)) {
    const n = moves.get(task.id) ?? 0
    if (n >= SLIP_MIN_MOVES && task.completed_at === null && !task.recurrence) out.push({ task, moves: n })
  }
  return out.sort((a, b) => b.moves - a.moves || a.task.title.localeCompare(b.task.title))
}

/** The due-date changes of the window from the local activity record (bounded per project, read once per open). */
export async function slipRows(now: number): Promise<ActivityEntry[]> {
  const since = now - SLIP_WINDOW_DAYS * 86_400_000
  return db.activity.filter((r) => r.entity === 'task' && r.field === 'due' && r.ts >= since).toArray()
}
