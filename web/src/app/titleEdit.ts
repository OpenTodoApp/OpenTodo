// Committing an edited title (OpenSpec change smart-title-tokens, natural-language-capture
// "Parsing while editing a title"): what the edit typed becomes the task's fields, its
// labels are added, its reminders created, and the toast offers Undo. A project token
// moves the task first (a move across sharing scopes follows the copy); a repeat rule
// goes through setRecurrence, which plans the series. Locally first, offline too.
import { createLabel, LabelExistsError } from '../lib/labels'
import { findLabel, type LabelRef } from '../lib/nlp'
import type { EditPlan } from '../lib/nlp/edit'
import { setRecurrence, updateTask } from '../lib/ops'
import type { Task } from '../lib/types'
import { titleEditUndoable } from '../lib/undoActions'
import { showUndoToast } from './bulk/toastStore'
import { moveWithUndo } from './undoable'
import { t } from '../lib/i18n'

async function labelId(name: string, labels: readonly LabelRef[]): Promise<string> {
  const found = findLabel(name, labels)
  if (found) return found.id
  try {
    return await createLabel({ name: name.trim() })
  } catch (err) {
    if (err instanceof LabelExistsError) return err.existing.id
    throw err
  }
}

/** Applies a committed title edit; returns the task's id afterwards (a copy's after a move across scopes). */
export async function applyTitleEdit(task: Task, plan: EditPlan, labels: readonly LabelRef[], projectName?: (id: string) => string): Promise<string> {
  const { project_id: projectId, recurrence, ...rest } = plan.patch
  let id = task.id
  if (projectId !== undefined && projectId !== (task.project_id ?? null)) {
    id = await moveWithUndo(task.id, projectId, projectId ? projectName?.(projectId) ?? t('the project') : t('Inbox'))
  }
  const patch: Partial<Task> = { ...rest }
  if (plan.labels.length) {
    const ids = [...task.labels]
    for (const name of plan.labels) {
      const lid = await labelId(name, labels)
      if (!ids.includes(lid)) ids.push(lid)
    }
    if (ids.length !== task.labels.length) patch.labels = ids
  }
  const r = await titleEditUndoable(id, patch, plan.reminders)
  if (recurrence) await setRecurrence(id, recurrence)
  if (r.entry) showUndoToast(r.label, r.entry.id)
  return id
}

/**
 * Commits a title edit the way both title editors do: nothing for an unchanged title,
 * a plain rename as one write, anything else through applyTitleEdit. Returns the id
 * to follow (a copy's after a move across scopes).
 */
export async function commitTitleEdit(task: Task, plan: EditPlan, labels: readonly LabelRef[], projectName?: (id: string) => string): Promise<string> {
  const fields = Object.keys(plan.patch)
  if (!fields.length && !plan.labels.length && !plan.reminders.length) return task.id
  if (fields.length === 1 && plan.patch.title && !plan.labels.length && !plan.reminders.length) {
    await updateTask(task.id, { title: plan.patch.title })
    return task.id
  }
  return applyTitleEdit(task, plan, labels, projectName)
}

