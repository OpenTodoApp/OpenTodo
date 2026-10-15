// Bulk actions on ticked tasks (OpenSpec change bulk-edit, design D4): pure planners
// that turn one action on many tasks into ONE list of field changes, merged per
// entity, written with a single mutateMany through the undo store (lib/undo.ts).
// They reuse the single-task rules (recurring roll-forward, subtree completion and
// trash, project moves across sharing scopes) so a batch behaves like the keys.
import type { ProposedChange } from './assistantTypes'
import { addDaysISO, todayISO, weekStartOf } from './dates'
import { db } from './db'
import { getDeviceId, planCompletePlain, planProjectChange, type Change } from './ops'
import { planCompletion, seriesRule } from './recurring'
import { assignableIn, currentUserId, membershipMap, scopeOf } from './sharing'
import { descendants } from './tree'
import type { Membership, Priority, Task } from './types'
import { applyBatch } from './undo'

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
export const allCompleted = (tasks: readonly Task[]): boolean => tasks.length > 0 && tasks.every((t) => !!t.completed_at)

/** Complete the open tasks (series roll forward, subtrees complete), or reopen when all are completed. */
export function planComplete(tasks: readonly Task[], all: Task[], now: number, today: string): Change[] {
  if (allCompleted(tasks)) return planReopen(tasks)
  const out: Change[] = []
  for (const t of tasks) {
    if (t.completed_at) continue
    const rule = seriesRule(t)
    const plan = rule ? planCompletion(t, rule, all, now, today) : null
    if (plan && plan.kind === 'roll') out.push(...plan.changes)
    else out.push(...planCompletePlain(t.id, all, now))
  }
  return mergeChanges(out)
}

export function planReopen(tasks: readonly Task[]): Change[] {
  return tasks.filter((t) => t.completed_at).map((t) => ({ entity: 'task', entityId: t.id, patch: { completed_at: null } }))
}

export function planPriority(tasks: readonly Task[], p: Priority): Change[] {
  return tasks.filter((t) => t.priority !== p).map((t) => ({ entity: 'task', entityId: t.id, patch: { priority: p } }))
}

export type DuePick = 'today' | 'tomorrow' | 'next-week' | null | string

/** The date of a pick; "Next week" is the first day of the following week per the user's week start. */
export function dateOfPick(pick: Exclude<DuePick, null>, today = todayISO()): string {
  if (pick === 'today') return today
  if (pick === 'tomorrow') return addDaysISO(today, 1)
  if (pick === 'next-week') return weekStartOf(addDaysISO(today, 7))
  return pick
}

/** Reschedule; an existing time and zone are kept. No date ends a recurrence; a date un-parks. */
export function planDue(tasks: readonly Task[], pick: DuePick, today = todayISO()): Change[] {
  return tasks.map((t): Change => {
    if (pick === null) return { entity: 'task', entityId: t.id, patch: t.recurrence ? { due: null, recurrence: null } : { due: null } }
    const date = dateOfPick(pick, today)
    const due = t.due?.time ? { ...t.due, date } : { date }
    return { entity: 'task', entityId: t.id, patch: t.start === 'someday' ? { due, start: null } : { due } }
  })
}

/** Add a label to (or remove it from) every task, from each task's current array. */
export function planLabels(tasks: readonly Task[], labelId: string, add: boolean): Change[] {
  return tasks.flatMap((t): Change[] => {
    const has = t.labels.includes(labelId)
    if (add === has) return []
    return [{ entity: 'task', entityId: t.id, patch: { labels: add ? [...t.labels, labelId] : t.labels.filter((l) => l !== labelId) } }]
  })
}

/** Move to the Trash with their subtrees, one tombstone per task. */
export function planTrash(tasks: readonly Task[], all: Task[], now: number): Change[] {
  const ids = new Set<string>()
  for (const t of tasks) {
    ids.add(t.id)
    for (const d of descendants(t.id, all)) ids.add(d)
  }
  return [...ids].map((id) => ({ entity: 'task', entityId: id, patch: { deleted_at: now } }))
}

/** Ticked tasks whose ancestor is also ticked move with it, not on their own. */
function topmost(tasks: readonly Task[], all: Task[]): Task[] {
  const ticked = new Set(tasks.map((t) => t.id))
  return tasks.filter((t) => ![...ticked].some((other) => other !== t.id && descendants(other, all).has(t.id)))
}

export type MoveTarget = { projectId: string | null; sectionId?: string | null }

/** Per ticked (topmost) task, the changes that move it with its subtree. */
export function planMoveGroups(tasks: readonly Task[], all: Task[], target: MoveTarget,
  memberships: Map<string, Membership>, me: string | null, now = Date.now()): { task: Task; changes: Change[] }[] {
  const out: { task: Task; changes: Change[] }[] = []
  for (const t of topmost(tasks, all)) {
    const sameProject = (t.project_id ?? null) === target.projectId
    if (sameProject) {
      if (target.sectionId !== undefined && (t.section_id ?? null) !== target.sectionId) out.push({ task: t, changes: [{ entity: 'task', entityId: t.id, patch: { section_id: target.sectionId } }] })
      continue
    }
    const patch: Partial<Task> = { project_id: target.projectId, ...(target.sectionId !== undefined ? { section_id: target.sectionId } : {}) }
    const cross = scopeOf(t.project_id, memberships) !== scopeOf(target.projectId, memberships)
      ? { assignable: assignableIn(target.projectId, memberships, me) } : undefined
    out.push({ task: t, changes: planProjectChange(t, all, patch, cross, now).changes })
  }
  return out
}

/** Move to a project (and optionally a section); across sharing scopes as copies plus tombstones. */
export function planMove(tasks: readonly Task[], all: Task[], target: MoveTarget,
  memberships: Map<string, Membership>, me: string | null, now = Date.now()): Change[] {
  return mergeChanges(planMoveGroups(tasks, all, target, memberships, me, now).flatMap((g) => g.changes))
}

export function planAssign(tasks: readonly Task[], userId: string | null): Change[] {
  return tasks.filter((t) => (t.assignee_id ?? null) !== userId).map((t) => ({ entity: 'task', entityId: t.id, patch: { assignee_id: userId } }))
}

/**
 * Changes as reviewable proposals: an id without a row is a copy being created;
 * `base` holds the current values of the patched fields; `shared` marks changes
 * that land in a shared project.
 */
export async function toProposed(changes: Change[], memberships?: Map<string, Membership>): Promise<ProposedChange[]> {
  const out: ProposedChange[] = []
  for (const c of changes) {
    const row = c.entity === 'task' ? (await db.tasks.get(c.entityId)) as unknown as Record<string, unknown> | undefined : undefined
    const project = (c.patch.project_id ?? row?.project_id ?? null) as string | null
    const shared = !!memberships && !!project && memberships.has(project)
    const base = row ? Object.fromEntries(Object.keys(c.patch).map((f) => [f, row[f] ?? null])) : undefined
    out.push({ entity: c.entity, entityId: c.entityId, patch: c.patch, ...(base ? { base } : { create: true }), ...(shared ? { shared } : {}) })
  }
  return out
}

/** Live rows of the ticked ids (in the given order) and every live task, read together. */
export async function readTicked(ids: readonly string[]): Promise<{ tasks: Task[]; all: Task[] }> {
  const all = await db.tasks.filter((t) => !t.deleted_at).toArray()
  const byId = new Map(all.map((t) => [t.id, t]))
  return { tasks: ids.map((id) => byId.get(id)).filter((t): t is Task => !!t), all }
}

export type BulkAction =
  | { kind: 'complete' }
  | { kind: 'priority'; priority: Priority }
  | { kind: 'due'; pick: DuePick }
  | { kind: 'label'; labelId: string; add: boolean }
  | { kind: 'trash' }

const count = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`

/** The undo toast's words for an action on n tasks. */
export function bulkLabel(a: BulkAction | { kind: 'reopen' }, n: number): string {
  switch (a.kind) {
    case 'complete': return `${count(n)} completed`
    case 'reopen': return `${count(n)} reopened`
    case 'priority': return `Priority ${a.priority} set on ${count(n)}`
    case 'due': return a.pick === null ? `Date removed from ${count(n)}` : `${count(n)} rescheduled`
    case 'label': return a.add ? `Label added to ${count(n)}` : `Label removed from ${count(n)}`
    case 'trash': return `${count(n)} moved to the Trash`
  }
}

export interface BulkResult { undoId: string | null; label: string; count: number }

/**
 * Plan an action on the ticked tasks and apply it as one undoable batch. Works
 * offline: the changes go to the outbox with one timestamp and sync as ordinary ops.
 */
export async function applyBulk(ids: readonly string[], action: BulkAction, opts: { now?: number; today?: string } = {}): Promise<BulkResult> {
  const now = opts.now ?? Date.now()
  const today = opts.today ?? todayISO()
  await getDeviceId()
  const { tasks, all } = await readTicked(ids)
  let changes: Change[]
  let label: string
  switch (action.kind) {
    case 'complete': {
      const reopen = allCompleted(tasks)
      changes = planComplete(tasks, all, now, today)
      label = bulkLabel(reopen ? { kind: 'reopen' } : action, reopen ? tasks.length : tasks.filter((t) => !t.completed_at).length)
      break
    }
    case 'priority': changes = planPriority(tasks, action.priority); label = bulkLabel(action, tasks.length); break
    case 'due': changes = planDue(tasks, action.pick, today); label = bulkLabel(action, tasks.length); break
    case 'label': changes = planLabels(tasks, action.labelId, action.add); label = bulkLabel(action, changes.length); break
    case 'trash': changes = planTrash(tasks, all, now); label = bulkLabel(action, tasks.length); break
  }
  const entry = await applyBatch(await toProposed(changes), { source: 'bulk', label })
  return { undoId: entry?.id ?? null, label, count: tasks.length }
}

/**
 * A planned review (design D6): one item per task, worded as its visible change,
 * and the real changes of the items the person keeps checked (a move across
 * sharing scopes is copies plus tombstones, which must be applied together).
 */
export interface ReviewPlan {
  items: ProposedChange[]
  resolve: (checkedTaskIds: readonly string[]) => Promise<ProposedChange[]>
}

export async function planMoveFor(ids: readonly string[], target: MoveTarget): Promise<ProposedChange[]> {
  const { tasks, all } = await readTicked(ids)
  const memberships = await membershipMap()
  return toProposed(planMove(tasks, all, target, memberships, await currentUserId()), memberships)
}

export async function reviewMove(ids: readonly string[], target: MoveTarget): Promise<ReviewPlan> {
  const { tasks, all } = await readTicked(ids)
  const memberships = await membershipMap()
  const groups = planMoveGroups(tasks, all, target, memberships, await currentUserId())
  const shared = !!target.projectId && memberships.has(target.projectId)
  const items = groups.map(({ task }): ProposedChange => {
    const patch: Record<string, unknown> = (task.project_id ?? null) === target.projectId ? { section_id: target.sectionId ?? null } : { project_id: target.projectId, ...(target.sectionId !== undefined ? { section_id: target.sectionId } : {}) }
    return { entity: 'task', entityId: task.id, patch, base: Object.fromEntries(Object.keys(patch).map((f) => [f, (task as unknown as Record<string, unknown>)[f] ?? null])), ...(shared ? { shared } : {}) }
  })
  return {
    items,
    resolve: (checked) => toProposed(mergeChanges(groups.filter((g) => checked.includes(g.task.id)).flatMap((g) => g.changes)), memberships),
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
  if (!p || !memberships.has(p) || tasks.some((t) => t.project_id !== p)) return null
  return p
}
