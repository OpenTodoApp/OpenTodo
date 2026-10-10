// Project sharing on the client (OpenSpec `project-sharing`). Memberships are
// server-owned authorization data: every sync response carries the caller's list,
// which replaces the local cache, so all devices converge on the server's member
// list and roles. Everything here reads the cache, so roles render the same offline.
import { db } from './db'
import type { Clock, Entity, Membership, Op, ProjectRole, Rejection, Task } from './types'

/** The local scope label of a project: its own scope when shared, else the user's personal scope. */
export function scopeOf(projectId: string | null | undefined, memberships: Map<string, Membership>): string {
  return projectId && memberships.has(projectId) ? `project:${projectId}` : 'personal'
}

export async function membershipMap(): Promise<Map<string, Membership>> {
  const list = await db.memberships.toArray()
  return new Map(list.map((m) => [m.projectId, m]))
}

/** The user's role on a project; a project that is not shared is the user's own. */
export function roleOf(projectId: string | null | undefined, memberships: Map<string, Membership>): ProjectRole {
  return (projectId && memberships.get(projectId)?.role) || 'owner'
}

export const canEditTasks = (role: ProjectRole): boolean => role !== 'viewer'
export const canEditProject = (role: ProjectRole): boolean => role === 'owner' || role === 'admin'
export const canDeleteProject = (role: ProjectRole): boolean => role === 'owner'
export const canManageMembers = (role: ProjectRole): boolean => role === 'owner' || role === 'admin'

/** Roles an actor may grant or change: the owner any member role, an admin viewer/editor. */
export function grantableRoles(actor: ProjectRole): Exclude<ProjectRole, 'owner'>[] {
  if (actor === 'owner') return ['viewer', 'editor', 'admin']
  if (actor === 'admin') return ['viewer', 'editor']
  return []
}

/** Whether `actor` may change or remove a member who currently has `target`. */
export function canManage(actor: ProjectRole, target: ProjectRole): boolean {
  if (target === 'owner') return false
  if (actor === 'owner') return true
  return actor === 'admin' && (target === 'viewer' || target === 'editor')
}

/**
 * Adopt the server's membership list. A project that was shared with us before and
 * is missing now (we left or were removed) is purged with its tasks and any queued
 * ops for them, which the server would refuse anyway. Personal data is untouched.
 * Returns the ids of purged projects.
 */
export async function storeMemberships(list: Membership[]): Promise<string[]> {
  const purged: string[] = []
  await db.transaction('rw', [db.memberships, db.projects, db.tasks, db.outbox], async () => {
    const keep = new Set(list.map((m) => m.projectId))
    const previous = await db.memberships.toArray()
    for (const m of previous) {
      if (keep.has(m.projectId)) continue
      purged.push(m.projectId)
      const taskIds = (await db.tasks.where('project_id').equals(m.projectId).primaryKeys()) as string[]
      const gone = new Set<string>([m.projectId, ...taskIds])
      await db.tasks.bulkDelete(taskIds)
      await db.projects.delete(m.projectId)
      const queued = await db.outbox.filter((o) => gone.has(o.entityId)).primaryKeys()
      await db.outbox.bulkDelete(queued as number[])
    }
    await db.memberships.clear()
    if (list.length > 0) await db.memberships.bulkPut(list)
  })
  return purged
}

/** What the user is told after the server refused some of their changes. */
export interface RejectedNotice {
  count: number
  projects: string[]
  tasks: string[]
}

type Row = Record<string, unknown> & { id: string; _clock?: Clock }

function tableFor(entity: Entity) {
  switch (entity) {
    case 'project': return db.projects
    case 'label': return db.labels
    case 'view': return db.views
    default: return db.tasks
  }
}

/**
 * First half of handling refused ops (design D3): forget the local winner clock of
 * every refused field so the server's value, which travels in the same response,
 * wins when it is applied. Call before applying the response's ops, then call
 * dropUnconfirmed with the returned keys. Returns a notice naming what was refused.
 */
export async function forgetRejected(sent: Op[], rejected: Rejection[]): Promise<{ keys: string[]; notice: RejectedNotice | null }> {
  if (rejected.length === 0) return { keys: [], notice: null }
  const byId = new Map(sent.map((o) => [o.id, o]))
  const keys = new Set<string>()
  const projects = new Set<string>()
  const tasks = new Set<string>()
  let count = 0
  await db.transaction('rw', [db.projects, db.tasks, db.labels, db.views], async () => {
    for (const r of rejected) {
      const op = byId.get(r.id)
      if (!op) continue
      count++
      const table = tableFor(op.entity) as unknown as { get(id: string): Promise<Row | undefined>; put(v: Row): Promise<unknown> }
      const row = await table.get(op.entityId)
      if (!row) continue
      keys.add(`${op.entity}:${op.entityId}`)
      if (op.entity === 'task') {
        const t = row as unknown as Task
        if (t.title) tasks.add(t.title)
        if (t.project_id) {
          const p = await db.projects.get(t.project_id)
          if (p?.name) projects.add(p.name)
        }
      } else if (op.entity === 'project' && typeof row.name === 'string') {
        projects.add(row.name)
      }
      const clock = { ...(row._clock ?? {}) }
      if (op.field in clock) {
        delete clock[op.field]
        await table.put({ ...row, _clock: clock })
      }
    }
  })
  return { keys: [...keys], notice: count ? { count, projects: [...projects], tasks: [...tasks] } : null }
}

/**
 * Second half: after the server's values were applied, a row that is left without
 * any confirmed field existed only on this device (for example a task a viewer
 * created offline) and is removed.
 */
export async function dropUnconfirmed(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await db.transaction('rw', [db.projects, db.tasks, db.labels, db.views], async () => {
    for (const key of keys) {
      const i = key.indexOf(':')
      const entity = key.slice(0, i) as Entity
      const id = key.slice(i + 1)
      const table = tableFor(entity) as unknown as { get(id: string): Promise<Row | undefined>; delete(id: string): Promise<void> }
      const row = await table.get(id)
      if (row && Object.keys(row._clock ?? {}).length === 0) await table.delete(id)
    }
  })
}

/** One line for the user, e.g. "2 changes were not accepted (your role in Home changed): Milk, Bread". */
export function describeRejected(n: RejectedNotice): string {
  const what = n.count === 1 ? '1 change was not accepted' : `${n.count} changes were not accepted`
  const where = n.projects.length ? ` (your role in ${n.projects.join(', ')} changed)` : ''
  const tasks = n.tasks.length ? `: ${n.tasks.slice(0, 5).join(', ')}${n.tasks.length > 5 ? '…' : ''}` : ''
  return `${what}${where}${tasks}`
}
