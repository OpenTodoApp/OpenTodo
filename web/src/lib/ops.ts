// Every local mutation becomes field-level ops that are applied to IndexedDB
// immediately (optimistic, offline-safe) and queued for the server.
import { db, entityTables, getMeta, setMeta } from './db'
import { todayISO } from './dates'
import { hlcNow, hlcSeed, wins } from './hlc'
import { firstOccurrence, parseRule } from './recurrence'
import { relativeFireAt } from './reminderTime'
import { planCompletion, planDetach, planSkip, seriesRule } from './recurring'
import { assignableIn, currentUserId, membershipMap, roleOf, scopeOf } from './sharing'
import { descendants, isDescendant } from './tree'
import { ENTITIES, type Clock, type Comment, type Entity, type Label, type Op, type Project, type Reminder, type Task, type View } from './types'
import { recordActivity, type RecordInput } from './activity'

let devicePromise: Promise<string> | null = null

/** Stable per-browser device id; memoized as a promise so concurrent first calls agree. */
export function getDeviceId(): Promise<string> {
  if (!devicePromise) {
    devicePromise = (async () => {
      let id = await getMeta<string | null>('device', null)
      if (!id) {
        id = crypto.randomUUID()
        await setMeta('device', id)
      }
      hlcSeed(await getMeta<number>('hlc', 0))
      return id
    })()
    devicePromise.catch(() => (devicePromise = null))
  }
  return devicePromise
}

/** Test hook: forget the memoized device id (the database was swapped). */
export function resetDeviceId(): void {
  devicePromise = null
}

function tableFor(entity: Entity) {
  switch (entity) {
    case 'project': return db.projects
    case 'label': return db.labels
    case 'view': return db.views
    case 'reminder': return db.reminders
    case 'comment': return db.comments
    default: return db.tasks
  }
}

const PROJECT_DEFAULTS: Omit<Project, 'id' | '_clock'> = {
  name: '', color: '#64748b', position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null,
}
const TASK_DEFAULTS: Omit<Task, 'id' | '_clock'> = {
  title: '', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [],
  position: 0, created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null,
  assignee_id: null,
}
const LABEL_DEFAULTS: Omit<Label, 'id' | '_clock'> = {
  name: '', color: '#64748b', position: 0, created_at: 0, deleted_at: null,
}
/** Defaults for a view row created from partial ops; also the read-time fallback for unknown option values. */
export const VIEW_DEFAULTS: Omit<View, 'id' | '_clock'> = {
  name: '', query: '', kind: 'list', group_by: 'project', sort_by: 'due', sort_dir: 'asc', pinned: false,
  position: 0, color: '#64748b', panels: [], created_at: 0, deleted_at: null,
}
const REMINDER_DEFAULTS: Omit<Reminder, 'id' | '_clock'> = {
  task_id: '', kind: 'relative', offset_minutes: null, fire_at: null, delivered_at: null, dismissed_at: null,
  created_at: 0, deleted_at: null,
}
const COMMENT_DEFAULTS: Omit<Comment, 'id' | '_clock'> = {
  task_id: '', parent_id: null, body: '', author_id: '', mentions: [], created_at: 0, edited_at: null, deleted_at: null,
}
const DEFAULTS: Record<Entity, Record<string, unknown>> = {
  project: PROJECT_DEFAULTS, task: TASK_DEFAULTS, label: LABEL_DEFAULTS, view: VIEW_DEFAULTS, reminder: REMINDER_DEFAULTS,
  comment: COMMENT_DEFAULTS,
}

/**
 * Fields the server may store with a different value than the device sent, keeping
 * the op's clock (comments-and-activity D2: mentions are filtered to members). When
 * the server's copy arrives with the clock the row already has, its value is adopted.
 */
const SERVER_REWRITTEN = new Set(['comment.mentions'])

/**
 * Apply ops to the local store using per-field last-writer-wins. Safe to call with
 * ops in any order and any number of times: the result depends only on the set of ops.
 * Ops for entities this build does not know (a newer server) are skipped, not fatal.
 *
 * Task, project and comment ops are also recorded for the activity log with their
 * author (`op.actor`, else `opts.actor` for local edits) and old value.
 */
export async function applyOps(ops: Op[], opts: { actor?: string } = {}): Promise<void> {
  if (ops.length === 0) return
  const grouped = new Map<string, Op[]>()
  for (const op of ops) {
    if (!ENTITIES.includes(op.entity)) continue
    const key = `${op.entity}:${op.entityId}`
    const list = grouped.get(key)
    if (list) list.push(op)
    else grouped.set(key, [op])
  }
  if (grouped.size === 0) return
  await db.transaction('rw', entityTables(), async () => {
    const recorded: RecordInput[] = []
    const rows = new Map<string, Record<string, unknown>>()
    for (const [, list] of grouped) {
      const { entity, entityId } = list[0]
      const table = tableFor(entity)
      const existing = (await table.get(entityId)) as (Project | Task | Label | View | Reminder | Comment) | undefined
      const row: Record<string, unknown> = existing ? { ...existing } : { ...DEFAULTS[entity], id: entityId, _clock: {} }
      const clock: Clock = { ...(row._clock as Clock) }
      let changed = !existing
      for (const op of list) {
        const c = clock[op.field]
        const won = wins(op.ts, op.device, c)
        // A losing op still happened: its old value is unknown here, the activity
        // rule takes it from the op before it in timestamp order.
        recorded.push({ op, actor: op.actor ?? opts.actor ?? '', from: won ? row[op.field] ?? null : undefined, projectKey: '' })
        const rewritten = !won && c && c.ts === op.ts && c.device === op.device && SERVER_REWRITTEN.has(`${entity}.${op.field}`)
        if (!won && !rewritten) continue
        row[op.field] = op.value
        clock[op.field] = { ts: op.ts, device: op.device }
        changed = true
      }
      rows.set(`${entity}:${entityId}`, row)
      if (changed) {
        row._clock = clock
        await (table as unknown as { put(v: unknown): Promise<unknown> }).put(row)
      }
    }
    // Place each recorded op in its task and project once every row is written.
    for (const r of recorded) {
      if (r.op.entity === 'task') r.taskId = r.op.entityId
      else if (r.op.entity === 'comment') r.taskId = (rows.get(`comment:${r.op.entityId}`) as Comment | undefined)?.task_id || undefined
    }
    const missing = [...new Set(recorded.map((r) => r.taskId).filter((id): id is string => !!id && !rows.has(`task:${id}`)))]
    const loaded = missing.length ? await db.tasks.bulkGet(missing) : []
    for (const t of loaded) if (t) rows.set(`task:${t.id}`, t as unknown as Record<string, unknown>)
    for (const r of recorded) {
      if (r.op.entity === 'project') r.projectKey = r.op.entityId
      else r.projectKey = ((r.taskId && (rows.get(`task:${r.taskId}`) as Task | undefined)?.project_id) || 'inbox')
    }
    await recordActivity(recorded)
  })
}

type Listener = () => void
const mutationListeners = new Set<Listener>()

/** Sync engine subscribes here to learn that the outbox has new work. */
export function onLocalMutation(fn: Listener): () => void {
  mutationListeners.add(fn)
  return () => mutationListeners.delete(fn)
}

/** One entity's field changes inside a batch. */
export interface Change {
  entity: Entity
  entityId: string
  patch: Record<string, unknown>
}

/** Tables a read-modify-write helper must lock to wrap mutate()/mutateMany() in one transaction. */
export function mutationTables() {
  return [...entityTables(), db.outbox, db.meta]
}

/**
 * Record field changes for several entities as one batch: applied locally, enqueued
 * and the clock persisted in a single transaction (one render, no intermediate state).
 * Each field is still its own op, so sync semantics are unchanged. Callers that must
 * read the current row first (e.g. the task label array) wrap the read and this call in
 * `db.transaction('rw', mutationTables(), …)` after awaiting getDeviceId() once.
 */
export async function mutateMany(changes: Change[]): Promise<void> {
  const device = await getDeviceId()
  changes = [...changes, ...(await reminderFollowUps(changes))]
  const ts = hlcNow()
  const ops: Op[] = []
  for (const { entity, entityId, patch } of changes) {
    for (const [field, value] of Object.entries(patch)) {
      ops.push({ id: crypto.randomUUID(), entity, entityId, field, value, ts, device })
    }
  }
  if (ops.length === 0) return
  await db.transaction('rw', mutationTables(), async () => {
    // The author of local edits, read inside the transaction (activity log).
    const actor = ((await db.meta.get('userId'))?.value as string | undefined) ?? ''
    await applyOps(ops, { actor })
    await db.outbox.bulkAdd(ops)
    await db.meta.put({ key: 'hlc', value: ts })
  })
  for (const fn of mutationListeners) fn()
}

/**
 * Relative reminders follow their task's due time (OpenSpec change `reminders`,
 * design D2): every change that sets a task's `due` (an edit, a reschedule, a
 * recurring series rolling forward or skipping) carries a new `fire_at` for each
 * live relative reminder of that task. They join the same batch, so they share the
 * due op's HLC timestamp and device and last-writer-wins picks the due date and the
 * firing times from the same edit. `fire_at` is always written, even when unchanged,
 * for that reason; a firing that moved also clears delivered/dismissed state.
 */
async function reminderFollowUps(changes: Change[]): Promise<Change[]> {
  const out: Change[] = []
  for (const { entity, entityId, patch } of changes) {
    if (entity !== 'task' || !('due' in patch)) continue
    const due = (patch.due ?? null) as Task['due']
    const reminders = await db.reminders.where('task_id').equals(entityId).toArray()
    for (const r of reminders) {
      if (r.deleted_at || r.kind !== 'relative') continue
      const fireAt = relativeFireAt(due, r.offset_minutes)
      const p: Record<string, unknown> = { fire_at: fireAt }
      if (fireAt !== r.fire_at) {
        if (r.delivered_at !== null) p.delivered_at = null
        if (r.dismissed_at !== null) p.dismissed_at = null
      }
      out.push({ entity: 'reminder', entityId: r.id, patch: p })
    }
  }
  return out
}

/** Record field changes for one entity: apply locally and enqueue for the server. */
export async function mutate(entity: Entity, entityId: string, patch: Record<string, unknown>): Promise<void> {
  await mutateMany([{ entity, entityId, patch }])
}

/** Every non-deleted project; the tree helpers take the whole set so cycles are handled. */
async function liveProjects(): Promise<Project[]> {
  return db.projects.filter((p) => !p.deleted_at).toArray()
}

/** A position after every live sibling under `parentId` (excluding `id` itself). */
function lastAmongProjectSiblings(all: Project[], id: string, parentId: string | null): number {
  let position = Date.now()
  for (const p of all) {
    if (p.id !== id && p.parent_id === parentId && p.position >= position) position = p.position + 1
  }
  return position
}

/** A new project goes last at the top level, or last under `parent_id` when given. */
export async function createProject(input: { name: string; color?: string; parent_id?: string | null }): Promise<string> {
  const id = crypto.randomUUID()
  const now = Date.now()
  const all = await liveProjects()
  const parent = input.parent_id ? all.find((p) => p.id === input.parent_id) : undefined
  const parentId = parent && !parent.archived ? parent.id : null
  await mutate('project', id, {
    name: input.name.trim(), color: input.color ?? pickColor(), position: lastAmongProjectSiblings(all, id, parentId),
    archived: false, parent_id: parentId, created_at: now, deleted_at: null,
  })
  return id
}

/**
 * Re-parent a project (null = top level). Refuses the project itself, any of its
 * descendants and an archived or deleted parent; the REST API enforces the cycle
 * rule too. The project is placed last among its new siblings. Two ops, so a
 * concurrent move on another device resolves field by field (design D2).
 */
export async function moveProject(id: string, parentId: string | null): Promise<void> {
  const project = await db.projects.get(id)
  if (!project || project.deleted_at) throw new Error('project not found')
  if (parentId === project.parent_id) return
  const all = await liveProjects()
  if (parentId !== null) {
    if (parentId === id) throw new Error('a project cannot be its own parent')
    const parent = all.find((p) => p.id === parentId)
    if (!parent || parent.archived) throw new Error('parent project not found')
    if (isDescendant(parentId, id, all)) throw new Error('parent cannot be a descendant of the project')
  }
  await mutate('project', id, { parent_id: parentId, position: lastAmongProjectSiblings(all, id, parentId) })
}

/** Archiving cascades to every descendant, one op each (design D3); unarchive does not cascade. */
export async function archiveProject(id: string): Promise<void> {
  const all = await liveProjects()
  const changes: Change[] = [{ entity: 'project', entityId: id, patch: { archived: true } }]
  for (const d of descendants(id, all)) {
    const p = all.find((x) => x.id === d)
    if (p && !p.archived) changes.push({ entity: 'project', entityId: d, patch: { archived: true } })
  }
  await mutateMany(changes)
}

export async function createTask(input: {
  title: string; description?: string; project_id?: string | null; parent_id?: string | null; due?: Task['due']; priority?: Task['priority']; labels?: string[]
  estimate_minutes?: number | null
  /** A recurrence rule (any spelling the grammar accepts; stored canonical). Throws when invalid. */
  recurrence?: string | null
  /** Assignee account id (task-assignment); only sent when set. */
  assignee_id?: string | null
}): Promise<string> {
  const id = crypto.randomUUID()
  const now = Date.now()
  let due = input.due ?? null
  const extra: Record<string, unknown> = {}
  if (input.recurrence) {
    // Only recurring tasks carry the field, so plain tasks keep their op footprint.
    const parsed = parseRule(input.recurrence)
    if (!parsed.ok) throw new Error(`invalid recurrence: ${parsed.error}`)
    extra.recurrence = parsed.canonical
    if (!due) due = { date: firstOccurrence(parsed.rule, todayISO()) }
  }
  if (input.assignee_id) extra.assignee_id = input.assignee_id
  await mutate('task', id, {
    title: input.title.trim(), description: input.description ?? '', project_id: input.project_id ?? null, parent_id: input.parent_id ?? null,
    priority: input.priority ?? 4, due, labels: input.labels ?? [], position: now, created_at: now,
    completed_at: null, deleted_at: null, estimate_minutes: input.estimate_minutes ?? null, ...extra,
  })
  return id
}

/** A new subtask lives in its parent's project, with default priority and no due date. */
export async function createSubtask(parentId: string, title: string): Promise<string> {
  const parent = await db.tasks.get(parentId)
  if (!parent || parent.deleted_at) throw new Error('parent task not found')
  return createTask({ title, project_id: parent.project_id, parent_id: parentId })
}

/** Every non-deleted task; the tree helpers take the whole set so cycles are handled. */
async function liveTasks(): Promise<Task[]> {
  return db.tasks.filter((t) => !t.deleted_at).toArray()
}

/**
 * Re-parent a task. Refuses the task itself, any of its descendants and a parent in
 * another project; the REST API enforces the same rules. The task is placed last
 * among its new siblings. One op per changed field, so the move converges by LWW.
 */
export async function setTaskParent(id: string, parentId: string | null): Promise<void> {
  const task = await db.tasks.get(id)
  if (!task || task.deleted_at) throw new Error('task not found')
  if (parentId === task.parent_id) return
  const all = await liveTasks()
  if (parentId !== null) {
    if (parentId === id) throw new Error('a task cannot be its own parent')
    const parent = all.find((t) => t.id === parentId)
    if (!parent) throw new Error('parent task not found')
    if (parent.project_id !== task.project_id) throw new Error('parent must be in the same project')
    if (isDescendant(parentId, id, all)) throw new Error('parent cannot be a descendant of the task')
  }
  let position = Date.now()
  for (const t of all) {
    if (t.id !== id && t.parent_id === parentId && t.project_id === task.project_id && t.position >= position) position = t.position + 1
  }
  await mutate('task', id, { parent_id: parentId, position })
}

/** Fields a cross-scope copy carries over (project-sharing); ids, tree links and tombstones are new. */
const COPY_FIELDS = ['title', 'description', 'priority', 'due', 'labels', 'estimate_minutes', 'recurrence', 'series_id', 'assignee_id', 'completed_at', 'position', 'created_at'] as const

/**
 * Copy tasks into `projectId` under new ids, keeping parent links between copied
 * tasks (a parent that is not copied becomes null). Returns the changes and the
 * old → new id map. The originals are untouched; callers tombstone them.
 */
function copyTasks(
  tasks: Task[], projectId: string | null, assignable: Set<string>, overrides: Record<string, Partial<Task>> = {},
): { changes: Change[]; ids: Map<string, string> } {
  const ids = new Map(tasks.map((t) => [t.id, crypto.randomUUID()]))
  const changes: Change[] = []
  for (const t of tasks) {
    const patch: Record<string, unknown> = {}
    for (const f of COPY_FIELDS) patch[f] = t[f]
    Object.assign(patch, overrides[t.id] ?? {})
    // task-assignment: the copy keeps its assignee only when that person may be
    // assigned in the destination; the server would refuse it otherwise.
    // An unassigned copy needs no op (null is the default; rows synced before the
    // field existed hold undefined, which must never be sent).
    if (typeof patch.assignee_id !== 'string') delete patch.assignee_id
    else if (!assignable.has(patch.assignee_id)) patch.assignee_id = null
    patch.project_id = projectId
    patch.parent_id = (t.parent_id && ids.get(t.parent_id)) ?? null
    patch.deleted_at = null
    changes.push({ entity: 'task', entityId: ids.get(t.id) as string, patch })
  }
  return { changes, ids }
}

/**
 * Move a task (with its subtree) into a project of another sharing scope: who can
 * see an existing task never changes, so the server refuses that `project_id`
 * (reason `scope_change`). The move is a copy in the destination plus a tombstone
 * on every original, in one batch, so it works offline and converges by LWW.
 * Returns the id of the copy.
 */
export async function moveTaskAcrossScopes(id: string, patch: Partial<Omit<Task, 'id' | '_clock'>>): Promise<string> {
  const task = await db.tasks.get(id)
  if (!task || task.deleted_at) throw new Error('task not found')
  const all = await liveTasks()
  const subtree = [task, ...[...descendants(id, all)].map((d) => all.find((t) => t.id === d)).filter((t): t is Task => !!t)]
  const { project_id: projectId = null, parent_id: _parent, ...rest } = patch
  const assignable = assignableIn(projectId, await membershipMap(), await currentUserId())
  const { changes, ids } = copyTasks(subtree, projectId, assignable, { [id]: { ...rest, position: Date.now() } })
  const now = Date.now()
  for (const t of subtree) changes.push({ entity: 'task', entityId: t.id, patch: { deleted_at: now } })
  await mutateMany(changes)
  return ids.get(id) as string
}

/**
 * Edit fields and return the task's id afterwards. Changing `project_id` moves the
 * whole subtree (one op per descendant) and detaches the task from a parent that
 * stays behind, so a subtask is always in its parent's project. A move into another
 * sharing scope becomes copy + tombstone and returns the copy's id.
 */
export async function updateTask(id: string, patch: Partial<Omit<Task, 'id' | '_clock'>>): Promise<string> {
  if (patch.due === null && !('recurrence' in patch)) {
    // A recurrence rule needs a due date; clearing the date ends the repetition.
    const task = await db.tasks.get(id)
    if (task?.recurrence) patch = { ...patch, recurrence: null }
  }
  if ('project_id' in patch) {
    const task = await db.tasks.get(id)
    if (task && patch.project_id !== task.project_id) {
      const memberships = await membershipMap()
      if (scopeOf(task.project_id, memberships) !== scopeOf(patch.project_id, memberships)) {
        return moveTaskAcrossScopes(id, patch)
      }
      const all = await liveTasks()
      const next = { ...patch }
      if (task.parent_id) {
        const parent = all.find((t) => t.id === task.parent_id)
        if (!parent || parent.project_id !== patch.project_id) next.parent_id = null
      }
      const changes: Change[] = [{ entity: 'task', entityId: id, patch: next }]
      for (const d of descendants(id, all)) {
        const t = all.find((x) => x.id === d)
        if (t && t.project_id !== patch.project_id) changes.push({ entity: 'task', entityId: d, patch: { project_id: patch.project_id } })
      }
      await mutateMany(changes)
      return id
    }
  }
  await mutate('task', id, patch)
  return id
}

/**
 * Completing a parent completes every open descendant in one batch; reopening touches
 * only the task. A task with a recurrence rule rolls forward instead (completeTask).
 */
export async function setTaskCompleted(id: string, completed: boolean): Promise<void> {
  if (!completed) {
    // Reopening an occurrence record leaves series_id, so it becomes a standalone
    // open task; reopening an ended series keeps its rule (design D6).
    await mutate('task', id, { completed_at: null })
    return
  }
  await completeTask(id)
}

async function completePlain(id: string, now: number): Promise<void> {
  const all = await liveTasks()
  const changes: Change[] = [{ entity: 'task', entityId: id, patch: { completed_at: now } }]
  for (const d of descendants(id, all)) {
    const t = all.find((x) => x.id === d)
    if (t && !t.completed_at) changes.push({ entity: 'task', entityId: d, patch: { completed_at: now } })
  }
  await mutateMany(changes)
}

/**
 * Complete a task. For a recurring series this records the occurrence (an entity
 * whose id is derived from the series id and occurrence date) and moves the series
 * to its next occurrence in one batch; once the end condition is reached it
 * completes like a plain task. `today` is the device's local date (tests pass it).
 * Returns the id of the occurrence record when the series rolled, otherwise null.
 */
export async function completeTask(id: string, opts: { now?: number; today?: string } = {}): Promise<string | null> {
  const now = opts.now ?? Date.now()
  const today = opts.today ?? todayISO()
  await getDeviceId()
  let recordId: string | null = null
  let plain = false
  await db.transaction('rw', mutationTables(), async () => {
    const series = await db.tasks.get(id)
    const rule = seriesRule(series)
    if (!series || !rule) {
      plain = true
      return
    }
    const plan = planCompletion(series, rule, await db.tasks.toArray(), now, today)
    if (plan.kind === 'end') {
      plain = true
      return
    }
    recordId = plan.recordId
    await mutateMany(plan.changes)
  })
  if (plain) await completePlain(id, now)
  return recordId
}

/**
 * Skip the current occurrence of a series: an ordinary due-date change, no record.
 * Returns false (and writes nothing) when the task is not an open series or the
 * current occurrence is the last one before `until`.
 */
export async function skipOccurrence(id: string, opts: { today?: string } = {}): Promise<boolean> {
  const today = opts.today ?? todayISO()
  await getDeviceId()
  let ok = false
  await db.transaction('rw', mutationTables(), async () => {
    const series = await db.tasks.get(id)
    const rule = seriesRule(series)
    const changes = series && rule ? planSkip(series, rule, today) : null
    if (!changes) return
    await mutateMany(changes)
    ok = true
  })
  return ok
}

/**
 * "This occurrence only": create a standalone copy of the current occurrence (no
 * rule, series_id set, id derived from series and date) and move the series on.
 * Returns the copy's id, or null when there is no next occurrence.
 */
export async function detachOccurrence(id: string, opts: { now?: number; today?: string } = {}): Promise<string | null> {
  const now = opts.now ?? Date.now()
  const today = opts.today ?? todayISO()
  await getDeviceId()
  let copyId: string | null = null
  await db.transaction('rw', mutationTables(), async () => {
    const series = await db.tasks.get(id)
    const rule = seriesRule(series)
    const plan = series && rule ? planDetach(series, rule, now, today) : null
    if (!plan) return
    await mutateMany(plan.changes)
    copyId = plan.copyId
  })
  return copyId
}

/**
 * Set or clear a task's recurrence rule. The rule is stored in canonical form; a
 * task that gets a rule without a due date is given its first occurrence from today.
 */
export async function setRecurrence(
  id: string, input: string | null, opts: { today?: string } = {},
): Promise<{ ok: true; rule: string | null } | { ok: false; error: string }> {
  const task = await db.tasks.get(id)
  if (!task) return { ok: false, error: 'task not found' }
  if (input === null || input.trim() === '') {
    if (task.recurrence !== null) await mutate('task', id, { recurrence: null })
    return { ok: true, rule: null }
  }
  const parsed = parseRule(input)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const patch: Record<string, unknown> = {}
  if (parsed.canonical !== task.recurrence) patch.recurrence = parsed.canonical
  if (!task.due) patch.due = { date: firstOccurrence(parsed.rule, opts.today ?? todayISO()) }
  if (Object.keys(patch).length) await mutate('task', id, patch)
  return { ok: true, rule: parsed.canonical }
}

/** Deleting a task tombstones its whole subtree, one op per task, in one batch. */
export async function deleteTask(id: string): Promise<void> {
  const now = Date.now()
  const all = await liveTasks()
  const changes: Change[] = [{ entity: 'task', entityId: id, patch: { deleted_at: now } }]
  for (const d of descendants(id, all)) changes.push({ entity: 'task', entityId: d, patch: { deleted_at: now } })
  await mutateMany(changes)
}

export async function updateProject(id: string, patch: Partial<Omit<Project, 'id' | '_clock'>>): Promise<void> {
  await mutate('project', id, patch)
}

/**
 * Deleting a project writes only its tombstone and moves its direct sub-projects
 * to its own parent (design D4 of project-hierarchy). Its tasks keep their
 * `project_id` and are hidden while the project is in the Trash (trash-and-history
 * D2), so restoring the project is a single op. One batch.
 *
 * A shared project (project-sharing D8) can only be deleted by its owner: the
 * project and every task in it are tombstoned for all members, and the owner's
 * open tasks are copied into the owner's Inbox, since a task never leaves its scope.
 */
export async function deleteProject(id: string): Promise<void> {
  const project = await db.projects.get(id)
  const memberships = await membershipMap()
  const shared = memberships.has(id)
  if (shared && roleOf(id, memberships) !== 'owner') throw new Error('only the owner can delete a shared project')
  const changes: Change[] = []
  const now = Date.now()
  if (shared) {
    const tasks = await db.tasks.where('project_id').equals(id).toArray()
    const live = tasks.filter((t) => !t.deleted_at)
    changes.push(...copyTasks(live.filter((t) => !t.completed_at), null, assignableIn(null, memberships, await currentUserId())).changes)
    for (const t of live) changes.push({ entity: 'task', entityId: t.id, patch: { deleted_at: now } })
  }
  const parentId = project?.parent_id ?? null
  for (const p of await liveProjects()) {
    // A sub-project never inherits itself as parent (only possible inside an unresolved cycle).
    if (p.parent_id === id && p.id !== id) changes.push({ entity: 'project', entityId: p.id, patch: { parent_id: parentId === p.id ? null : parentId } })
  }
  changes.push({ entity: 'project', entityId: id, patch: { deleted_at: now } })
  await mutateMany(changes)
}

/**
 * Restore a task from the Trash (trash-and-history): clears its tombstone and the
 * tombstones of descendants deleted with it (same deletion time), in one batch.
 * When its project is still deleted the task goes to the Inbox in the same batch;
 * for a task of a shared project that means a copy in the Inbox, because a task
 * never changes sharing scope. Returns the id of the visible task.
 */
export async function restoreTask(id: string): Promise<string> {
  const task = await db.tasks.get(id)
  if (!task) throw new Error('task not found')
  if (!task.deleted_at) return id
  const all = await db.tasks.toArray()
  const subtree = [task, ...[...descendants(id, all)].map((d) => all.find((t) => t.id === d)).filter((t): t is Task => !!t && t.deleted_at === task.deleted_at)]
  const project = task.project_id ? await db.projects.get(task.project_id) : undefined
  const projectGone = !!project?.deleted_at
  if (projectGone) {
    const memberships = await membershipMap()
    if (scopeOf(task.project_id, memberships) !== 'personal') {
      const { changes, ids } = copyTasks(subtree, null, assignableIn(null, memberships, await currentUserId()), { [id]: { position: Date.now() } })
      await mutateMany(changes)
      return ids.get(id) as string
    }
  }
  const changes: Change[] = subtree.map((t) => ({
    entity: 'task' as const, entityId: t.id, patch: projectGone ? { deleted_at: null, project_id: null } : { deleted_at: null },
  }))
  // A task whose parent stays in the Trash is restored at the top level.
  const parent = task.parent_id ? all.find((t) => t.id === task.parent_id) : undefined
  if (projectGone || (parent && parent.deleted_at)) changes[0].patch.parent_id = null
  await mutateMany(changes)
  return id
}

/**
 * Restore a project from the Trash: one op clearing its tombstone. Its tasks kept
 * their project reference and reappear without any task op (trash-and-history D2).
 */
export async function restoreProject(id: string): Promise<void> {
  const project = await db.projects.get(id)
  if (!project) throw new Error('project not found')
  if (!project.deleted_at) return
  const memberships = await membershipMap()
  if (memberships.has(id) && roleOf(id, memberships) !== 'owner') throw new Error('only the owner can restore a shared project')
  await mutate('project', id, { deleted_at: null })
}

const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']
function pickColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)]
}
