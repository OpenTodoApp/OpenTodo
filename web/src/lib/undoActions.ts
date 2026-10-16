// Single-action undo (OpenSpec change ux-overhaul, task-list-presentation
// "Completion feedback" and "Single-action undo"): completing, deleting, moving,
// rescheduling and parking one task are applied as one undoable batch, the same
// way bulk actions are (bulk-edit D5). The inverse is stored with the clocks each
// field got; undo writes ordinary ops, locally first, so it works offline and
// every device converges by last-writer-wins.
import { planComplete, planMove, planReopen, planTrash, readTicked, toProposed } from './bulk'
import type { AssistantUndo } from './db'
import { todayISO } from './dates'
import { getDeviceId, type Change } from './ops'
import { currentUserId, membershipMap } from './sharing'
import type { Task } from './types'
import { applyBatch } from './undo'
import { t } from './i18n'

export interface UndoableResult {
  /** The undo entry (null when nothing changed). */
  entry: AssistantUndo | null
  /** What the toast says. */
  label: string
}

async function apply(changes: Change[], label: string): Promise<UndoableResult> {
  await getDeviceId()
  const entry = await applyBatch(await toProposed(changes, await membershipMap()), { source: 'action', label })
  return { entry, label }
}

/** Complete (subtree, or a series rolling forward) or reopen one task. */
export async function completeUndoable(id: string, completed: boolean, opts: { now?: number; today?: string } = {}): Promise<UndoableResult> {
  const { tasks, all } = await readTicked([id])
  const task = tasks[0]
  if (!task) return { entry: null, label: '' }
  const changes = completed ? planComplete([task], all, opts.now ?? Date.now(), opts.today ?? todayISO()) : planReopen([task])
  return apply(changes, completed ? t('Task completed') : t('Task reopened'))
}

/** Move one task and its subtasks to the Trash. */
export async function trashUndoable(id: string, now = Date.now()): Promise<UndoableResult> {
  const { tasks, all } = await readTicked([id])
  if (!tasks[0]) return { entry: null, label: '' }
  return apply(planTrash(tasks, all, now), t('Moved to Trash'))
}

/**
 * Move one task (with its subtree) to a project; across sharing scopes it becomes
 * a copy, whose id is returned so the panel can follow it.
 */
export async function moveUndoable(id: string, projectId: string | null, targetName: string, now = Date.now()): Promise<UndoableResult & { newId: string }> {
  const { tasks, all } = await readTicked([id])
  const task = tasks[0]
  if (!task || (task.project_id ?? null) === projectId) return { entry: null, label: '', newId: id }
  const memberships = await membershipMap()
  const changes = planMove([task], all, { projectId }, memberships, await currentUserId(), now)
  const copy = changes.find((c) => c.entity === 'task' && c.entityId !== id && c.patch.title !== undefined && !c.patch.deleted_at && c.patch.parent_id === (task.parent_id ?? null))
  const r = await apply(changes, t('Moved to {target}', { target: targetName }))
  return { ...r, newId: copy?.entityId ?? id }
}

/** Set or clear the due of one task (the value is already in the task's own zone). */
export async function dueUndoable(id: string, due: Task['due']): Promise<UndoableResult> {
  return apply([{ entity: 'task', entityId: id, patch: { due } }], due ? t('Date changed') : t('Date removed'))
}

/** Park one task in Someday: no date, not an evening task. */
export async function parkUndoable(id: string): Promise<UndoableResult> {
  const { tasks } = await readTicked([id])
  const task = tasks[0]
  if (!task) return { entry: null, label: '' }
  const patch: Partial<Task> = { start: 'someday' }
  if (task.due) patch.due = null
  if (task.evening) patch.evening = false
  return apply([{ entity: 'task', entityId: id, patch }], t('Moved to Someday'))
}
