// Single-action undo (OpenSpec change ux-overhaul, task-list-presentation
// "Completion feedback" and "Single-action undo"): completing, deleting, moving,
// rescheduling and parking one task are applied as one undoable batch, the same
// way bulk actions are (bulk-edit D5). The inverse is stored with the clocks each
// field got; undo writes ordinary ops, locally first, so it works offline and
// every device converges by last-writer-wins.
import { planComplete, planLabels, planMove, planReopen, planTrash, readTicked, toProposed } from './bulk'
import { db, type AssistantUndo } from './db'
import { logicalToday } from './dates'
import { getDeviceId, planReminders, type Change } from './ops'
import type { ReminderPhrase } from './nlp'
import { currentUserId, membershipMap } from './sharing'
import type { FilterContext } from './filter'
import { planRule, ruleParts, type RuleNames } from './rules'
import type { Task, View } from './types'
import { applyBatch } from './undo'
import { compileView } from './views'
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
  const changes = completed ? planComplete([task], all, opts.now ?? Date.now(), opts.today ?? logicalToday()) : planReopen([task])
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

/**
 * Move tasks dropped on a sidebar project or the Inbox (OpenSpec change
 * ux-feedback-2, project-organization "Drop a task on a project"): as the Move
 * action does, as one batch; tasks already in that project are left alone.
 */
export async function moveManyUndoable(ids: readonly string[], projectId: string | null, targetName: string, now = Date.now()): Promise<UndoableResult> {
  const { tasks, all } = await readTicked(ids)
  const moving = tasks.filter((task) => (task.project_id ?? null) !== projectId)
  if (!moving.length) return { entry: null, label: '' }
  const changes = planMove(moving, all, { projectId }, await membershipMap(), await currentUserId(), now)
  return apply(changes, t('Moved to {target}', { target: targetName }))
}

/**
 * Add a label to tasks dropped on it (labels "Drop a task on a label"): one batch,
 * the other labels kept; when every task already has it, nothing is written and
 * the label says so.
 */
export async function addLabelUndoable(ids: readonly string[], labelId: string, labelName: string): Promise<UndoableResult> {
  const { tasks } = await readTicked(ids)
  const changes = planLabels(tasks, labelId, true)
  if (!changes.length) return { entry: null, label: tasks.length === 1 ? t('Already has {label}', { label: labelName }) : t('These tasks already have {label}', { label: labelName }) }
  return apply(changes, t('Added {label}', { label: labelName }))
}

/**
 * A drop on a sidebar target (ux-feedback-2 D4): `project:<id>` and `inbox` move,
 * `label:<id>` adds the label. Null when the target no longer exists.
 */
export async function dropUndoable(target: string, ids: readonly string[]): Promise<UndoableResult | null> {
  if (target === 'inbox') return moveManyUndoable(ids, null, t('Inbox'))
  if (target.startsWith('project:')) {
    const project = await db.projects.get(target.slice('project:'.length))
    return project && !project.deleted_at ? moveManyUndoable(ids, project.id, project.name) : null
  }
  if (target.startsWith('label:')) {
    const label = await db.labels.get(target.slice('label:'.length))
    return label && !label.deleted_at ? addLabelUndoable(ids, label.id, label.name) : null
  }
  return null
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

export interface DropResult extends UndoableResult {
  /** The task's id afterwards (a copy's id after a move across sharing scopes). */
  taskId: string
  /** Whether the task matches the column's filter once the rule has run. */
  matches: boolean
  /** False when the task already matched the rule and nothing was written. */
  changed: boolean
  /** The task's row after the drop (its clocks tell a later change apart). */
  row?: Task
}

/**
 * Drop one task on a board column (rule-boards D5): the column view's on-drop
 * rule planned by planRule and applied as one undoable batch, locally first.
 * The label names the column and the changes, and says when the task still does
 * not match the column's filter afterwards (the board then holds the card, D6).
 */
export async function dropOnPanel(taskId: string, view: Pick<View, 'name' | 'query' | 'on_drop'>,
  ctx: { filter: FilterContext; names: RuleNames; now?: number; today?: string }): Promise<DropResult> {
  const now = ctx.now ?? Date.now()
  const today = ctx.today ?? ctx.filter.today ?? logicalToday()
  const { tasks, all } = await readTicked([taskId])
  const task = tasks[0]
  if (!task) return { entry: null, label: '', taskId, matches: false, changed: false }
  const memberships = await membershipMap()
  const changes = planRule(task, all, view.on_drop, { now, today, labels: ctx.names.labels, memberships, me: await currentUserId() })
  const column = view.name
  if (changes.length === 0) {
    return { entry: null, label: t('{task} already matches {column}', { task: task.title || t('Untitled'), column }), taskId, matches: true, changed: false }
  }
  // The task after the batch: a copy created by a move across scopes, else the row patched.
  const known = new Set(all.map((x) => x.id))
  const copy = changes.find((c) => c.entity === 'task' && !known.has(c.entityId) && c.patch.title !== undefined && c.patch.parent_id === (task.parent_id ?? null))
  const own = changes.filter((c) => c.entity === 'task' && c.entityId === task.id).reduce((acc, c) => ({ ...acc, ...c.patch }), {})
  const after = (copy ? { ...task, ...copy.patch, id: copy.entityId } : { ...task, ...own }) as Task
  const compiled = compileView(view, { ...ctx.filter, today })
  const matches = compiled.ok && compiled.test(after)
  let label = t('Moved to {column}: {changes}', { column, changes: ruleParts(view.on_drop, ctx.names).join(', ') })
  if (!matches) label = `${label} ${t('It does not match the column’s filter.')}`
  const r = await apply(changes, label)
  return { ...r, taskId: after.id, matches, changed: true, row: await db.tasks.get(after.id) }
}

/**
 * A title edit with what it set (smart-title-tokens D5): the fields, the labels added
 * and any reminders, written as one undoable batch. Recurrence and project moves go
 * through their own helpers before this (they plan series and scopes).
 */
export async function titleEditUndoable(id: string, patch: Partial<Task>, reminders: ReminderPhrase[] = []): Promise<UndoableResult> {
  const task = (await readTicked([id])).tasks[0]
  if (!task) return { entry: null, label: '' }
  const due = 'due' in patch ? patch.due ?? null : task.due
  const changes: Change[] = []
  if (Object.keys(patch).length) changes.push({ entity: 'task', entityId: id, patch })
  changes.push(...planReminders(id, due, reminders))
  if (!changes.length) return { entry: null, label: '' }
  return apply(changes, t('Task updated'))
}

