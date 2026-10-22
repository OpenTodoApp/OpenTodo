// One task's actions with an Undo offer (OpenSpec change ux-overhaul,
// task-list-presentation "Completion feedback", "Single-action undo"): the list,
// the panel and the calendar call these instead of the plain ops, so every
// complete, delete, move, date change and park shows the same toast.
import { completeUndoable, dueUndoable, moveUndoable, parkUndoable, trashUndoable } from '../lib/undoActions'
import type { Task } from '../lib/types'
import { showUndoToast } from './bulk/toastStore'
import { markCompleted, tick, withListTransition } from './motion'

/**
 * Completes or reopens a task. A completion is written at once; just before, the list
 * learns that the row departs (motion-v2 D2) and the device ticks (D6).
 */
export async function completeWithUndo(id: string, completed: boolean): Promise<void> {
  if (completed) {
    markCompleted(id)
    tick()
  }
  const r = await completeUndoable(id, completed)
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

// The rest move one row out of a list or to another place in it: the rows that stay
// slide to their new places (task-list-presentation "List reflow", motion-v2 D4).
export async function deleteWithUndo(id: string): Promise<void> {
  const r = await withListTransition(1, () => trashUndoable(id))
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** Returns the id to follow (a copy when the move crosses sharing scopes). */
export async function moveWithUndo(id: string, projectId: string | null, targetName: string): Promise<string> {
  const r = await withListTransition(1, () => moveUndoable(id, projectId, targetName))
  if (r.entry) showUndoToast(r.label, r.entry.id)
  return r.newId
}

export async function setDueWithUndo(id: string, due: Task['due']): Promise<void> {
  const r = await withListTransition(1, () => dueUndoable(id, due))
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

export async function parkWithUndo(id: string): Promise<void> {
  const r = await withListTransition(1, () => parkUndoable(id))
  if (r.entry) showUndoToast(r.label, r.entry.id)
}
