// Operations the plugin writes (obsidian-plugin D4): ordinary task, label and
// time-entry ops made on the device, with ids from crypto.randomUUID and
// timestamps from the web app's hybrid logical clock, as device
// `obsidian:<install id>`. They are queued in the outbox and pushed through the
// sync exchange; the server converges them like any device's.
import { hlcNow } from '../../web/src/lib/hlc'
import { findLabel, labelNameKey, type LabelRef } from '../../web/src/lib/nlp/quickadd'
import { firstOccurrence } from '../../web/src/lib/recurrence'
import type { Origin } from '../../web/src/lib/types'
import type { Fields } from './capture'

export interface Op {
  id: string
  entity: string
  entityId: string
  field: string
  value: unknown
  ts: number
  device: string
}

export const devicePrefix = 'obsidian:'

/** The origin linking a task back to its note (obsidian-origin D2). */
export function noteOrigin(vault: string, path: string): Origin {
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')
  return { kind: 'obsidian', id: path, url: `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path)}`, title: name }
}

function opsOf(entity: string, entityId: string, patch: Record<string, unknown>, ts: number, device: string): Op[] {
  return Object.entries(patch).map(([field, value]) => ({ id: crypto.randomUUID(), entity, entityId, field, value, ts, device }))
}

export interface NewTask {
  title: string
  fields: Fields
  /** The target project, or null for the Inbox. */
  projectId: string | null
  origin: Origin
}

export interface Built {
  taskId: string
  ops: Op[]
  /** Labels this batch creates, by name key, so a selection creates each once. */
  createdLabels: Map<string, string>
}

/**
 * The ops of one new task, as the web app's planTask writes them: every task
 * field the line set, label ids for its labels (new labels created once), the
 * origin, and a closed time entry for time already spent (quick add `30m/2h`).
 */
export function taskOps(t: NewTask, ctx: { device: string; userId: string; labels: readonly LabelRef[]; createdLabels?: Map<string, string>; now?: number; today: string }): Built {
  const ts = hlcNow()
  const now = ctx.now ?? Date.now()
  const id = crypto.randomUUID()
  const created = ctx.createdLabels ?? new Map<string, string>()
  const ops: Op[] = []
  const labelIds: string[] = []
  for (const name of t.fields.labels) {
    const key = labelNameKey(name)
    if (!key) continue
    let lid = findLabel(name, ctx.labels)?.id ?? created.get(key)
    if (!lid) {
      lid = crypto.randomUUID()
      created.set(key, lid)
      ops.push(...opsOf('label', lid, { name: name.trim(), position: now, created_at: now, deleted_at: null }, ts, ctx.device))
    }
    if (!labelIds.includes(lid)) labelIds.push(lid)
  }
  const f = t.fields
  let due = f.due ?? null
  const extra: Record<string, unknown> = {}
  if (f.recurrence) {
    extra.recurrence = f.recurrence
    if (!due) due = { date: firstOccurrence(f.recurrence, ctx.today) }
  }
  if (f.deadline) extra.deadline = f.deadline
  if (f.start) extra.start = f.start
  if (f.evening) extra.evening = true
  else if (f.dayPart) extra.day_part = f.dayPart
  if (f.energy) extra.energy = f.energy
  ops.push(...opsOf('task', id, {
    title: t.title.trim(), description: '', project_id: t.projectId, parent_id: null, priority: f.priority ?? 4, due, labels: labelIds,
    position: now, created_at: now, completed_at: null, deleted_at: null, estimate_minutes: f.estimate ?? null, ...extra, origin: t.origin,
  }, ts, ctx.device))
  if (f.spent && ctx.userId) {
    ops.push(...opsOf('time_entry', crypto.randomUUID(), {
      task_id: id, user_id: ctx.userId, started_at: now - f.spent * 60000, ended_at: now, device_id: ctx.device, note: '', created_at: now, deleted_at: null,
    }, ts, ctx.device))
  }
  return { taskId: id, ops, createdLabels: created }
}

/** Undo (D8): the task goes to the Trash, restorable like any trashed task. */
export function trashOps(taskId: string, device: string, now = Date.now()): Op[] {
  return opsOf('task', taskId, { deleted_at: now }, hlcNow(), device)
}

/** A renamed note (D11): the linked task's origin names the new path. */
export function originOps(taskId: string, origin: Origin, device: string): Op[] {
  return opsOf('task', taskId, { origin }, hlcNow(), device)
}
