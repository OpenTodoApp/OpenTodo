// Default reminders (OpenSpec change default-reminders). When a person's write
// gives a task that had no due date a due date, one ordinary relative reminder
// with that person's default for the kind of due (with a time, or a date only)
// joins the same batch (design D3). Its id is derived from the person and the
// task (D4), so it is created at most once per person and task and two devices
// scheduling the same task offline converge on one reminder. When the due
// switches between a date only and a time, an untouched default reminder takes
// the other default (D5). The rule is pure and shared with the server
// (internal/defaultreminder), pinned by defaultReminder.vectors.json.
import { db } from './db'
import { nameId } from './ids'
import { relativeFireAt } from './reminderTime'
import type { Change } from './ops'
import type { Due, Reminder, Task, UserPrefs } from './types'

/** Bounds of a reminder offset, the server's MaxReminderOffset: one year before or after. */
export const MAX_DEFAULT_OFFSET = 525600

/** The two defaults in minutes from the due time (09:00 for a date only); null is none. */
export interface DefaultReminders {
  timed: number | null
  dated: number | null
}

/** One stored value: a whole number of minutes within the limit, else none (the stored value is kept). */
export function parseDefaultReminder(value: unknown): number | null {
  if (typeof value !== 'string' || !/^-?\d{1,7}$/.test(value)) return null
  const n = Number(value)
  return Number.isInteger(n) && Math.abs(n) <= MAX_DEFAULT_OFFSET ? (n === 0 ? 0 : n) : null
}

/** The stored value of a choice: '' for none, else the offset as a decimal string. */
export function formatDefaultReminder(minutes: number | null): string {
  return minutes === null ? '' : String(minutes)
}

/** The account's defaults from its user_prefs row; empty, malformed or out of range reads as none. */
export function readDefaultReminders(row: Partial<Pick<UserPrefs, 'reminder_default_timed' | 'reminder_default_dated'>> | null | undefined): DefaultReminders {
  return { timed: parseDefaultReminder(row?.reminder_default_timed), dated: parseDefaultReminder(row?.reminder_default_dated) }
}

/** The id of a person's default reminder on a task (D4): the same on every device and the server. */
export function defaultReminderId(userId: string, taskId: string): string {
  return nameId('default-reminder', `${userId}\0${taskId}`)
}

/** The task fields the rule reads. */
export type DefaultReminderTask = Partial<Pick<Task, 'due' | 'completed_at' | 'deleted_at' | 'habit'>>

/** A reminder as the rule sees it. */
export type DefaultReminderRow = Partial<Pick<Reminder, 'task_id' | 'kind' | 'offset_minutes' | 'deleted_at'>> & { id: string }

export interface DefaultReminderInput {
  userId: string
  taskId: string
  /** The stored task, or null when this write creates it. */
  before: DefaultReminderTask | null
  /** Every field the write sets on the task. */
  patch: Record<string, unknown>
  /** This person's stored reminders of the task, live or deleted. */
  reminders: readonly DefaultReminderRow[]
  /** Reminder changes already in the same batch (any task; others are ignored). */
  batch: readonly { entityId: string; patch: Record<string, unknown> }[]
  prefs: DefaultReminders
  now: number
  /** Firing time of a relative reminder (this device's zone by default). */
  fireAt?: (due: Due, offset: number) => number | null
}

function dueOf(v: unknown): Due | null {
  if (!v || typeof v !== 'object') return null
  const d = v as Due
  return typeof d.date === 'string' && d.date !== '' ? d : null
}

const timed = (d: Due) => typeof d.time === 'string' && d.time !== ''

/** The task's reminders after the batch: stored rows with the batch's changes over them, plus the batch's new ones. */
function mergedReminders(input: DefaultReminderInput): DefaultReminderRow[] {
  const byId = new Map<string, DefaultReminderRow>()
  for (const r of input.reminders) byId.set(r.id, { ...r })
  for (const c of input.batch) {
    const prev = byId.get(c.entityId)
    if (!prev && c.patch.task_id !== input.taskId) continue
    byId.set(c.entityId, { ...(prev ?? { id: c.entityId }), ...(c.patch as Partial<DefaultReminderRow>), id: c.entityId })
  }
  return [...byId.values()].filter((r) => r.task_id === undefined || r.task_id === input.taskId)
}

/**
 * The reminder changes one write adds for one task (design D3 and D5): none, a
 * new default reminder, or the default reminder switched to the other kind of due.
 */
export function planDefaultReminder(input: DefaultReminderInput): Change[] {
  if (!('due' in input.patch)) return []
  const fire = input.fireAt ?? ((due: Due, offset: number) => relativeFireAt(due, offset))
  const id = defaultReminderId(input.userId, input.taskId)
  const reminders = mergedReminders(input)
  const own = reminders.find((r) => r.id === id)
  const oldDue = dueOf(input.before?.due)
  const newDue = dueOf(input.patch.due)
  if (!newDue) return []
  const pref = (d: Due) => (timed(d) ? input.prefs.timed : input.prefs.dated)
  if (oldDue) {
    // D5: the kind of due changed and the default reminder is untouched.
    if (timed(oldDue) === timed(newDue) || !own || own.deleted_at || (own.kind ?? 'relative') !== 'relative') return []
    const from = pref(oldDue)
    const to = pref(newDue)
    if (from === null || to === null || own.offset_minutes !== from || from === to) return []
    return [{ entity: 'reminder', entityId: id, patch: { offset_minutes: to, fire_at: fire(newDue, to), delivered_at: null, dismissed_at: null } }]
  }
  // D3: the task gets a due date.
  const offset = pref(newDue)
  if (offset === null) return []
  const after = { ...input.before, ...input.patch } as DefaultReminderTask
  if (after.completed_at || after.deleted_at || after.habit === true) return []
  if (reminders.some((r) => !r.deleted_at && (r.kind ?? 'relative') === 'relative')) return []
  // A default reminder the person deleted stays deleted; one Undo removed (no offset left) may come back.
  if (own && (!own.deleted_at || own.offset_minutes !== null)) return []
  return [{ entity: 'reminder', entityId: id, patch: {
    task_id: input.taskId, kind: 'relative', offset_minutes: offset, fire_at: fire(newDue, offset),
    delivered_at: null, dismissed_at: null, created_at: input.now, deleted_at: null,
  } }]
}

/**
 * The default reminder changes of a local batch (design D6): read the signed-in
 * person's defaults and each scheduled task's reminders from this device. A batch
 * that schedules nothing costs no read.
 */
export async function defaultReminderChanges(changes: readonly Change[], now = Date.now()): Promise<Change[]> {
  const patches = new Map<string, Record<string, unknown>>()
  for (const c of changes) {
    if (c.entity !== 'task') continue
    patches.set(c.entityId, { ...patches.get(c.entityId), ...c.patch })
  }
  const scheduled = [...patches].filter(([, p]) => dueOf(p.due))
  if (scheduled.length === 0) return []
  const prefs = readDefaultReminders(await db.userPrefs.get('me'))
  if (prefs.timed === null && prefs.dated === null) return []
  const userId = (await db.meta.get('userId'))?.value as string | undefined
  if (!userId) return []
  const batch = changes.filter((c) => c.entity === 'reminder')
  const out: Change[] = []
  for (const [taskId, patch] of scheduled) {
    const before = (await db.tasks.get(taskId)) ?? null
    const reminders = await db.reminders.where('task_id').equals(taskId).toArray()
    out.push(...planDefaultReminder({ userId, taskId, before, patch, reminders, batch, prefs, now }))
  }
  return out
}
