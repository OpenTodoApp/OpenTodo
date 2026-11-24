// Several tasks from one paste as one undoable batch (OpenSpec change paste-to-tasks,
// design D3, D5): planned with createTasks' plan, applied as one batch whose Undo
// moves every task, reminder and time entry of it to the Trash in one step.
import { t } from './i18n'
import { planNewTasks, type Change, type NewTaskInput, type Placement } from './ops'
import { applyBatch } from './undo'
import { withFiles } from './attachments'

export interface AddedBatch {
  /** The new tasks, in the pasted order. */
  ids: string[]
  undoId: string | null
  /** The toast's words: "3 tasks added" or "3 subtasks added". */
  label: string
}

/** The toast's words for n created tasks or subtasks. */
export function addedLabel(n: number, subtasks = false): string {
  return subtasks
    ? t('{n, plural, one {# subtask added} other {# subtasks added}}', { n })
    : t('{n, plural, one {# task added} other {# tasks added}}', { n })
}

const asCreates = (changes: Change[]) => changes.map((c) => ({ ...c, create: true }))

/** Creates the tasks in order as one batch and keeps its Undo; nothing is written when any line is refused. */
export async function addTasksUndoable(inputs: readonly NewTaskInput[], opts: { placement?: Placement; subtasks?: boolean } = {}): Promise<AddedBatch> {
  const label = addedLabel(inputs.length, opts.subtasks)
  if (inputs.length === 0) return { ids: [], undoId: null, label }
  const { ids, changes } = await planNewTasks(inputs, opts.placement ?? 'bottom')
  let undoId: string | null = null
  // Files pasted into quick add go in the same batch, under the same Undo (quick-add-files D1).
  await withFiles(ids, inputs, changes, async (all) => { undoId = (await applyBatch(asCreates(all), { source: 'bulk', label }))?.id ?? null })
  return { ids, undoId, label }
}

/** Several subtasks of one parent, in order, with the parent's project, default priority and no date (paste-to-tasks D7). */
export function subtaskInputs(parent: { id: string; project_id: string | null }, titles: readonly string[]): NewTaskInput[] {
  return titles.map((title) => ({ title, project_id: parent.project_id, parent_id: parent.id }))
}

/**
 * One task from quick add as one recorded step (OpenSpec change undo-task-create): planned
 * exactly as createTask plans it, applied as one batch, so Ctrl/Cmd-Z or the palette moves it,
 * its reminders and its time entry to the Trash. No toast: the history alone holds the step.
 */
export async function addTaskUndoable(input: NewTaskInput): Promise<string> {
  const { ids, changes } = await planNewTasks([input], input.placement ?? 'bottom')
  await withFiles(ids, [input], changes, (all) => applyBatch(asCreates(all), { source: 'action', label: addedLabel(1) }))
  return ids[0]
}
