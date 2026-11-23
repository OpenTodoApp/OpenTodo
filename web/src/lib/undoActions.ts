// Single-action undo (OpenSpec change ux-overhaul, task-list-presentation
// "Completion feedback" and "Single-action undo"): completing, deleting, moving,
// rescheduling and parking one task are applied as one undoable batch, the same
// way bulk actions are (bulk-edit D5). The inverse is stored with the clocks each
// field got; undo writes ordinary ops, locally first, so it works offline and
// every device converges by last-writer-wins.
import { bulkLabel, planComplete, planLabels, planMove, planPriority, planReopen, planTrash, readTicked, toProposed } from './bulk'
import { db, type AssistantUndo } from './db'
import { formatDate, logicalToday } from './dates'
import { seriesRule } from './recurring'
import { getDeviceId, liveSubtree, parkTask, planReminders, updateTask, type Change } from './ops'
import type { ReminderPhrase } from './nlp'
import { currentUserId, memberName, membershipMap } from './sharing'
import type { FilterContext } from './filter'
import { planRule, ruleParts, type RuleNames } from './rules'
import type { Task, View } from './types'
import { applyBatch } from './undo'
import { compileView } from './views'
import { t } from './i18n'
import { uuid } from './ids'
import { linkChanges } from './linkAttachment'
import { originOf } from './taskOrigin'
import { labelKey } from './labels'
import { descendants } from './tree'
import { dayPartFields, dayPartName, dayPartOf, doOnPatch, type DayPart, type DoOnChoice } from './dayParts'
import { energyName, type Energy } from './energy'
import { sectorPatch } from './sectorWrites'
import { planDayDrop } from './dayDrop'
import { planTasksMove, type TaskTarget } from './move'
import { replanChanges, type ReplanProposal, type UnfitChoice } from './replan'
import { keepWorkspaceFor, Partition, readWorkspaceState, workspaceIdFor } from './workspaces'

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
export async function completeUndoable(id: string, completed: boolean, opts: { now?: number; today?: string } = {}): Promise<UndoableResult & { completed?: boolean }> {
  // A plain task needs only its subtree; a series plans its roll over every task
  // (its occurrence records). Reading all 10,000 tasks of a large account for every
  // tick queued the next writes behind it (list-rendering-at-scale).
  const own = await db.tasks.get(id)
  const { tasks, all } = own && !own.deleted_at && !seriesRule(own)
    ? await liveSubtree(id).then((rows) => ({ tasks: [own], all: rows }))
    : await readTicked([id])
  const task = tasks[0]
  if (!task) return { entry: null, label: '' }
  const changes = completed ? planComplete([task], all, opts.now ?? Date.now(), opts.today ?? logicalToday(), await membershipMap()) : planReopen([task])
  const result = await apply(changes, completed ? t('Task completed') : t('Task reopened'))
  return { ...result, completed: completed && !task.completed_at && !!result.entry }
}

/** Whether two field values are the same: an object (a due, a location) compared with its keys in one order. */
function sameValue(a: unknown, b: unknown): boolean {
  const key = (v: unknown) => JSON.stringify(v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y))) : v ?? null)
  return key(a) === key(b)
}

/**
 * One task's fields that updateTask writes as they are (no date, start or project rules), as
 * one step of undo history (OpenSpec change undo-estimate). Planned from the one row; a field
 * already at that value is left out and nothing at all records nothing. A repeating task goes
 * through updateTask as before, so the change carries to its series and follows the panel's
 * scope, without a step.
 */
async function plainEditUndoable(id: string, patch: Partial<Task>, label: string): Promise<UndoableResult> {
  const task = await db.tasks.get(id)
  if (!task || task.recurrence) {
    await updateTask(id, patch)
    return { entry: null, label: '' }
  }
  const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => !sameValue((task as unknown as Record<string, unknown>)[k], v)))
  if (!Object.keys(changed).length) return { entry: null, label: '' }
  return apply([{ entity: 'task', entityId: id, patch: changed }], label)
}

/** Set or with null clear one task's location, as one step of undo history (OpenSpec change undo-panel-extras). */
export function locationUndoable(id: string, location: Task['location'] | null): Promise<UndoableResult> {
  return plainEditUndoable(id, { location }, location ? t('Task updated') : t('Location removed'))
}

/** Remove one task's origin (the task panel's Remove origin), as one step of undo history (undo-panel-extras). */
export function originRemovedUndoable(id: string): Promise<UndoableResult> {
  return plainEditUndoable(id, { origin: null }, t('Task updated'))
}

/**
 * A date move from the keyboard (Month, Plan, Day and Week, a span's ends) or in the timeline
 * (keys and drags), as one step of undo history named "Rescheduled", or for a length key that
 * changes only the estimate "Estimate {to} min" (OpenSpec change
 * undo-calendar-moves). The patch is already in the task's own zone. A field already at that value
 * is left out, and nothing at all records nothing. A date on a parked task takes it out of Someday
 * in the same step, as updateTask does. A repeating task goes through updateTask as before, without
 * a step, so the move carries to its series.
 */
export async function calendarEditUndoable(id: string, patch: Partial<Task>): Promise<UndoableResult> {
  const task = await db.tasks.get(id)
  if (!task || task.recurrence) {
    await updateTask(id, patch)
    return { entry: null, label: '' }
  }
  const changed: Partial<Task> = Object.fromEntries(Object.entries(patch).filter(([k, v]) => !sameValue((task as unknown as Record<string, unknown>)[k], v)))
  if (!Object.keys(changed).length) return { entry: null, label: '' }
  if (changed.due && !('start' in patch) && task.start === 'someday') changed.start = null
  // The Day and Week length keys change only the estimate: named as the panel's estimate step.
  const minutes = changed.estimate_minutes
  const label = Object.keys(changed).length === 1 && minutes !== undefined
    ? (minutes ? t('Estimate {to} min', { to: String(minutes) }) : t('Estimate removed'))
    : t('Rescheduled')
  return apply([{ entity: 'task', entityId: id, patch: changed }], label)
}

/** Rename one task, as one step of undo history named with both titles (OpenSpec change undo-rename). */
export async function titleUndoable(id: string, title: string): Promise<UndoableResult> {
  // Each title clipped to 50 characters, as the assistant names the same change.
  const clip = (s: string) => (s.length > 50 ? s.slice(0, 49) + '…' : s)
  const from = (await db.tasks.get(id))?.title ?? ''
  return plainEditUndoable(id, { title }, t('Renamed “{from}” → “{to}”', { from: clip(from), to: clip(title) }))
}

/** Set (or with null remove) one task's estimate in minutes, as one step of undo history. */
export function estimateUndoable(id: string, minutes: number | null): Promise<UndoableResult> {
  return plainEditUndoable(id, { estimate_minutes: minutes }, minutes ? t('Estimate {to} min', { to: String(minutes) }) : t('Estimate removed'))
}

/**
 * Set one task's priority as one step of undo history (OpenSpec change undo-priority): the bulk
 * action's plan and words for one task, no toast. A task already at that priority records nothing.
 * A repeating task is written as before, through updateTask.
 */
export async function priorityUndoable(id: string, priority: Task['priority']): Promise<void> {
  const task = await db.tasks.get(id)
  // A series' edit carries to its occurrences and follows the panel's scope (This and following,
  // Also past ones), which updateTask plans: a repeating task keeps that path, without a step.
  if (!task || task.recurrence) {
    await updateTask(id, { priority })
    return
  }
  // The one row, not readTicked's whole table: a key press stays cheap on a large account.
  const changes = planPriority([task], priority)
  if (changes.length) await apply(changes, bulkLabel({ kind: 'priority', priority }, 1))
}

/** Set (or with null remove) one task's deadline, as one step of undo history (OpenSpec change undo-deadline). */
export function deadlineUndoable(id: string, deadline: string | null): Promise<UndoableResult> {
  return plainEditUndoable(id, { deadline }, deadline ? t('Deadline {date}', { date: formatDate(deadline, 'long') }) : t('Deadline removed'))
}

/**
 * Assign one task to a member, or with null unassign it, as one step of undo history (OpenSpec
 * change undo-assignee). The step is named with the member's name, or "you" for the person.
 */
export async function assigneeUndoable(id: string, assignee: string | null): Promise<UndoableResult> {
  const name = assignee && assignee !== await currentUserId() ? memberName(assignee, await membershipMap()) ?? t('Former member') : null
  const label = !assignee ? t('Unassigned') : name ? t('Assigned to {name}', { name }) : t('Assigned to you')
  return plainEditUndoable(id, { assignee_id: assignee }, label)
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
export async function moveUndoable(id: string, projectId: string | null, targetName: string, now = Date.now(), toWorkspace?: string): Promise<UndoableResult & { newId: string }> {
  const { tasks, all } = await readTicked([id])
  const task = tasks[0]
  // "No project" of another workspace (workspaces, "Move an Inbox task"): the task lands
  // in that workspace's Inbox. A subtask follows its parent's workspace, so it leaves it.
  const target = projectId === null && toWorkspace !== undefined ? workspaceIdFor(toWorkspace, (await readWorkspaceState()).list) : undefined
  if (task && target !== undefined && task.project_id == null) {
    if ((task.workspace_id ?? null) === target && !task.parent_id) return { entry: null, label: '', newId: id }
    const patch = task.parent_id ? { workspace_id: target, parent_id: null } : { workspace_id: target }
    return { ...(await apply([{ entity: 'task', entityId: id, patch }], t('Moved to {target}', { target: targetName }))), newId: id }
  }
  if (!task || (task.project_id ?? null) === projectId) return { entry: null, label: '', newId: id }
  const memberships = await membershipMap()
  const keep = target !== undefined ? () => target : await keepWorkspaceFor()
  const changes = planMove([task], all, { projectId }, memberships, await currentUserId(), now, keep)
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
  const changes = planMove(moving, all, { projectId }, await membershipMap(), await currentUserId(), now, await keepWorkspaceFor())
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
  // The sidebar's Today (drop-on-today): planned for today as a drop on today's day group is.
  if (target === 'today') return todayDropUndoable(ids)
  if (target.startsWith('project:')) {
    const project = await db.projects.get(target.slice('project:'.length))
    return project && !project.deleted_at ? moveManyUndoable(ids, project.id, project.name) : null
  }
  if (target.startsWith('label:')) {
    const label = await db.labels.get(target.slice('label:'.length))
    return label && !label.deleted_at ? addLabelUndoable(ids, label.id, label.name) : null
  }
  // Today's part headings (day-parts D4).
  if (target.startsWith('part:')) {
    const part = target.slice('part:'.length)
    if (part === 'none') return dayPartUndoable(ids, null)
    return part === 'morning' || part === 'afternoon' || part === 'evening' ? dayPartUndoable(ids, part) : null
  }
  // Upcoming's day groups (upcoming-drag).
  if (target.startsWith('day:')) {
    const date = target.slice('day:'.length)
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? dayDropUndoable(ids, date) : null
  }
  return null
}

/** Several ticked tasks dropped together among a list's rows (drag-ticked-together D3): one batch with Undo. */
export async function moveTasksUndoable(ids: readonly string[], target: TaskTarget): Promise<UndoableResult | null> {
  const changes = await planTasksMove(ids, target)
  if (!changes) return null
  return apply(changes, t('{n, plural, one {# task moved} other {# tasks moved}}', { n: ids.length }))
}

/** Put tasks on a day as a drop on the calendar does (upcoming-drag): one batch with Undo; tasks already there write nothing. */
export async function dayDropUndoable(ids: readonly string[], date: string, today = logicalToday()): Promise<UndoableResult> {
  const { tasks } = await readTicked(ids)
  const changes = planDayDrop(tasks, date, today)
  // Already on that day: Upcoming keeps its date order, so the drop says why nothing moved (#1507).
  if (!changes.length) return { entry: null, label: t('Lists sorted by date or priority keep their order.') }
  return apply(changes, changes.length === 1 ? t('Date changed') : t('{n, plural, one {# task moved} other {# tasks moved}}', { n: changes.length }))
}

/** Plan tasks for today, dropped on the sidebar's Today (drop-on-today): the rule of a day drop, one batch with Undo. */
export async function todayDropUndoable(ids: readonly string[], today = logicalToday()): Promise<UndoableResult> {
  const { tasks } = await readTicked(ids)
  const changes = planDayDrop(tasks, today, today)
  if (!changes.length) return { entry: null, label: '' }
  return apply(changes, changes.length === 1 ? t('Scheduled for today') : t('{n, plural, one {# task scheduled for today} other {# tasks scheduled for today}}', { n: changes.length }))
}

/** Set a project's or a section's flow (project-flow-modes): one op, with Undo. */
export async function flowUndoable(entity: 'project' | 'section' | 'task', id: string, flow: string, label: string): Promise<UndoableResult> {
  await getDeviceId()
  const entry = await applyBatch([{ entity, entityId: id, patch: { flow_mode: flow }, base: { flow_mode: '' } }], { source: 'action', label })
  return { entry, label }
}

/** Set this user's review interval for a project (project-review-cadence): one personal op, with Undo. */
export async function reviewEveryUndoable(projectId: string, every: string, label: string): Promise<UndoableResult> {
  await getDeviceId()
  const entry = await applyBatch([{ entity: 'project_prefs', entityId: projectId, patch: { review_every: every }, base: { review_every: '' } }], { source: 'action', label })
  return { entry, label }
}

/**
 * Archive several projects at once (archive-several-projects, GitHub issue 1661): each
 * project and its live sub-projects, as archiving one does, in one batch with one Undo.
 * A project already archived, or listed twice through its parent, is written once.
 */
export async function archiveProjectsUndoable(ids: readonly string[]): Promise<UndoableResult> {
  const all = (await db.projects.toArray()).filter((p) => !p.deleted_at)
  const seen = new Set<string>()
  const changes: Change[] = []
  for (const id of ids) {
    for (const pid of [id, ...descendants(id, all)]) {
      const p = all.find((x) => x.id === pid)
      if (!p || p.archived || seen.has(pid)) continue
      seen.add(pid)
      changes.push({ entity: 'project', entityId: pid, patch: { archived: true } })
    }
  }
  if (changes.length === 0) return { entry: null, label: '' }
  return apply(changes, t('Archived {projects}', { projects: t('{n, plural, one {# project} other {# projects}}', { n: ids.length }) }))
}

/** Put a project in maintenance or end it (project-review-cadence): one shared op, with Undo. */
export async function projectStatusUndoable(projectId: string, status: 'active' | 'maintenance', label: string): Promise<UndoableResult> {
  await getDeviceId()
  const entry = await applyBatch([{ entity: 'project', entityId: projectId, patch: { status }, base: { status: '' } }], { source: 'action', label })
  return { entry, label }
}

/**
 * Apply a re-plan (replan-the-day D4): every move, and with "Move to tomorrow" every
 * unfit task, as one batch of `due` edits with one Undo. Each task is checked again
 * right before writing; those that changed meanwhile are skipped and the label says how many.
 */
export async function replanUndoable(proposal: ReplanProposal, opts: { today: string; choice: UnfitChoice; stored: ReadonlyMap<string, Task['due']>; zone?: string }): Promise<UndoableResult> {
  const ids = [...proposal.moves, ...(opts.choice === 'tomorrow' ? proposal.unfit : [])].map((m) => m.id)
  const { tasks } = await readTicked(ids)
  const { changes, skipped } = replanChanges(proposal, { ...opts, live: new Map(tasks.map((tk) => [tk.id, tk])), memberships: await membershipMap() })
  const label = skipped > 0
    ? t('{moved} moved · {skipped} changed meanwhile', { moved: changes.length, skipped })
    : t('{n, plural, one {# task moved} other {# tasks moved}}', { n: changes.length })
  return changes.length ? apply(changes, label) : { entry: null, label }
}

/** Set or clear the due of one task (the value is already in the task's own zone). */
export async function dueUndoable(id: string, due: Task['due']): Promise<UndoableResult> {
  return apply([{ entity: 'task', entityId: id, patch: { due } }], due ? t('Date changed') : t('Date removed'))
}

/** A new start that keeps the end: the due and the estimate in one change (the calendar block's upper edge, GitHub issue 355). */
export async function rescheduleUndoable(id: string, due: NonNullable<Task['due']>, estimate: number): Promise<UndoableResult> {
  return apply([{ entity: 'task', entityId: id, patch: { due, estimate_minutes: estimate } }], t('Rescheduled'))
}

/** A span moved or resized, or a task made a span (multi-day-tasks D4): start, due and the flag in one change. */
export async function spanUndoable(id: string, patch: Pick<Partial<Task>, 'start' | 'due' | 'span'>): Promise<UndoableResult> {
  return apply([{ entity: 'task', entityId: id, patch }], t('Rescheduled'))
}

/** Park one task in Someday: no date, not an evening task. */
export async function parkUndoable(id: string): Promise<UndoableResult> {
  const { tasks } = await readTicked([id])
  const task = tasks[0]
  if (!task) return { entry: null, label: '' }
  // A repeating task: clearing its date ends the repetition, which updateTask plans; it is parked
  // as before, without a step (undo-row-schedule).
  if (task.recurrence) {
    await parkTask(id)
    return { entry: null, label: '' }
  }
  const patch: Partial<Task> = { start: 'someday' }
  if (task.due) patch.due = null
  if (task.evening) patch.evening = false
  return apply([{ entity: 'task', entityId: id, patch }], t('Moved to Someday'))
}

/** The toast after a part is set: "Moved to Morning", "Moved to Any time". */
const movedTo = (part: DayPart | null) => (part ? t('Moved to {part}', { part: dayPartName(part) }) : t('Moved to Any time'))

/**
 * Set the part of the day of tasks (day-parts D2): both fields in one batch per
 * task, with Undo; a task already in that part writes nothing.
 */
export async function dayPartUndoable(ids: readonly string[], part: DayPart | null): Promise<UndoableResult> {
  const { tasks } = await readTicked(ids)
  const fields = dayPartFields(part)
  const changes: Change[] = tasks
    .filter((task) => dayPartOf(task) !== part || (task.day_part ?? null) !== fields.day_part)
    .map((task) => ({ entity: 'task', entityId: task.id, patch: { ...fields } }))
  if (!changes.length) return { entry: null, label: '' }
  return apply(changes, movedTo(part))
}

/**
 * Mark one task for This Evening, or take it out (OpenSpec change undo-evening): the same two
 * fields as before, as one step of undo history, no toast; planned from the one row. A task
 * already there records nothing. A repeating task is written as before, through updateTask,
 * so the change carries to its series and follows the panel's scope.
 */
export async function eveningUndoable(id: string, evening: boolean): Promise<void> {
  const part: DayPart | null = evening ? 'evening' : null
  const fields = dayPartFields(part)
  const task = await db.tasks.get(id)
  if (!task || task.recurrence) {
    await updateTask(id, fields)
    return
  }
  if (dayPartOf(task) === part && (task.day_part ?? null) === fields.day_part) return
  await apply([{ entity: 'task', entityId: id, patch: { ...fields } }], movedTo(part))
}

/**
 * A choice of the Do on segment's time of day row, or a typed date with a time
 * (when-picker D2, D4): the part or the time with what it clears, one batch with Undo.
 */
export async function doOnUndoable(id: string, choice: DoOnChoice, zone?: string): Promise<UndoableResult> {
  const task = await db.tasks.get(id)
  const patch = task && doOnPatch(task, choice, zone)
  if (!patch) return { entry: null, label: '' }
  const label = 'part' in choice ? movedTo(choice.part) : t('Date changed')
  return apply([{ entity: 'task', entityId: id, patch }], label)
}

/** Set (or with null clear) the energy of the ticked tasks (task-energy D6): one batch, with Undo. */
export async function energyUndoable(ids: readonly string[], energy: Energy | null): Promise<UndoableResult> {
  const { tasks } = await readTicked(ids)
  const changes: Change[] = tasks
    .filter((task) => (task.energy ?? '') !== (energy ?? ''))
    .map((task) => ({ entity: 'task', entityId: task.id, patch: { energy: energy ?? '' } }))
  if (!changes.length) return { entry: null, label: '' }
  return apply(changes, energy ? t('Energy set to {level}', { level: energyName(energy) }) : t('Energy cleared'))
}

export interface SectorResult extends UndoableResult {
  /** Repeating tasks left as they are: they keep a date (time-sectors D2). */
  skipped: number
}

/**
 * Plan the tasks for a time sector, or with '' clear it (time-sectors D2, D6): one
 * batch writing the sector and clearing each task's do-on date, start and evening,
 * with one Undo. Repeating tasks keep their date and are counted, not changed.
 */
export async function sectorUndoable(ids: readonly string[], sector: string, name = ''): Promise<SectorResult> {
  const { tasks } = await readTicked(ids)
  const repeating = sector ? tasks.filter((task) => !!task.recurrence) : []
  const changes: Change[] = tasks
    .filter((task) => !repeating.includes(task))
    .map((task): Change => ({ entity: 'task', entityId: task.id, patch: sectorPatch(task, sector) }))
    .filter((c) => Object.keys(c.patch).length > 0)
  if (!changes.length) return { entry: null, label: '', skipped: repeating.length }
  const label = sector
    ? t('{n, plural, one {Planned for {name}} other {# tasks planned for {name}}}', { n: changes.length, name })
    : t('Time sector cleared')
  return { ...(await apply(changes, label)), skipped: repeating.length }
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
export async function titleEditUndoable(id: string, patch: Partial<Task>, reminders: ReminderPhrase[] = [], links: string[] = []): Promise<UndoableResult> {
  const task = (await readTicked([id])).tasks[0]
  if (!task) return { entry: null, label: '' }
  const due = 'due' in patch ? patch.due ?? null : task.due
  const changes: Change[] = []
  if (Object.keys(patch).length) changes.push({ entity: 'task', entityId: id, patch })
  changes.push(...planReminders(id, due, reminders))
  // Links typed in the edit become link attachments in the same change (quick-add-links D5).
  if (links.length) {
    const existing = (await db.attachments.where('task_id').equals(id).toArray()).flatMap((a) => (a.url && !a.deleted_at && !a.comment_id ? [a.url] : []))
    changes.push(...linkChanges(id, links, await currentUserId(), { origin: originOf(task)?.url, existing, id: uuid }))
  }
  if (!changes.length) return { entry: null, label: '' }
  return apply(changes, t('Task updated'))
}


/**
 * "Move to workspace…" on a project (OpenSpec change workspaces, design D7):
 * one workspace_id op on the project (its sub-projects, sections and tasks
 * follow), and the labels on its tasks re-matched by name to labels of the
 * target workspace, a missing one created there, all as one batch with Undo.
 */
export async function moveProjectToWorkspaceUndoable(projectId: string, target: string, targetName: string): Promise<UndoableResult> {
  const [state, projects, labels, tasks] = await Promise.all([readWorkspaceState(), db.projects.toArray(), db.labels.toArray(), db.tasks.toArray()])
  const project = projects.find((p) => p.id === projectId)
  if (!project) return { entry: null, label: '' }
  const part = new Partition(state.defaultId, state.list.map((w) => w.id), projects)
  const value = workspaceIdFor(target, state.list)
  // The project and every sub-project under it.
  const inTree = new Set([projectId])
  for (let grew = true; grew;) {
    grew = false
    for (const p of projects) if (p.parent_id && inTree.has(p.parent_id) && !inTree.has(p.id)) { inTree.add(p.id); grew = true }
  }
  const byId = new Map(labels.map((l) => [l.id, l]))
  const there = new Map(labels.filter((l) => !l.deleted_at && part.own(l.workspace_id) === part.own(target)).map((l) => [labelKey(l.name), l.id]))
  // A sub-project follows its root's workspace (#1660): it leaves its parent, and
  // becomes a top-level project of the target with its own sub-projects and tasks.
  const changes: Change[] = [{ entity: 'project', entityId: projectId, patch: project.parent_id ? { workspace_id: value, parent_id: null } : { workspace_id: value } }]
  const now = Date.now()
  const mapLabel = (id: string): string => {
    const l = byId.get(id)
    if (!l || part.own(l.workspace_id) === part.own(target)) return id
    const key = labelKey(l.name)
    let to = there.get(key)
    if (!to) {
      to = uuid()
      there.set(key, to)
      changes.push({ entity: 'label', entityId: to, patch: { name: l.name, color: l.color, position: now, created_at: now, deleted_at: null, workspace_id: value } })
    }
    return to
  }
  for (const task of tasks) {
    if (!task.project_id || !inTree.has(task.project_id) || !task.labels?.length) continue
    const next = task.labels.map(mapLabel)
    if (next.some((id, i) => id !== task.labels[i])) changes.push({ entity: 'task', entityId: task.id, patch: { labels: next } })
  }
  return apply(changes, t('Moved to {target}', { target: targetName }))
}
