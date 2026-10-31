// The note conversions as user actions (OpenSpec change notes-overview, design D6):
// one batch each and one Undo toast; a failure shows its message. The task menu
// imports this module on first use, so the first load does not carry it.
import { moveTaskNoteOut, noteToTask, trashNote, type Converted } from '../../lib/noteOps'
import { reportActionError } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'

async function withToast(p: Promise<Converted | null>): Promise<Converted | null> {
  try {
    const r = await p
    if (r) showUndoToast(r.label, r.entry?.id ?? null)
    return r
  } catch (err) {
    reportActionError(err)
    return null
  }
}

/** Turn into task (a standalone note's menus); resolves to the new task's id. */
export async function turnNoteIntoTask(noteId: string): Promise<string | null> {
  return (await withToast(noteToTask(noteId)))?.id ?? null
}

/** Delete (a standalone note's menus): to the Trash, undoable. */
export async function deleteNote(noteId: string): Promise<void> {
  await withToast(trashNote(noteId))
}

/** Move note to a new note (a task's menu); resolves to the new note's id. */
export async function moveNoteOut(taskId: string): Promise<string | null> {
  return (await withToast(moveTaskNoteOut(taskId)))?.id ?? null
}
