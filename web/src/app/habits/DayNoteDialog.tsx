// A day's note (OpenSpec change habit-notes, design D2, D3): the note of the day's
// occurrence record in the task notes editor, so it is formatted, linked, searched,
// encrypted and merged as any task note. A day without a record asks for its state
// first (Done, Tiny version, Skipped), then opens the note of the record it wrote.
import { formatDate } from '../../lib/dates'
import { pieceFor } from '../../lib/habits'
import { t } from '../../lib/i18n'
import { TaskNotes } from '../task-detail/TaskDetail'
import { useLiveTasks } from '../../lib/liveTasks'
import { occurrenceId } from '../../lib/ids'
import { Button, Dialog } from '../../ui'
import { act } from '../actionError'
import { useToday } from '../useViews'
import { dayNote } from './dayNoteStore'
import { pickDay } from './habitUndo'


/** The open day's note, if any; rendered once by each screen that offers Note. */
export function DayNoteHost() {
  const target = dayNote.use()
  return target ? <DayNoteDialog seriesId={target.seriesId} date={target.date} onClose={() => dayNote.set(null)} /> : null
}

export function DayNoteDialog({ seriesId, date, onClose }: { seriesId: string; date: string; onClose: () => void }) {
  const tasks = useLiveTasks()
  const today = useToday()
  const series = tasks?.find((x) => x.id === seriesId)
  if (!tasks || !series) return null
  const piece = pieceFor(series, tasks, date)
  const record = tasks.find((x) => x.id === occurrenceId(piece.id, date) && !x.deleted_at && x.completed_at)
  const title = `${series.title || t('Untitled')} · ${formatDate(date, 'full', undefined, today)}`
  return (
    <Dialog title={title} onClose={onClose} size="md" testId="day-note">
      {record ? (
        <TaskNotes task={record} readOnly={false} />
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('How did the day go?')} data-day-note-state>
          <Button size="sm" variant="secondary" icon="check" onClick={() => act(pickDay(seriesId, date, 'done'))}>{t('Done')}</Button>
          <Button size="sm" variant="secondary" icon="circle" onClick={() => act(pickDay(seriesId, date, 'tiny'))}>{t('Tiny version')}</Button>
          <Button size="sm" variant="secondary" icon="minus" onClick={() => act(pickDay(seriesId, date, 'skipped'))}>{t('Skipped')}</Button>
        </div>
      )}
    </Dialog>
  )
}
