// The date sheet for one task (OpenSpec change phone-ui-trial, design D10): the
// phone's date panel in a bottom sheet, fed and written by what the desktop Do on
// editor uses: the quick choices, the month grid, the time of day row and the
// undoable writes. Opened by the task page's Do row and by a row's swipe to the left.
import { dueFromView, formatDate, localDueOf, monthName, quickChoices, weekdayName } from '../../lib/dates'
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'
import { Button, Dialog, type IconName } from '../../ui'
import { act } from '../../app/actionError'
import { useDateTimeFormat } from '../../app/DateTimePrefsProvider'
import { TimeOfDay } from '../../app/task-detail/WhenControl'
import { parkWithUndo, setDueWithUndo } from '../../app/undoable'
import { useToday, useViewerZone } from '../../app/useViews'
import { PhoneDatePanel, type DateChoice } from '../components/PhoneDateSheet'

const ICON: Record<string, IconName> = { today: 'sun', tomorrow: 'sunrise', weekend: 'coffee', 'next-week': 'calendar-range' }

export function TaskDateSheet({ task, someday = false, readOnly = false, onClose }: {
  task: Task
  /** Offer Someday too, as the row's swipe does. */
  someday?: boolean
  readOnly?: boolean
  onClose: () => void
}) {
  const viewer = useViewerZone()
  // A due fixed to a zone is read and edited in that zone's clock, as on the desktop (zone-time-field).
  const zone = task.due?.tz ?? viewer
  const dt = useDateTimeFormat().resolved
  const today = useToday()
  const view = localDueOf(task.due, zone)
  const choices: DateChoice[] = quickChoices('due', today, dt).flatMap((c) => (typeof c.date === 'string' && c.date !== 'someday'
    ? [{ id: c.id, label: c.label, icon: ICON[c.id] ?? 'calendar-days', hint: formatDate(c.date, 'long', dt, today), date: c.date }] : []))
  if (someday) choices.push({ id: 'someday', label: t('Someday'), icon: 'moon', hint: '', date: 'someday' })

  // A day keeps the task's time; Someday parks it. Either closes the sheet, as a choice in a menu does.
  const pick = (date: string | 'someday') => {
    if (date === 'someday') act(parkWithUndo(task.id))
    else act(setDueWithUndo(task.id, dueFromView(task.due, { date, ...(view?.time ? { time: view.time } : {}) }, zone)))
    onClose()
  }
  const clear = task.due ? () => { act(setDueWithUndo(task.id, null)); onClose() } : undefined

  return (
    <Dialog title={t('Do on')} placement="bottom" onClose={onClose} testId="phone-date-sheet"
      actions={clear && !readOnly ? <Button variant="ghost" size="sm" className="text-danger" onClick={clear} data-date-clear>{t('Clear')}</Button> : undefined}>
      {/* Marked as a task's property editor, which it is: the checks find every editor by this. */}
      <div data-facet-editor>
        <PhoneDatePanel value={view?.date ?? null} today={today} choices={choices} weekStart={dt.weekStart}
          weekdays={Array.from({ length: 7 }, (_, i) => weekdayName((dt.weekStart + i) % 7, 'narrow'))}
          monthName={(anchor) => monthName(anchor, 'long', true)} onPick={readOnly ? () => {} : pick}
          time={<div className="p-3"><TimeOfDay task={task} readOnly={readOnly} zone={zone} viewer={viewer} /></div>} />
      </div>
    </Dialog>
  )
}
