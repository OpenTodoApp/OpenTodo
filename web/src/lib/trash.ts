// Trash on the client (OpenSpec change `trash-and-history`). The Trash is a view
// over local tombstones (design D1); restoring is an ordinary op (ops.ts). Tasks of
// a deleted project keep their project reference and are hidden everywhere but the
// Trash (design D2), so every task list goes through `isTaskVisible`.
//
// Purge is not an op (design D5): the server removes the data and every device
// learns about it from the `purged` list of the next sync. A purge is only sent
// while online; offline it is queued in `meta` and shown as pending, and nothing
// is deleted locally before the server confirms.
import { api, ApiError, isNetworkError } from './api'
import { db, entityTables, getMeta, setMeta } from './db'
import type { Entity, Project, Task } from './types'

/** Ids of every deleted project in a list. */
export function deletedProjectIds(projects: Iterable<Pick<Project, 'id' | 'deleted_at'>>): Set<string> {
  const out = new Set<string>()
  for (const p of projects) if (p.deleted_at) out.add(p.id)
  return out
}

/** A task shows up in views unless it is deleted or its project is in the Trash. */
export function isTaskVisible(t: Pick<Task, 'deleted_at' | 'project_id'>, deletedProjects: Set<string>): boolean {
  return !t.deleted_at && !(t.project_id && deletedProjects.has(t.project_id))
}

/** Every visible task (live queries use this so a project restore shows its tasks again). */
export async function visibleTasks(): Promise<Task[]> {
  const gone = new Set((await db.projects.filter((p) => !!p.deleted_at).primaryKeys()) as string[])
  return db.tasks.filter((t) => isTaskVisible(t, gone)).toArray()
}

export interface TrashItem {
  entity: 'task' | 'project'
  id: string
  title: string
  deletedAt: number
  /** For tasks: the name of their project ("Inbox" when none). */
  projectName?: string
  color?: string
}

/** Deleted tasks and projects, newest deletion first. */
export function trashItems(tasks: Iterable<Task>, projects: Iterable<Project>): TrashItem[] {
  const byId = new Map<string, Project>()
  const out: TrashItem[] = []
  for (const p of projects) {
    byId.set(p.id, p)
    if (p.deleted_at) out.push({ entity: 'project', id: p.id, title: p.name || 'Untitled project', deletedAt: p.deleted_at, color: p.color })
  }
  for (const t of tasks) {
    if (!t.deleted_at) continue
    const project = t.project_id ? byId.get(t.project_id) : undefined
    out.push({ entity: 'task', id: t.id, title: t.title || 'Untitled', deletedAt: t.deleted_at, projectName: project ? project.name : 'Inbox' })
  }
  return out.sort((a, b) => b.deletedAt - a.deletedAt || (a.id < b.id ? -1 : 1))
}

const DAY_MS = 86_400_000

/** Whole days until the server purges an item, or null when retention is off (0). */
export function remainingDays(deletedAt: number, retentionDays: number, now = Date.now()): number | null {
  if (!retentionDays || retentionDays <= 0) return null
  return Math.max(0, Math.ceil((deletedAt + retentionDays * DAY_MS - now) / DAY_MS))
}

export const RETENTION_KEY = 'trashRetentionDays'

/** The server's Trash retention as last reported by sync (30 until known). */
export function trashRetentionDays(): Promise<number> {
  return getMeta<number>(RETENTION_KEY, 30)
}

// ---- purge ----

export interface PurgeRequest {
  entity: 'task' | 'project'
  id: string
}

export const PENDING_PURGES_KEY = 'pendingPurges'

export function pendingPurges(): Promise<PurgeRequest[]> {
  return getMeta<PurgeRequest[]>(PENDING_PURGES_KEY, [])
}

async function setPendingPurges(list: PurgeRequest[]): Promise<void> {
  await setMeta(PENDING_PURGES_KEY, list)
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Ask the server to purge trashed items. Returns 'done' when the server confirmed
 * (the local rows are removed right away) or 'pending' when offline (queued and
 * retried by the sync loop). Server refusals other than "already gone" are thrown.
 */
export async function purgeItems(items: PurgeRequest[]): Promise<'done' | 'pending'> {
  if (items.length === 0) return 'done'
  if (isOffline()) {
    await queue(items)
    return 'pending'
  }
  try {
    for (const it of items) await purgeOne(it)
  } catch (err) {
    if (isNetworkError(err)) {
      await queue(items)
      return 'pending'
    }
    throw err
  }
  return 'done'
}

/** Empty the whole Trash (server side: every item the user may delete). */
export async function emptyTrash(): Promise<'done' | 'pending'> {
  const tasks = await db.tasks.filter((t) => !!t.deleted_at).toArray()
  const projects = await db.projects.filter((p) => !!p.deleted_at).toArray()
  const items: PurgeRequest[] = [
    ...projects.map((p) => ({ entity: 'project' as const, id: p.id })),
    ...tasks.map((t) => ({ entity: 'task' as const, id: t.id })),
  ]
  if (isOffline()) {
    await queue(items)
    return 'pending'
  }
  try {
    await api.emptyTrash()
  } catch (err) {
    if (isNetworkError(err)) {
      await queue(items)
      return 'pending'
    }
    throw err
  }
  await removeLocally(items.map((i) => ({ entity: i.entity, entityId: i.id })), true)
  return 'done'
}

async function queue(items: PurgeRequest[]): Promise<void> {
  const list = await pendingPurges()
  const key = (p: PurgeRequest) => `${p.entity}:${p.id}`
  const have = new Set(list.map(key))
  for (const it of items) if (!have.has(key(it))) list.push(it)
  await setPendingPurges(list)
}

async function purgeOne(it: PurgeRequest): Promise<void> {
  try {
    await api.purge(it.entity, it.id)
  } catch (err) {
    // Already purged elsewhere: the goal is reached. Restored meanwhile: keep it.
    if (err instanceof ApiError && (err.status === 404 || err.code === 'not_deleted')) return
    throw err
  }
  await removeLocally([{ entity: it.entity, entityId: it.id }], true)
}

/** Send queued purges; called by the sync loop after a successful exchange. */
export async function flushPendingPurges(): Promise<void> {
  const list = await pendingPurges()
  if (list.length === 0 || isOffline()) return
  const left: PurgeRequest[] = []
  for (const it of list) {
    try {
      // Restored while queued: the user changed their mind, drop the request.
      const row = it.entity === 'task' ? await db.tasks.get(it.id) : await db.projects.get(it.id)
      if (row && !row.deleted_at) continue
      await purgeOne(it)
    } catch (err) {
      if (isNetworkError(err)) left.push(it)
      // Other refusals (forbidden) are dropped: retrying cannot succeed.
    }
  }
  await setPendingPurges(left)
}

/**
 * Delete purged entities from the local store together with any queued ops and
 * pending purge requests for them. `cascade` also removes what the server purges
 * with them (tasks of a project, deleted descendants of a task, their reminders);
 * the sync response's `purged` list already names every cascaded entity.
 */
export async function removeLocally(list: { entity: Entity; entityId: string }[], cascade = false): Promise<void> {
  if (list.length === 0) return
  await db.transaction('rw', [...entityTables(), db.outbox, db.meta], async () => {
    const gone = new Map<string, Entity>()
    for (const p of list) gone.set(p.entityId, p.entity)
    if (cascade) {
      const tasks = await db.tasks.toArray()
      const taskIds = new Set<string>()
      for (const p of list) {
        if (p.entity === 'project') for (const t of tasks) if (t.project_id === p.entityId) taskIds.add(t.id)
        if (p.entity === 'task') taskIds.add(p.entityId)
      }
      // Deleted descendants of purged tasks.
      let grew = true
      while (grew) {
        grew = false
        for (const t of tasks) {
          if (!taskIds.has(t.id) && t.parent_id && taskIds.has(t.parent_id) && t.deleted_at) {
            taskIds.add(t.id)
            grew = true
          }
        }
      }
      for (const id of taskIds) gone.set(id, 'task')
      for (const r of await db.reminders.toArray()) if (taskIds.has(r.task_id)) gone.set(r.id, 'reminder')
    }
    const byEntity: Record<string, string[]> = {}
    for (const [id, entity] of gone) (byEntity[entity] ??= []).push(id)
    if (byEntity.task) await db.tasks.bulkDelete(byEntity.task)
    if (byEntity.project) await db.projects.bulkDelete(byEntity.project)
    if (byEntity.reminder) await db.reminders.bulkDelete(byEntity.reminder)
    if (byEntity.label) await db.labels.bulkDelete(byEntity.label)
    if (byEntity.view) await db.views.bulkDelete(byEntity.view)
    const queued = await db.outbox.filter((o) => gone.get(o.entityId) === o.entity).primaryKeys()
    await db.outbox.bulkDelete(queued as number[])
    const pending = ((await db.meta.get(PENDING_PURGES_KEY))?.value as PurgeRequest[] | undefined) ?? []
    const left = pending.filter((p) => gone.get(p.id) !== p.entity)
    if (left.length !== pending.length) await db.meta.put({ key: PENDING_PURGES_KEY, value: left })
  })
}
