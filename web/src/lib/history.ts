// Revision history (OpenSpec change `trash-and-history`, design D3/D4). History is
// read live from the server's operation log and kept in component state only:
// offline the panel says it needs a connection instead of showing stale data.
// Restoring an earlier value is an ordinary edit with the current clock, so it
// applies locally at once, appears in the history itself and converges by LWW.
import { api } from './api'
import { decryptChanges } from './e2ee'
import { updateProject, updateTask } from './ops'
import type { ChangeSet, HistoryPage, Membership, Project, Task } from './types'

/** One page of history; ciphertext values (OpenSpec e2ee) are decrypted for display. */
export async function fetchHistory(entity: 'task' | 'project', id: string, before?: number): Promise<HistoryPage> {
  const page = await api.history(entity, id, before)
  const changeSets = await Promise.all(page.changeSets.map(async (s) => ({ ...s, changes: await decryptChanges(entity, id, s.changes) })))
  return { ...page, changeSets }
}

/**
 * How a change set's device appears: "this device" for ours, "API" for REST
 * writes, otherwise "another device" with a short id; the author's name is added
 * when someone else made the change (shared projects).
 */
export function deviceLabel(set: Pick<ChangeSet, 'device' | 'userId'>, myDevice: string, myUserId?: string, memberships: Membership[] = []): string {
  const base = set.device === myDevice ? 'this device' : set.device === 'server' ? 'API' : set.device.startsWith('caldav:') ? 'a calendar app (CalDAV)' : `another device (${set.device.slice(0, 4)})`
  if (!myUserId || set.userId === myUserId) return base
  for (const m of memberships) {
    const who = m.members.find((x) => x.userId === set.userId)
    if (who) return `${who.name || who.email} · ${base}`
  }
  return base
}

/** Fields whose old value can be put back from the timeline. */
export const RESTORABLE: Record<'task' | 'project', readonly string[]> = {
  task: ['title', 'description', 'priority', 'due', 'labels', 'estimate_minutes', 'recurrence', 'completed_at', 'deleted_at', 'project_id', 'parent_id'],
  project: ['name', 'color', 'archived', 'parent_id', 'deleted_at'],
}

export function canRestoreField(entity: 'task' | 'project', field: string): boolean {
  return RESTORABLE[entity].includes(field)
}

/**
 * Put back an earlier value of one field as a new op (design D4). For tasks this
 * goes through updateTask, so a project change keeps subtrees together and moves
 * across sharing scopes as copy + tombstone. Returns the task id afterwards.
 */
export async function restoreValue(entity: 'task' | 'project', id: string, field: string, value: unknown): Promise<string> {
  if (!canRestoreField(entity, field)) throw new Error(`${field} cannot be restored`)
  if (entity === 'task') return updateTask(id, { [field]: value } as Partial<Omit<Task, 'id' | '_clock'>>)
  await updateProject(id, { [field]: value } as Partial<Omit<Project, 'id' | '_clock'>>)
  return id
}

/** A short human rendering of a field value for the timeline. */
export function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field.endsWith('_at') && typeof value === 'number') return new Date(value).toLocaleString()
  if (field === 'due' && typeof value === 'object') {
    const d = value as { date?: string; time?: string }
    return [d.date, d.time].filter(Boolean).join(' ')
  }
  if (field === 'priority') return `P${String(value)}`
  if (field === 'estimate_minutes' && typeof value === 'number') return `${value} min`
  if (Array.isArray(value)) return value.length ? `${value.length} item${value.length === 1 ? '' : 's'}` : '—'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  const s = typeof value === 'string' ? value : JSON.stringify(value)
  return s.length > 80 ? `${s.slice(0, 79)}…` : s
}
