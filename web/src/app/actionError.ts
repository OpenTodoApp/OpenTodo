// User actions that write (OpenSpec change client-sync-robustness): a refused
// or failed change is shown as a toast instead of disappearing in a `void`
// promise. The messages are the library's own, already translated (a server
// refusal is an ApiError translated by code; a local refusal such as "a task
// cannot be its own subtask" is thrown with t()).
import { t, msg } from '../lib/i18n'
import { LOCAL_ERRORS } from '../lib/localErrors'
import { showBulkToast } from './bulk/toastStore'

/**
 * Local refusals keep a small catalogue like the server's codes have (lib/i18n/errors):
 * the lib throws plain English sentences (the constants of lib/localErrors, shared
 * by the throws and this map); the ones a user can cause are translated here.
 * An unknown message is shown as sent (a newer client on an older catalog).
 */
const LOCAL_ERROR_MESSAGES: Record<string, string> = {
  [LOCAL_ERRORS.projectNotFound]: msg('That project is not available any more.'),
  [LOCAL_ERRORS.parentProjectNotFound]: msg('The parent project is not available any more.'),
  [LOCAL_ERRORS.taskNotFound]: msg('That task is not available any more.'),
  [LOCAL_ERRORS.parentTaskNotFound]: msg('The parent task is not available any more.'),
  [LOCAL_ERRORS.notSignedIn]: msg('Sign in to continue.'),
  [LOCAL_ERRORS.timeEntryNotFound]: msg('That time entry is not available any more.'),
  [LOCAL_ERRORS.reminderTimeRequired]: msg('Set a time for the reminder first.'),
  [LOCAL_ERRORS.offsetNotWhole]: msg('The reminder offset must be whole minutes.'),
}

/** The sentence a failed action shows. */
export function actionErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    const source = LOCAL_ERROR_MESSAGES[err.message]
    return source ? t(source) : err.message
  }
  return t('The change could not be saved.')
}

/** Shows a failed action's message in the toast (and keeps it in the console). */
export function reportActionError(err: unknown): void {
  console.error('OpenTodo: an action failed', err)
  showBulkToast(actionErrorMessage(err), null)
}

/**
 * Runs a user action's promise without awaiting it; a failure shows its
 * message as a toast. Use instead of `void mutateSomething(…)` for anything the
 * user did; keep `void` only where losing the result is intended.
 */
export function act(p: Promise<unknown>): void {
  p.catch(reportActionError)
}
