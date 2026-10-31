// Quick add with a day as the date (month-and-timeline-views; lean-chrome D7): the
// Month's and Plan's `q` on the focused day, the calendar's empty days' "Add a task",
// and adding with the pointer (calendar-clarity D2), which may bring a time of the
// Day and Week grid. Created locally, so it works offline.
import { formatTime as toHHMM } from '../../lib/calendar'
import { formatDate, formatTime, logicalToday } from '../../lib/dates'
import type { ProjectRef, QuickAddInput } from '../../lib/nlp'
import { t } from '../../lib/i18n'
import { createTask } from '../../lib/ops'
import { addTasksUndoable } from '../../lib/pasteTasks'
import type { Due } from '../../lib/types'
import { showBulkToast } from '../bulk/toastStore'
import { Dialog } from '../../ui'
import { QuickAdd } from '../QuickAdd'

/**
 * The due of a line typed in the dialog: the dialog's day (and time) unless the line
 * names its own. A bare time ("at 4pm") reads as today's in the parser, so a parsed
 * due on today with a time keeps that time on the dialog's day.
 */
export function dueOnDay(input: Pick<QuickAddInput, 'due'>, date: string, time?: string, today = logicalToday()): Due {
  if (!input.due) return time ? { date, time } : { date }
  if (input.due.date === today && date !== today && input.due.time) return { ...input.due, date }
  return input.due
}

export function AddOnDayDialog({ date, time: start, projects, onClose }: {
  date: string
  /** Minutes from midnight of the grid's quarter hour, when added there. */
  time?: number
  projects: readonly ProjectRef[]
  onClose: () => void
}) {
  const time = start === undefined ? undefined : toHHMM(start)
  const when = time ? `${formatDate(date, 'long')} ${formatTime(time)}` : date
  return (
    <Dialog title={t('Add a task on {adding}', { adding: when })} onClose={onClose} size="md">
      <QuickAdd autoFocus hideHint placeholder={t('Task name')} label={t('Add a task due {adding}', { adding: when })} projects={projects} onAdd={async (input) => {
        await createTask({ ...input, due: dueOnDay(input, date, time) })
        onClose()
      }} onAddMany={async (inputs) => {
        // A pasted list (paste-to-tasks D3): every line due then unless it names its own date.
        const added = await addTasksUndoable(inputs.map((input) => ({ ...input, due: dueOnDay(input, date, time) })))
        showBulkToast(added.label, added.undoId)
        onClose()
      }} />
    </Dialog>
  )
}
