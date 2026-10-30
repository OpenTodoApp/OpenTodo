// The focus commands of the menus and the picker (OpenSpec change phone-touch-focus,
// design D3), loaded with their first use: read what the rules need from the local
// database, run them (lib/focusEdit) and show the outcome as a toast with Undo.
import type { FocusOutcome } from '../../lib/focusEdit'
import { pressFocus, readFocusContext } from '../../lib/focusEdit'
import { t } from '../../lib/i18n'
import { ACTION_TOAST_MS, showBulkToast, showUndoToast } from '../bulk/toastStore'
import { requestFocusPick } from './focusRequest'

/** Shows an outcome: a toast with Undo, a refusal (with Choose a slot when a slot was taken), or the slot menu. */
export function showFocusOutcome(outcome: FocusOutcome): void {
  if (outcome.kind === 'done') { showUndoToast(outcome.text, outcome.undoId); return }
  if (outcome.kind === 'choose') { requestFocusPick({ mode: 'slot', taskId: outcome.task.id }); return }
  const choose = outcome.choose
  showBulkToast(outcome.text, null, {
    ttl: ACTION_TOAST_MS,
    ...(choose ? { action: { label: t('Choose a slot'), run: () => requestFocusPick({ mode: 'slot', taskId: choose.id }) } } : {}),
  })
}

/** Add to focus, Put in a slot or Remove from focus on task `id`, by the rules `f` follows. */
export async function pressFromMenu(id: string): Promise<void> {
  const ctx = await readFocusContext([id])
  const task = ctx.tasks.find((x) => x.id === id)
  if (!task) return
  showFocusOutcome(await pressFocus(ctx, task))
}
