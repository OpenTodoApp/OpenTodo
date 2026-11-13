// What a row's gestures write (native-app-everyday D3): each action is one undoable
// batch through the shared undo stack, so Undo brings back everything it changed (a
// completed task with its subtasks and its series' date, a deleted subtree, a date) in
// one step, offline included. The shared planners decide the changes; nothing here
// knows a rule of its own.
import { planDue, planTrash, toProposed, type DuePick } from '@shared/bulk'
import { logicalToday } from '@shared/dates'
import { db } from '@shared/db'
import { getDeviceId, liveSubtree, planCompleteTask, type Change } from '@shared/ops'
import type { Task } from '@shared/types'
import { applyBatch, undoBatch } from '@shared/undo'

/** The id to hand to `undo`, or null when the action changed nothing. */
export type UndoId = string | null

async function apply(changes: Change[]): Promise<UndoId> {
  if (!changes.length) return null
  await getDeviceId()
  return (await applyBatch(await toProposed(changes), { source: 'action' }))?.id ?? null
}

/** Completes a task: its open subtasks with it, or a repeating task's occurrence. */
export async function completeTask(id: string): Promise<UndoId> {
  return apply(await planCompleteTask(id))
}

/** Moves a task and its subtasks to the Trash (an occurrence of a series is skipped instead). */
export async function trashTask(id: string): Promise<UndoId> {
  const tree = await liveSubtree(id)
  const task = tree[0]
  if (!task) return null
  // The planner asks the series of an occurrence whether deleting it means skipping it.
  const series = task.series_id ? await db.tasks.get(task.series_id) : undefined
  return apply(planTrash([task], series ? [...tree, series] : tree, Date.now()))
}

/** Gives a task a do-on date: today, tomorrow, next week, a date, or none. */
export async function scheduleTask(task: Task, pick: DuePick): Promise<UndoId> {
  return apply(planDue([task], pick, logicalToday()))
}

/** Undoes one action. */
export async function undo(id: string): Promise<void> {
  await undoBatch(id)
}
