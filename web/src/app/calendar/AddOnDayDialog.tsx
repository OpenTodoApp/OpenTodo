// Quick add with a day as the date (month-and-timeline-views; lean-chrome D7): the
// Month's `q` on the focused day, and the calendar's empty days' "Add a task".
import type { ProjectRef } from '../../lib/nlp'
import { t } from '../../lib/i18n'
import { createTask } from '../../lib/ops'
import { Dialog } from '../../ui'
import { QuickAdd } from '../QuickAdd'

export function AddOnDayDialog({ date, projects, onClose }: { date: string; projects: readonly ProjectRef[]; onClose: () => void }) {
  return (
    <Dialog title={t('Add a task on {adding}', { adding: date })} onClose={onClose} size="md">
      <QuickAdd autoFocus hideHint placeholder={t('Task name')} label={t('Add a task due {adding}', { adding: date })} projects={projects} onAdd={async (input) => {
        await createTask({ due: { date }, ...input })
        onClose()
      }} />
    </Dialog>
  )
}
