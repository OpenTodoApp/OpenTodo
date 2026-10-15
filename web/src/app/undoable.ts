// One task's actions with an Undo offer (OpenSpec change ux-overhaul,
// task-list-presentation "Completion feedback", "Single-action undo"): the list,
// the panel and the calendar call these instead of the plain ops, so every
// complete, delete, move, date change and park shows the same toast.
import { completeUndoable, dueUndoable, moveUndoable, parkUndoable, trashUndoable } from '../lib/undoActions'
import type { Task } from '../lib/types'
import { showUndoToast } from './bulk/toastStore'

export async function completeWithUndo(id: string, completed: boolean): Promise<void> {
  const r = await completeUndoable(id, completed)
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

export async function deleteWithUndo(id: string): Promise<void> {
  const r = await trashUndoable(id)
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** Returns the id to follow (a copy when the move crosses sharing scopes). */
export async function moveWithUndo(id: string, projectId: string | null, targetName: string): Promise<string> {
  const r = await moveUndoable(id, projectId, targetName)
  if (r.entry) showUndoToast(r.label, r.entry.id)
  return r.newId
}

export async function setDueWithUndo(id: string, due: Task['due']): Promise<void> {
  const r = await dueUndoable(id, due)
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

export async function parkWithUndo(id: string): Promise<void> {
  const r = await parkUndoable(id)
  if (r.entry) showUndoToast(r.label, r.entry.id)
}
