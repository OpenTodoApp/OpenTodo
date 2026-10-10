// Every local mutation becomes field-level ops that are applied to IndexedDB
// immediately (optimistic, offline-safe) and queued for the server.
import { db, entityTables, getMeta, setMeta } from './db'
import { hlcNow, hlcSeed, wins } from './hlc'
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

/** Tables a read-modify-write helper must lock to wrap mutate() in one transaction. */
export function mutationTables() {
  return [...entityTables(), db.outbox, db.meta]
}

/**
 * Record field changes for one entity: apply locally and enqueue for the server, in one
 * transaction. Callers that must read the current row first (e.g. the task label array)
 * wrap the read and this call in `db.transaction('rw', mutationTables(), …)` after
 * awaiting getDeviceId() once, so the read cannot go stale before the write.
 */
export async function mutate(entity: Entity, entityId: string, patch: Record<string, unknown>): Promise<void> {
  const device = await getDeviceId()
  const ts = hlcNow()
  const ops: Op[] = Object.entries(patch).map(([field, value]) => ({
    id: crypto.randomUUID(), entity, entityId, field, value, ts, device,
  }))
  if (ops.length === 0) return
  await db.transaction('rw', mutationTables(), async () => {
    await applyOps(ops)
    await db.outbox.bulkAdd(ops)
    await db.meta.put({ key: 'hlc', value: ts })
  })
  for (const fn of mutationListeners) fn()
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

export async function createTask(input: { title: string; project_id?: string | null; due?: Task['due']; priority?: Task['priority'] }): Promise<string> {
  const id = crypto.randomUUID()
  const now = Date.now()
  await mutate('task', id, {
    title: input.title.trim(), description: '', project_id: input.project_id ?? null, parent_id: null,
    priority: input.priority ?? 4, due: input.due ?? null, labels: [], position: now, created_at: now,
    completed_at: null, deleted_at: null,
  })
  return id
}

export async function updateTask(id: string, patch: Partial<Omit<Task, 'id' | '_clock'>>): Promise<void> {
  await mutate('task', id, patch)
}

export async function setTaskCompleted(id: string, completed: boolean): Promise<void> {
  await mutate('task', id, { completed_at: completed ? Date.now() : null })
}

export async function deleteTask(id: string): Promise<void> {
  await mutate('task', id, { deleted_at: Date.now() })
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
