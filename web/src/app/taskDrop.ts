// A task dropped on the sidebar (OpenSpec change ux-feedback-2, design D4): on a
// project or the Inbox it moves as the Move action does; on a label it gains the
// label. Targets carry `data-task-drop` ("project:<id>", "inbox", "label:<id>"),
// resolved by the list's drag (lib/dnd `taskDrops`) as `drop:<value>`.
import { dropUndoable } from '../lib/undoActions'
import { showUndoToast } from './bulk/toastStore'

/** The value of a `data-task-drop` attribute for a project, the Inbox or a label. */
export const taskDrop = {
  project: (id: string) => `project:${id}`,
  inbox: 'inbox',
  label: (id: string) => `label:${id}`,
} as const

/**
 * Apply a drop (`target` without its `drop:` prefix) to the dragged task, or to
 * the whole bulk selection it is part of. A label the tasks already have writes
 * nothing, and the toast says so without an Undo.
 */
export async function dropTasks(target: string, ids: readonly string[]): Promise<void> {
  const r = await dropUndoable(target, ids)
  if (r?.label) showUndoToast(r.label, r.entry?.id ?? null)
}
