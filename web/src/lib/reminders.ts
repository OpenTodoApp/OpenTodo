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

/** Firing time of an offset reminder: from the due time (relative) or the deadline day (deadline). */
function offsetFireAt(kind: 'relative' | 'deadline', task: Pick<Task, 'due' | 'deadline'> | undefined, offset: number): number | null {
  return kind === 'deadline' ? deadlineFireAt(task?.deadline ?? null, offset) : relativeFireAt(task?.due ?? null, offset)
}

/** Add a reminder to a task; returns its id. A relative reminder on an undated task has no firing time yet. */
export async function addReminder(taskId: string, input: ReminderInput, now = Date.now()): Promise<string> {
  const task = await db.tasks.get(taskId)
  if (!task || task.deleted_at) throw new Error('task not found')
  const id = uuid()
  const offset = input.kind === 'absolute' ? null : input.offset_minutes
  if (input.kind !== 'absolute' && !Number.isInteger(offset)) throw new Error('offset must be a whole number of minutes')
  if (input.kind === 'absolute' && !(input.fire_at > 0)) throw new Error('reminder time is required')
  await mutate('reminder', id, {
    task_id: taskId,
    kind: input.kind,
    offset_minutes: offset,
    fire_at: input.kind === 'absolute' ? input.fire_at : offsetFireAt(input.kind, task, input.offset_minutes),
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
  const patch: Partial<Reminder> = { kind: input.kind }
  if (input.kind !== 'absolute') {
    if (!Number.isInteger(input.offset_minutes)) throw new Error('offset must be a whole number of minutes')
    patch.offset_minutes = input.offset_minutes
    patch.fire_at = offsetFireAt(input.kind, task, input.offset_minutes)
  } else {
    if (!(input.fire_at > 0)) throw new Error('reminder time is required')
    patch.offset_minutes = null
    patch.fire_at = input.fire_at
  }
  if (patch.fire_at !== r.fire_at) {
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
  for (const id of taskIds) {
    const task = await db.tasks.get(id)
    if (!task || !task.project_id || task.deleted_at) continue
    if (!(await db.memberships.get(task.project_id))) continue
    const reminders = await db.reminders.where('task_id').equals(id).toArray()
    for (const r of reminders) {
      if (r.deleted_at || r.kind === 'absolute') continue
      const fireAt = offsetFireAt(r.kind, task, r.offset_minutes ?? 0)
      if (fireAt === r.fire_at) continue
      changes.push({ entity: 'reminder', entityId: r.id, patch: { fire_at: fireAt, delivered_at: null, dismissed_at: null } })
    }
  }
  if (changes.length) await mutateMany(changes)
  return changes.length
}
