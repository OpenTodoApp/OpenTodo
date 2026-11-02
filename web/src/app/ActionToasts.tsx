import { BulkConfirmHost } from './bulk/BulkConfirmHost'
import { UndoToast } from './bulk/UndoToast'
import { ToastActionHost } from './ToastActionHost'

/**
 * The feedback that follows a delete or a refused action: the undo offer, its action toasts and
 * the confirm a big keyboard Trash asks for. Grouped so the shell stays a list of screens.
 */
export function ActionToasts() {
  return (
    <>
      <UndoToast />
      <ToastActionHost />
      <BulkConfirmHost />
    </>
  )
}
