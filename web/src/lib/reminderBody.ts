// The body of a reminder's system notification (OpenSpec `reminders` "The
// notification names the due", push-due-date D1): a habit's tiny version first
// (habits-home D5), else the due in a row's words; the service worker keeps its own copy.
import { notificationDue } from './dates'
import { stripIsolates, t } from './i18n'
import type { Task } from './types'

/** A habit's tiny version as the small step that still counts: "One page is enough". */
export function tinyText(task: Pick<Task, 'habit' | 'habit_tiny'>): string | null {
  const tiny = task.habit ? task.habit_tiny?.trim() : ''
  return tiny ? t('{tiny} is enough', { tiny: tiny.charAt(0).toUpperCase() + tiny.slice(1) }) : null
}

/**
 * The body as of `at` (ms): the tiny version, else the due's words, else null for the generic text.
 * A notification is not laid out by the page, so it carries no direction isolates (arabic-rtl D5).
 */
export function reminderBody(task: Pick<Task, 'habit' | 'habit_tiny' | 'due'>, at: number): string | null {
  const body = tinyText(task) ?? notificationDue(task.due, at)
  return body === null ? null : stripIsolates(body)
}
