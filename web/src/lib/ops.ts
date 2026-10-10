// Every local mutation becomes field-level ops that are applied to IndexedDB
// immediately (optimistic, offline-safe) and queued for the server.
import { db, entityTables, getMeta, setMeta } from './db'
import { hlcNow, hlcSeed, wins } from './hlc'
import { descendants, isDescendant } from './tree'
import { ENTITIES, type Clock, type Entity, type Label, type Op, type Project, type Task } from './types'

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
  return entity === 'project' ? db.projects : entity === 'label' ? db.labels : db.tasks
}

const PROJECT_DEFAULTS: Omit<Project, 'id' | '_clock'> = {
  name: '', color: '#64748b', position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null,
}
const TASK_DEFAULTS: Omit<Task, 'id' | '_clock'> = {
  title: '', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [],
  position: 0, created_at: 0, completed_at: null, deleted_at: null,
}
const LABEL_DEFAULTS: Omit<Label, 'id' | '_clock'> = {
  name: '', color: '#64748b', position: 0, created_at: 0, deleted_at: null,
}
const DEFAULTS: Record<Entity, Record<string, unknown>> = { project: PROJECT_DEFAULTS, task: TASK_DEFAULTS, label: LABEL_DEFAULTS }

/**
 * Apply ops to the local store using per-field last-writer-wins. Safe to call with
 * ops in any order and any number of times: the result depends only on the set of ops.
 * Ops for entities this build does not know (a newer server) are skipped, not fatal.
 */
export async function applyOps(ops: Op[]): Promise<void> {
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
    for (const [, list] of grouped) {
      const { entity, entityId } = list[0]
      const table = tableFor(entity)
      const existing = (await table.get(entityId)) as (Project | Task | Label) | undefined
      const row: Record<string, unknown> = existing ? { ...existing } : { ...DEFAULTS[entity], id: entityId, _clock: {} }
      const clock: Clock = { ...(row._clock as Clock) }
      let changed = !existing
      for (const op of list) {
        if (!wins(op.ts, op.device, clock[op.field])) continue
        row[op.field] = op.value
        clock[op.field] = { ts: op.ts, device: op.device }
        changed = true
      }
      if (changed) {
        row._clock = clock
        await (table as unknown as { put(v: unknown): Promise<unknown> }).put(row)
      }
    }
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
  const ts = hlcNow()
  const ops: Op[] = []
  for (const { entity, entityId, patch } of changes) {
    for (const [field, value] of Object.entries(patch)) {
      ops.push({ id: crypto.randomUUID(), entity, entityId, field, value, ts, device })
    }
  }
  if (ops.length === 0) return
  await db.transaction('rw', mutationTables(), async () => {
    await applyOps(ops)
    await db.outbox.bulkAdd(ops)
    await db.meta.put({ key: 'hlc', value: ts })
  })
  for (const fn of mutationListeners) fn()
}

/** Record field changes for one entity: apply locally and enqueue for the server. */
export async function mutate(entity: Entity, entityId: string, patch: Record<string, unknown>): Promise<void> {
  await mutateMany([{ entity, entityId, patch }])
}

export async function createProject(input: { name: string; color?: string }): Promise<string> {
  const id = crypto.randomUUID()
  const now = Date.now()
  await mutate('project', id, {
    name: input.name.trim(), color: input.color ?? pickColor(), position: now, archived: false,
    parent_id: null, created_at: now, deleted_at: null,
  })
  return id
}

export async function createTask(input: {
  title: string; project_id?: string | null; parent_id?: string | null; due?: Task['due']; priority?: Task['priority']; labels?: string[]
}): Promise<string> {
  const id = crypto.randomUUID()
  const now = Date.now()
  await mutate('task', id, {
    title: input.title.trim(), description: '', project_id: input.project_id ?? null, parent_id: input.parent_id ?? null,
    priority: input.priority ?? 4, due: input.due ?? null, labels: input.labels ?? [], position: now, created_at: now,
    completed_at: null, deleted_at: null,
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

/**
 * Edit fields. Changing `project_id` moves the whole subtree (one op per descendant)
 * and detaches the task from a parent that stays behind, so a subtask is always in
 * its parent's project.
 */
export async function updateTask(id: string, patch: Partial<Omit<Task, 'id' | '_clock'>>): Promise<void> {
  if ('project_id' in patch) {
    const task = await db.tasks.get(id)
    if (task && patch.project_id !== task.project_id) {
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
      return
    }
  }
  await mutate('task', id, patch)
}

/** Completing a parent completes every open descendant in one batch; reopening touches only the task. */
export async function setTaskCompleted(id: string, completed: boolean): Promise<void> {
  const now = Date.now()
  if (!completed) {
    await mutate('task', id, { completed_at: null })
    return
  }
  const all = await liveTasks()
  const changes: Change[] = [{ entity: 'task', entityId: id, patch: { completed_at: now } }]
  for (const d of descendants(id, all)) {
    const t = all.find((x) => x.id === d)
    if (t && !t.completed_at) changes.push({ entity: 'task', entityId: d, patch: { completed_at: now } })
  }
  await mutateMany(changes)
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

/** Deleting a project moves its open tasks to the Inbox so nothing is lost silently. */
export async function deleteProject(id: string): Promise<void> {
  const tasks = await db.tasks.where('project_id').equals(id).toArray()
  for (const t of tasks) {
    if (!t.deleted_at) await mutate('task', t.id, { project_id: null })
  }
  await mutate('project', id, { deleted_at: Date.now() })
}

const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']
function pickColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)]
}
