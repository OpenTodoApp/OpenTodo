// "Remove sample tasks" from any of its three places (OpenSpec change
// moments-and-onboarding, design D2/D4): the task panel's notice, the Inbox header's
// overflow and the first-day checklist. One batch with the usual Undo toast.
import { removeSampleTasks } from '../lib/sampleTasks'
import { act } from './actionError'
import { showBulkToast } from './bulk/toastStore'

export function removeSamplesWithUndo(): void {
  act(removeSampleTasks().then((r) => { if (r.count > 0) showBulkToast(r.label, r.undoId) }))
}
