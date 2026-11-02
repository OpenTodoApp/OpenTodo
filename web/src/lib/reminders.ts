// Reminder writes (OpenSpec change `reminders`). Every helper is an ordinary
// field-level mutation through mutate(), so reminders work offline and converge by
// last-writer-wins like tasks. Relative reminders are kept in step with their
// task's due time, and deadline reminders with its deadline, by mutateMany (see
// reminderFollowUps in ops.ts).
import { db } from './db'
import { mutate, mutateMany, type Change } from './ops'
import { deadlineFireAt, relativeFireAt, snoozeUntil, type SnoozeChoice } from './reminderTime'
import type { Op, Reminder, Task } from './types'
import { uuid } from './ids'

export type ReminderInput =
  | { kind: 'relative'; offset_minutes: number }
  | { kind: 'absolute'; fire_at: number }
  /** Offset from 09:00 local on the task's deadline (OpenSpec change `deadlines`). */
  | { kind: 'deadline'; offset_minutes: number }
  /** Fires on a phone that enters or leaves the circle around the task's location (location-reminders). */
  | { kind: 'arrive' | 'leave'; radius_m: number }

/** location-reminders D1: a whole number of metres from 100 to 5,000. */
function checkRadius(m: number): void {
  if (!Number.isInteger(m) || m < 100 || m > 5000) throw new Error('radius must be 100 to 5000 metres')
}

/** The kind-dependent fields of a reminder: a location kind never has a time or offset, other kinds no radius. */
function shapeOf(input: ReminderInput, task: Pick<Task, 'due' | 'deadline'> | undefined): Pick<Reminder, 'kind' | 'offset_minutes' | 'fire_at' | 'radius_m'> {
  if ('radius_m' in input) {
    checkRadius(input.radius_m)
    return { kind: input.kind, offset_minutes: null, fire_at: null, radius_m: input.radius_m }
  }
  if (input.kind === 'absolute') {
    if (!(input.fire_at > 0)) throw new Error('reminder time is required')
    return { kind: 'absolute', offset_minutes: null, fire_at: input.fire_at, radius_m: null }
  }
  if (!Number.isInteger(input.offset_minutes)) throw new Error('offset must be a whole number of minutes')
  return { kind: input.kind, offset_minutes: input.offset_minutes, fire_at: offsetFireAt(input.kind, task, input.offset_minutes), radius_m: null }
}

/** Firing time of an offset reminder: from the due time (relative) or the deadline day (deadline). */
function offsetFireAt(kind: 'relative' | 'deadline', task: Pick<Task, 'due' | 'deadline'> | undefined, offset: number): number | null {
  return kind === 'deadline' ? deadlineFireAt(task?.deadline ?? null, offset) : relativeFireAt(task?.due ?? null, offset)
}

/** Add a reminder to a task; returns its id. A relative reminder on an undated task has no firing time yet. */
export async function addReminder(taskId: string, input: ReminderInput, now = Date.now()): Promise<string> {
  const task = await db.tasks.get(taskId)
  if (!task || task.deleted_at) throw new Error('task not found')
  const id = uuid()
  const { radius_m, ...shape } = shapeOf(input, task)
  await mutate('reminder', id, {
    task_id: taskId,
    ...shape,
    // Only a location reminder writes a radius; the others keep the field's default.
    ...(radius_m != null ? { radius_m } : {}),
    delivered_at: null,
    dismissed_at: null,
    created_at: now,
    deleted_at: null,
  })
  return id
}

/**
 * Edit a reminder: change its offset (relative) or moment (absolute), or switch
 * kind. The firing time is recomputed and delivery state cleared when it moves.
 */
export async function updateReminder(id: string, input: ReminderInput): Promise<void> {
  const r = await db.reminders.get(id)
  if (!r || r.deleted_at) throw new Error('reminder not found')
  const task = await db.tasks.get(r.task_id)
  const shape = shapeOf(input, task)
  const patch: Partial<Reminder> = { kind: shape.kind, offset_minutes: shape.offset_minutes, fire_at: shape.fire_at }
  if (shape.radius_m != null || r.radius_m != null) patch.radius_m = shape.radius_m
  // A moved firing time, or another place or circle, fires again.
  if (patch.fire_at !== r.fire_at || shape.kind !== r.kind) {
    patch.delivered_at = null
    patch.dismissed_at = null
  }
  await mutate('reminder', id, patch)
}

/** Tombstone a reminder. */
export async function deleteReminder(id: string, now = Date.now()): Promise<void> {
  await mutate('reminder', id, { deleted_at: now })
}

/**
 * Snooze: a new firing time (10 min, 1 h or tomorrow 09:00, or an explicit
 * instant) with delivered and dismissed state cleared, so it fires again. The
 * kind and offset are kept: a relative reminder on a recurring task still follows
 * the next occurrence once the series rolls forward (that due change recomputes it).
 */
export async function snoozeReminder(id: string, choice: SnoozeChoice | number, now = Date.now()): Promise<number> {
  const fireAt = typeof choice === 'number' ? choice : snoozeUntil(choice, now)
  await mutate('reminder', id, { fire_at: fireAt, delivered_at: null, dismissed_at: null })
  return fireAt
}

/** A dismissed location reminder watches its place again (location-reminders D2 "Arm again"). */
export async function rearmReminder(id: string): Promise<void> {
  await mutate('reminder', id, { dismissed_at: null })
}

/** Dismiss the current firing. */
export async function dismissReminder(id: string, now = Date.now()): Promise<void> {
  await mutate('reminder', id, { dismissed_at: now })
}

/** Live reminders of a task, earliest first (undated relative ones last). */
export async function remindersOf(taskId: string): Promise<Reminder[]> {
  const list = await db.reminders.where('task_id').equals(taskId).filter((r) => !r.deleted_at).toArray()
  return sortReminders(list)
}

export function sortReminders(list: Reminder[]): Reminder[] {
  return [...list].sort((a, b) => (a.fire_at ?? Infinity) - (b.fire_at ?? Infinity) || a.created_at - b.created_at)
}

/**
 * Reminders are personal (OpenSpec `reminders` with `project-sharing`): they live
 * in their creator's personal scope, so when another member moves the due date of
 * a task in a shared project, that member's device cannot rewrite our relative
 * reminders. After pulling, this device recomputes them itself for every shared
 * task whose due arrived in `ops`. Personal tasks are left alone: there the device
 * that changed the due wrote the reminders in the same batch. Deadline reminders
 * follow an arriving deadline the same way (OpenSpec change `deadlines`).
 */
export async function followSharedDueChanges(ops: Op[]): Promise<number> {
  const taskIds = new Set(ops.filter((o) => o.entity === 'task' && (o.field === 'due' || o.field === 'deadline')).map((o) => o.entityId))
  if (taskIds.size === 0) return 0
  const changes: Change[] = []
  // Read in bulk (performance-10k): a first sync's page dates hundreds of tasks.
  const tasks = (await db.tasks.bulkGet([...taskIds])).filter((t): t is Task => !!t && !!t.project_id && !t.deleted_at)
  const projects = [...new Set(tasks.map((t) => t.project_id as string))]
  const shared = new Set((await db.memberships.bulkGet(projects)).filter((m) => !!m).map((m) => m.projectId))
  const sharedTasks = new Map(tasks.filter((t) => shared.has(t.project_id as string)).map((t) => [t.id, t]))
  if (sharedTasks.size === 0) return 0
  const reminders = await db.reminders.where('task_id').anyOf([...sharedTasks.keys()]).toArray()
  for (const r of reminders) {
    const task = sharedTasks.get(r.task_id)
    if (!task || r.deleted_at || (r.kind !== 'relative' && r.kind !== 'deadline')) continue
    const fireAt = offsetFireAt(r.kind, task, r.offset_minutes ?? 0)
    if (fireAt === r.fire_at) continue
    changes.push({ entity: 'reminder', entityId: r.id, patch: { fire_at: fireAt, delivered_at: null, dismissed_at: null } })
  }
  if (changes.length) await mutateMany(changes)
  return changes.length
}
