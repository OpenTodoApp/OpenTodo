// One task's actions with an Undo offer (OpenSpec change ux-overhaul,
// task-list-presentation "Completion feedback", "Single-action undo"): the list,
// the panel and the calendar call these instead of the plain ops, so every
// complete, delete, move, date change and park shows the same toast.
import { assigneeUndoable, calendarEditUndoable, completeUndoable, deadlineUndoable, doOnUndoable, dueUndoable, estimateUndoable, moveTaskByUndoable, moveTaskUndoable, moveUndoable, parkUndoable, rescheduleUndoable, sectionMoveUndoable, spanUndoable, trashUndoable, type UndoableResult } from '../lib/undoActions'
import type { Step, TaskTarget } from '../lib/move'
import type { DoOnChoice } from '../lib/dayParts'
import type { Task } from '../lib/types'
import { hideBulkToast, showActionToast, showUndoToast } from './bulk/toastStore'
import { markCompleted, withListTransition, success } from './motion'
import { prepareCompletionSound } from './completionSound'

/**
 * Completes or reopens a task. A completion is written at once; just before, the list
 * learns that the row departs (motion-v2 D2) and the device ticks (D6).
 */
export async function completeWithUndo(id: string, completed: boolean): Promise<void> {
  const cue = prepareCompletionSound(completed)
  if (completed) {
    markCompleted(id)
    success()
  }
  const r = await completeUndoable(id, completed)
  if (r.completed) cue?.()
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

// The rest move one row out of a list or to another place in it: the rows that stay
// slide to their new places (task-list-presentation "List reflow", motion-v2 D4).
export async function deleteWithUndo(id: string): Promise<void> {
  const r = await withListTransition(1, () => trashUndoable(id))
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** Returns the id to follow (a copy when the move crosses sharing scopes). */
export async function moveWithUndo(id: string, projectId: string | null, targetName: string, toWorkspace?: string): Promise<string> {
  const r = await withListTransition(1, () => moveUndoable(id, projectId, targetName, Date.now(), toWorkspace))
  if (r.entry) showUndoToast(r.label, r.entry.id)
  // A repeating task already without a project keeps its date; the toast says so (inbox-drop-unplaces D2).
  else if (r.label) showActionToast(r.label)
  return r.newId
}

/** A date the change could not keep (a series onto its own record, #1971): the reason replaces the last offer, with no Undo. */
function refuse(label: string): void {
  hideBulkToast()
  showActionToast(label)
}

export async function setDueWithUndo(id: string, due: Task['due']): Promise<void> {
  const r = await withListTransition(1, () => dueUndoable(id, due))
  if (r.refused) refuse(r.label)
  else if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** A choice of the Do on time of day row, or a typed date with a time (when-picker D2): one batch with Undo. */
export async function doOnWithUndo(id: string, choice: DoOnChoice, zone?: string): Promise<void> {
  const r = await withListTransition(1, () => doOnUndoable(id, choice, zone))
  if (r.refused) refuse(r.label)
  else if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** A calendar block's new start with the estimate that keeps its end, as one change. */
export async function rescheduleWithUndo(id: string, due: NonNullable<Task['due']>, estimate: number): Promise<void> {
  const r = await rescheduleUndoable(id, due, estimate)
  if (r.refused) refuse(r.label)
  else if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** Set or remove one task's deadline in the When editor, with Undo, like its due date beside it. */
export async function deadlineWithUndo(id: string, deadline: string | null): Promise<void> {
  const r = await deadlineUndoable(id, deadline)
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** Assign one task, or with null unassign it, with Undo: in Assigned to me the row leaves the list. */
export async function assigneeWithUndo(id: string, assignee: string | null): Promise<void> {
  const r = await assigneeUndoable(id, assignee)
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** A calendar block's new length (its lower edge), as one change with Undo, like the block's other edits. */
export async function estimateWithUndo(id: string, minutes: number): Promise<void> {
  const r = await estimateUndoable(id, minutes)
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** A span's new range, or a task made a span (multi-day-tasks D4), as one change with Undo. */
export async function spanWithUndo(id: string, patch: Pick<Partial<Task>, 'start' | 'due' | 'span'>): Promise<void> {
  const r = await spanUndoable(id, patch)
  if (r.refused) refuse(r.label)
  else if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** A bar dragged in the timeline: its new dates as one change with Undo, like a drop on a calendar day. */
export async function calendarEditWithUndo(id: string, patch: Partial<Task>): Promise<void> {
  const r = await calendarEditUndoable(id, patch)
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

export async function parkWithUndo(id: string): Promise<void> {
  const r = await withListTransition(1, () => parkUndoable(id))
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** One row dragged among rows or onto a section heading (undo-coverage): the row travels, then the toast offers Undo. */
export async function moveRowWithUndo(id: string, target: TaskTarget, label?: string): Promise<boolean> {
  const r = await withListTransition(1, () => moveTaskUndoable(id, target, label))
  if (r?.entry) showUndoToast(r.label, r.entry.id)
  return r !== null
}

/** A keyboard move of one row (Alt+arrows, the row menu's Move items, Vim); false at the list's edge. */
export async function stepRowWithUndo(id: string, step: Step): Promise<boolean> {
  const r = await withListTransition(1, () => moveTaskByUndoable(id, step))
  if (r?.entry) showUndoToast(r.label, r.entry.id)
  return r !== null
}

/** A task moved to a section, or with null to No section (a board column, the section picker), with Undo. */
export async function sectionMoveWithUndo(id: string, sectionId: string | null, sectionName: string): Promise<void> {
  const r = await withListTransition(1, () => sectionMoveUndoable(id, sectionId, sectionName))
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** Deleting a section, a label or a custom field, or merging labels, after its confirmation: one step with Undo. */
export async function withUndoToast(run: Promise<UndoableResult>): Promise<void> {
  const r = await run
  if (r.entry) showUndoToast(r.label, r.entry.id)
}
