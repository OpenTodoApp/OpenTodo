// Bulk actions on ticked tasks (OpenSpec change bulk-edit, design D4): pure planners
// that turn one action on many tasks into ONE list of field changes, merged per
// entity, written with a single mutateMany through the undo store (lib/undo.ts).
// They reuse the single-task rules (recurring roll-forward, subtree completion and
// trash, project moves across sharing scopes) so a batch behaves like the keys.
import { useLiveQuery } from 'dexie-react-hooks'
import type { ProposedChange } from './assistantTypes'
import { addDaysISO, logicalToday, weekStartOf } from './dates'
import { db, tableOf } from './db'
import { memberSet } from './rotation'
import { getDeviceId, keepsSubtasksNow, planCompletePlain, planProjectChange, type Change } from './ops'
import { planCompletion, seriesRule, skipsInstead } from './recurring'
import { refusedSeries, withNotMoved } from './seriesDates'
import { assignableIn, canEditTask, currentUserId, membershipMap, scopeOf } from './sharing'
import { descendants } from './tree'
import { isScheduled } from './inbox'
import type { Membership, Priority, Task } from './types'
import { applyBatch } from './undo'
import { t } from './i18n'
import { isNoPriority, priorityName } from './priority'
import { keepWorkspaceFor, type KeepWorkspace } from './workspaces'

/** Changes merged by entity: a task reached twice (ticked and under a ticked parent) gets one patch. */
export function mergeChanges(changes: Change[]): Change[] {
  const out = new Map<string, Change>()
  for (const c of changes) {
    const k = `${c.entity}:${c.entityId}`
    const prev = out.get(k)
    out.set(k, prev ? { ...prev, patch: { ...prev.patch, ...c.patch } } : { ...c, patch: { ...c.patch } })
  }
  return [...out.values()]
}

/** True when every task is completed: the batch reopens instead of completing. */
export const allCompleted = (tasks: readonly Task[]): boolean => tasks.length > 0 && tasks.every((task) => !!task.completed_at)

/** Complete the open tasks (series roll forward, subtrees complete), or reopen when all are completed. */
export function planComplete(tasks: readonly Task[], all: Task[], now: number, today: string, memberships?: Map<string, Membership>, keep = false): Change[] {
  if (allCompleted(tasks)) return planReopen(tasks)
  const out: Change[] = []
  for (const task of tasks) {
    if (task.completed_at) continue
    const rule = seriesRule(task)
    const members = task.project_id ? memberSet(memberships?.get(task.project_id)) : undefined
    const plan = rule ? planCompletion(task, rule, all, now, today, members) : null
    if (plan && plan.kind === 'roll') out.push(...plan.changes)
    else out.push(...planCompletePlain(task.id, all, now, keep))
  }
  return mergeChanges(out)
}

export function planReopen(tasks: readonly Task[]): Change[] {
  return tasks.filter((task) => task.completed_at).map((tk) => ({ entity: 'task', entityId: tk.id, patch: { completed_at: null } }))
}

export function planPriority(tasks: readonly Task[], p: Priority): Change[] {
  return tasks.filter((task) => task.priority !== p).map((tk) => ({ entity: 'task', entityId: tk.id, patch: { priority: p } }))
}

export type DuePick = 'today' | 'tomorrow' | 'next-week' | null | string

/** The date of a pick; "Next week" is the first day of the following week per the user's week start. */
export function dateOfPick(pick: Exclude<DuePick, null>, today = logicalToday()): string {
  if (pick === 'today') return today
  if (pick === 'tomorrow') return addDaysISO(today, 1)
  if (pick === 'next-week') return weekStartOf(addDaysISO(today, 7))
  return pick
}

/** Reschedule; an existing time and zone are kept. No date ends a recurrence; a date un-parks. */
export function planDue(tasks: readonly Task[], pick: DuePick, today = logicalToday()): Change[] {
  return tasks.map((task): Change => {
    if (pick === null) return { entity: 'task', entityId: task.id, patch: task.recurrence ? { due: null, recurrence: null } : { due: null } }
    const date = dateOfPick(pick, today)
    const due = task.due?.time ? { ...task.due, date } : { date }
    return { entity: 'task', entityId: task.id, patch: task.start === 'someday' ? { due, start: null } : { due } }
  })
}

/** Add a label to (or remove it from) every task, from each task's current array. */
export function planLabels(tasks: readonly Task[], labelId: string, add: boolean): Change[] {
  return tasks.flatMap((task): Change[] => {
    const has = task.labels.includes(labelId)
    if (add === has) return []
    return [{ entity: 'task', entityId: task.id, patch: { labels: add ? [...task.labels, labelId] : task.labels.filter((l) => l !== labelId) } }]
  })
}

/** Move to the Trash with their subtrees, one tombstone per task. */
export function planTrash(tasks: readonly Task[], all: Task[], now: number): Change[] {
  const ids = new Set<string>()
  for (const task of tasks) {
    ids.add(task.id)
    for (const d of descendants(task.id, all)) ids.add(d)
  }
  const byId = new Map(all.map((tk) => [tk.id, tk]))
  return [...ids].map((id) => {
    const task = byId.get(id)
    // Deleting an open occurrence of a live series skips it, never trashes it
    // (series-exceptions D3): a trashed record would free the date at purge.
    if (task && skipsInstead(task, byId)) return { entity: 'task', entityId: id, patch: { completed_at: now, skipped: true } }
    return { entity: 'task', entityId: id, patch: { deleted_at: now } }
  })
}

/** Ticked tasks whose ancestor is also ticked move with it, not on their own. */
function topmost(tasks: readonly Task[], all: Task[]): Task[] {
  const ticked = new Set(tasks.map((task) => task.id))
  return tasks.filter((tk) => ![...ticked].some((other) => other !== tk.id && descendants(other, all).has(tk.id)))
}

/**
 * A move to the Inbox (OpenSpec change inbox-drop-unplaces): `inbox` also clears
 * the schedule, so the task without a project is an Inbox task (lib/inbox.ts).
 * Only with `projectId: null`; a drop into a "No project" group keeps the date.
 */
export type MoveTarget = { projectId: string | null; sectionId?: string | null; inbox?: boolean }

/**
 * The fields that place a task in time, cleared (inbox-drop-unplaces D1): the do-on
 * date, the start, the time sector, the evening flag and the part of the day. An
 * unscheduled task gets nothing. A repeating task keeps its whole schedule: clearing
 * its date would end the series, and it only loses its project (D2).
 */
export function unschedulePatch(task: Pick<Task, 'due' | 'start' | 'sector' | 'evening' | 'day_part' | 'recurrence'>): Partial<Task> {
  const patch: Partial<Task> = {}
  if (!isScheduled(task) || task.recurrence) return patch
  if (task.due) patch.due = null
  if (task.start) patch.start = null
  if (task.sector) patch.sector = ''
  if (task.evening) patch.evening = false
  if (task.day_part) patch.day_part = null
  return patch
}

/** Whether a move to the Inbox leaves this task scheduled because it repeats (inbox-drop-unplaces D2). */
export const staysScheduled = (task: Pick<Task, 'due' | 'start' | 'sector' | 'recurrence'>): boolean => !!task.recurrence && isScheduled(task)

/** What a move to the Inbox that wrote nothing says about the repeating tasks it left scheduled (inbox-drop-unplaces D2). */
export function staysScheduledLabel(tasks: readonly Pick<Task, 'title'>[]): string {
  const n = tasks.length
  return n ? t('{n, plural, =1 {“{title}” repeats, so it stays scheduled} one {# repeating task stays scheduled} other {# repeating tasks stay scheduled}}', { n, title: tasks[0].title }) : ''
}

/** The ticked tasks a move to the Inbox leaves scheduled because they repeat, counted once each (not under a ticked parent). */
export function repeatingStays(tasks: readonly Task[], all: Task[]): Task[] {
  return topmost(tasks, all).filter(staysScheduled)
}

/** Per ticked (topmost) task, the changes that move it with its subtree. */
export function planMoveGroups(tasks: readonly Task[], all: Task[], target: MoveTarget,
  memberships: Map<string, Membership>, me: string | null, now = Date.now(), keep?: KeepWorkspace): { task: Task; changes: Change[] }[] {
  const out: { task: Task; changes: Change[] }[] = []
  for (const tk of topmost(tasks, all)) {
    const sameProject = (tk.project_id ?? null) === target.projectId
    const unschedule = target.inbox && target.projectId === null ? unschedulePatch(tk) : {}
    if (sameProject) {
      const patch: Partial<Task> = { ...unschedule, ...(target.sectionId !== undefined && (tk.section_id ?? null) !== target.sectionId ? { section_id: target.sectionId } : {}) }
      if (Object.keys(patch).length) out.push({ task: tk, changes: [{ entity: 'task', entityId: tk.id, patch }] })
      continue
    }
    const patch: Partial<Task> = { ...unschedule, project_id: target.projectId, ...(target.sectionId !== undefined ? { section_id: target.sectionId } : {}) }
    const cross = scopeOf(tk.project_id, memberships) !== scopeOf(target.projectId, memberships)
      ? { assignable: assignableIn(target.projectId, memberships, me) } : undefined
    out.push({ task: tk, changes: planProjectChange(tk, all, patch, cross, now, keep).changes })
  }
  return out
}

/** Move to a project (and optionally a section); across sharing scopes as copies plus tombstones. */
export function planMove(tasks: readonly Task[], all: Task[], target: MoveTarget,
  memberships: Map<string, Membership>, me: string | null, now = Date.now(), keep?: KeepWorkspace): Change[] {
  return mergeChanges(planMoveGroups(tasks, all, target, memberships, me, now, keep).flatMap((g) => g.changes))
}

export function planAssign(tasks: readonly Task[], userId: string | null): Change[] {
  return tasks.filter((task) => (task.assignee_id ?? null) !== userId).map((tk) => ({ entity: 'task', entityId: tk.id, patch: { assignee_id: userId } }))
}

/**
 * Changes as reviewable proposals: an id without a row is a copy being created;
 * `base` holds the current values of the patched fields; `shared` marks changes
 * that land in a shared project.
 */
export async function toProposed(changes: Change[], memberships?: Map<string, Membership>): Promise<ProposedChange[]> {
  const out: ProposedChange[] = []
  for (const c of changes) {
    // Every entity's row is read: a project or a label that exists was taken for a new one,
    // and its Undo trashed it instead of putting its fields back (#1660).
    const row = (await tableOf(c.entity).get(c.entityId)) as unknown as Record<string, unknown> | undefined
    const project = (c.entity === 'task' ? (c.patch.project_id ?? row?.project_id ?? null) : null) as string | null
    const shared = !!memberships && !!project && memberships.has(project)
    const base = row ? Object.fromEntries(Object.keys(c.patch).map((f) => [f, row[f] ?? null])) : undefined
    out.push({ entity: c.entity, entityId: c.entityId, patch: c.patch, ...(base ? { base } : { create: true }), ...(shared ? { shared } : {}) })
  }
  return out
}

/** Live rows of the ticked ids (in the given order) and every live task, read together. */
export async function readTicked(ids: readonly string[]): Promise<{ tasks: Task[]; all: Task[] }> {
  const all = await db.tasks.filter((task) => !task.deleted_at).toArray()
  const byId = new Map(all.map((tk) => [tk.id, tk]))
  return { tasks: ids.map((id) => byId.get(id)).filter((item): item is Task => !!item), all }
}

export type BulkAction =
  | { kind: 'complete' }
  | { kind: 'priority'; priority: Priority }
  | { kind: 'due'; pick: DuePick }
  | { kind: 'label'; labelId: string; add: boolean }
  | { kind: 'trash' }


/** The undo toast's words for an action on n tasks. */
export function bulkLabel(a: BulkAction | { kind: 'reopen' }, n: number): string {
  switch (a.kind) {
    case 'complete': return t('{n, plural, one {# task completed} other {# tasks completed}}', { n })
    case 'reopen': return t('{n, plural, one {# task reopened} other {# tasks reopened}}', { n })
    case 'priority': return isNoPriority(a.priority)
      ? t('{n, plural, one {Priority removed from # task} other {Priority removed from # tasks}}', { n })
      : t('{n, plural, one {{p} set on # task} other {{p} set on # tasks}}', { n, p: priorityName(a.priority) })
    case 'due': return a.pick === null ? t('{n, plural, one {Date removed from # task} other {Date removed from # tasks}}', { n }) : t('{n, plural, one {# task rescheduled} other {# tasks rescheduled}}', { n })
    case 'label': return a.add ? t('{n, plural, one {Label added to # task} other {Label added to # tasks}}', { n }) : t('{n, plural, one {Label removed from # task} other {Label removed from # tasks}}', { n })
    case 'trash': return t('{n, plural, one {# task moved to the Trash} other {# tasks moved to the Trash}}', { n })
  }
}

export interface BulkResult { undoId: string | null; label: string; count: number }

/**
 * Plan an action on the ticked tasks and apply it as one undoable batch. Works
 * offline: the changes go to the outbox with one timestamp and sync as ordinary ops.
 */
export async function applyBulk(ids: readonly string[], action: BulkAction, opts: { now?: number; today?: string } = {}): Promise<BulkResult & { completed?: boolean }> {
  const now = opts.now ?? Date.now()
  const today = opts.today ?? logicalToday()
  await getDeviceId()
  const { tasks, all } = await readTicked(ids)
  let changes: Change[]
  let label: string
  switch (action.kind) {
    case 'complete': {
      const reopen = allCompleted(tasks)
      changes = planComplete(tasks, all, now, today, await membershipMap(), await keepsSubtasksNow())
      label = bulkLabel(reopen ? { kind: 'reopen' } : action, reopen ? tasks.length : tasks.filter((task) => !task.completed_at).length)
      break
    }
    case 'priority': changes = planPriority(tasks, action.priority); label = bulkLabel(action, tasks.length); break
    case 'due': {
      // A series is never put on one of its own records (#1971): left as it is and counted.
      const kept = refusedSeries(planDue(tasks, action.pick, today), all)
      changes = kept.changes
      label = withNotMoved(kept.changes.length ? bulkLabel(action, kept.changes.length) : '', kept.refused)
      break
    }
    case 'label': changes = planLabels(tasks, action.labelId, action.add); label = bulkLabel(action, changes.length); break
    case 'trash': changes = planTrash(tasks, all, now); label = bulkLabel(action, tasks.length); break
  }
  const entry = await applyBatch(await toProposed(changes), { source: 'bulk', label })
  const result = { undoId: entry?.id ?? null, label, count: tasks.length }
  return action.kind === 'complete' && entry && !allCompleted(tasks) ? { ...result, completed: true } : result
}

/** The undo toast's words for a group action (page-rhythm D6): "4 tasks moved to today", "3 of 4 tasks rescheduled". */
export function groupDueLabel(pick: Exclude<DuePick, null>, moved: number, total: number): string {
  if (pick === 'today') {
    return moved === total
      ? t('{n, plural, one {# task moved to today} other {# tasks moved to today}}', { n: moved })
      : t('{moved} of {n, plural, one {# task moved to today} other {# tasks moved to today}}', { moved, n: total })
  }
  return moved === total
    ? t('{n, plural, one {# task rescheduled} other {# tasks rescheduled}}', { n: moved })
    : t('{moved} of {n, plural, one {# task rescheduled} other {# tasks rescheduled}}', { moved, n: total })
}

/**
 * A date for every task of a list group (page-rhythm D6, bulk-actions "Group actions
 * are one batch"): the bulk date path on the group's ids, not the selection, as one
 * undoable batch. Tasks the user may only view are left as they are and counted.
 */
export async function applyGroupDue(ids: readonly string[], pick: Exclude<DuePick, null>, opts: { today?: string } = {}): Promise<BulkResult> {
  const today = opts.today ?? logicalToday()
  await getDeviceId()
  const { tasks, all } = await readTicked(ids)
  const memberships = await membershipMap()
  const editable = tasks.filter((task) => canEditTask(task, memberships))
  // A series is never put on one of its own records (#1971): counted with the tasks left as they are.
  const { changes } = refusedSeries(planDue(editable, pick, today), all)
  const label = groupDueLabel(pick, changes.length, tasks.length)
  const entry = changes.length ? await applyBatch(await toProposed(changes), { source: 'bulk', label }) : null
  return { undoId: entry?.id ?? null, label, count: changes.length }
}

/**
 * A planned review (design D6): one item per task, worded as its visible change,
 * and the real changes of the items the person keeps checked (a move across
 * sharing scopes is copies plus tombstones, which must be applied together).
 */
export interface ReviewPlan {
  items: ProposedChange[]
  resolve: (checkedTaskIds: readonly string[]) => Promise<ProposedChange[]>
  /** The tasks that stay scheduled because they repeat, for the checked ids (a move to the Inbox, inbox-drop-unplaces D2). */
  repeating?: (checkedTaskIds: readonly string[]) => Task[]
}

export async function reviewMove(ids: readonly string[], target: MoveTarget): Promise<ReviewPlan> {
  const { tasks, all } = await readTicked(ids)
  const memberships = await membershipMap()
  const groups = planMoveGroups(tasks, all, target, memberships, await currentUserId(), Date.now(), await keepWorkspaceFor())
  const shared = !!target.projectId && memberships.has(target.projectId)
  const items = groups.map(({ task }): ProposedChange => {
    const unschedule = target.inbox && target.projectId === null ? unschedulePatch(task) : {}
    const patch: Record<string, unknown> = (task.project_id ?? null) === target.projectId
      ? { ...unschedule, ...(target.sectionId !== undefined || !target.inbox ? { section_id: target.sectionId ?? null } : {}) }
      : { ...unschedule, project_id: target.projectId, ...(target.sectionId !== undefined ? { section_id: target.sectionId } : {}) }
    return { entity: 'task', entityId: task.id, patch, base: Object.fromEntries(Object.keys(patch).map((f) => [f, (task as unknown as Record<string, unknown>)[f] ?? null])), ...(shared ? { shared } : {}) }
  })
  // A repeating task stays scheduled whether its move is checked or it had nothing to review.
  const stays = target.inbox && target.projectId === null ? repeatingStays(tasks, all) : []
  const reviewed = new Set(items.map((i) => i.entityId))
  return {
    items,
    resolve: (checked) => toProposed(mergeChanges(groups.filter((g) => checked.includes(g.task.id)).flatMap((g) => g.changes)), memberships),
    ...(stays.length ? { repeating: (checked: readonly string[]) => stays.filter((task) => !reviewed.has(task.id) || checked.includes(task.id)) } : {}),
  }
}

export async function reviewAssign(ids: readonly string[], userId: string | null): Promise<ReviewPlan> {
  const { tasks } = await readTicked(ids)
  const memberships = await membershipMap()
  const items = await toProposed(planAssign(tasks, userId), memberships)
  return { items, resolve: async (checked) => items.filter((c) => checked.includes(c.entityId)) }
}

/** The one shared project every ticked task is in, or null (Assign needs it). */
export function commonSharedProject(tasks: readonly Task[], memberships: Map<string, Membership>): string | null {
  const p = tasks[0]?.project_id ?? null
  if (!p || !memberships.has(p) || tasks.some((task) => task.project_id !== p)) return null
  return p
}

/**
 * The ticked tasks, live, tagged with the selection `key` they were read for:
 * until the read for this selection lands, the caller can tell it is an earlier one.
 */
export function useTickedTasks(ids: readonly string[], key: string) {
  // `key` is the selection's identity (the ids joined).
  return useLiveQuery(() => readTicked(ids).then((r) => ({ key, tasks: r.tasks })), [key])
}
