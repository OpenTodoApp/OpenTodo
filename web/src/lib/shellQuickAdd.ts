// Quick add from the Android notification shade (OpenSpec change
// android-quick-add-notification): the shell owns the switch (D1) and the web app
// reads and sets it through `quickAddNotification` (D2). The inline field is offered
// only while a background run can write the account, so never for an encrypted one
// (D3). A reply comes back as `/?add=<text>` in a background run, saved here as a
// task through createTask with quick-add parsing (D4).
import { db } from './db'
import { encryptionSnapshot, isEnabled } from './e2ee'
import { resettable } from './moduleState'
import { createTask } from './ops'
import { has, quickAddNotification, type ShellQuickAddState } from './shell'
import { currentUserId } from './sharing'
import { preferredPlacement } from './userPrefs'

/** D3: whether the notification's Add task takes a title inline (false for an encrypted account). */
export function quickAddReply(): boolean {
  return !encryptionSnapshot().enabled
}

let replySent: boolean | null = null
resettable('shellQuickAdd', () => { replySent = null })

/** The state on this phone; null outside a shell that lists `quick-add-notification`. */
export function quickAddNotificationState(): Promise<ShellQuickAddState | null> {
  replySent = quickAddReply()
  return quickAddNotification({ reply: replySent })
}

/** Turns the notification on (asking Android for the permission when needed) or off. */
export function setQuickAddNotification(on: boolean): Promise<ShellQuickAddState | null> {
  replySent = quickAddReply()
  return quickAddNotification({ on, reply: replySent })
}

/** From the shell publishers: hands over `reply` again when encryption was turned on or off (D3). */
export function syncQuickAddReply(): void {
  if (!has('quick-add-notification')) return
  const reply = quickAddReply()
  if (reply === replySent) return
  replySent = reply
  void quickAddNotification({ reply }).catch(() => undefined)
}

/**
 * D4: the notification's reply, in a background run. Read with quick-add syntax (dates,
 * `#project`, priority, existing labels), in the Inbox unless a project is typed, placed by
 * the add position. Nothing for an empty line, signed out, or an encrypted account.
 * The shell's `id` becomes the task's id: a run WorkManager repeats finds that task and
 * creates nothing more. Answers the id of the task that exists, or null.
 */
export async function applyNotificationAdd(text: string, id?: string, now = new Date()): Promise<string | null> {
  const line = text.trim()
  if (!line || (await isEnabled()) || !(await currentUserId())) return null
  const given = id && UUID.test(id) ? id : undefined
  if (given && (await db.tasks.get(given))) return given
  const [input] = await (await import('./noteTasks')).lineInputs([line])
  return createTask({ project_id: null, ...input, placement: await preferredPlacement() }, now, given)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
