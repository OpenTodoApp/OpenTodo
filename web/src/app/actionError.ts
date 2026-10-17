// User actions that write (OpenSpec change client-sync-robustness): a refused
// or failed change is shown as a toast instead of disappearing in a `void`
// promise. The messages are the library's own, already translated (a server
// refusal is an ApiError translated by code; a local refusal such as "a task
// cannot be its own subtask" is thrown with t()).
import { t } from '../lib/i18n'
import { showBulkToast } from './bulk/toastStore'

/** The sentence a failed action shows. */
export function actionErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
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
