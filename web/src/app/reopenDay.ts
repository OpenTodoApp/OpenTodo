// "Reopen the day" (OpenSpec change ux-feedback-2, weekly-review "Reopen the day"):
// one batch from lib/review, offered with the bulk toast's Undo, and the tasks left
// alone because they changed after the close named in the same toast.
import { t } from '../lib/i18n'
import { reopenDay } from '../lib/review'
import { act } from './actionError'
import { showBulkToast } from './bulk/toastStore'

export async function reopenWithToast(today: string): Promise<void> {
  const r = await reopenDay(today)
  if (!r.entry) return
  const left = r.skipped.length
    ? ' · ' + t('Changed since, left as is: {titles}', { titles: r.skipped.join(', ') })
    : ''
  showBulkToast(r.label + left, r.entry.id)
}

/** For buttons: errors go through the shared action error toast. */
export const reopenDayAction = (today: string) => act(reopenWithToast(today))
