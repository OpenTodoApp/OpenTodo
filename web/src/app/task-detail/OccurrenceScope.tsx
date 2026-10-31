// The occurrence panel's scope (OpenSpec change series-exceptions, design D5): on a
// recurring series, a projection and an occurrence record, a control under the title
// chooses This occurrence or All occurrences. Opened from the series row it shows All
// occurrences and the panel is the series' as before; opened from a projection (or
// switched to This occurrence) it names the occurrence's date, shows the series'
// values without editing them, and offers Complete, Skip, Move to… and Edit this
// occurrence, which writes the occurrence's record and opens it. A record opens on
// This occurrence; All occurrences opens its series.
import { lazy, Suspense, useState } from 'react'
import { formatDate, logicalToday } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { actOnOccurrence } from '../../lib/occurrenceActions'
import { isOccurrenceRecord, recordDate, seriesRule } from '../../lib/recurring'
import type { Task } from '../../lib/types'
import { Icon, SegmentedControl } from '../../ui'
import { act } from '../actionError'
import { setPanelTaskId } from '../panel'
import { useOccurrenceView } from './occurrenceView'
import type { TaskDetailModel } from './useTaskDetail'

const MoveOccurrenceDialog = lazy(() => import('../calendar/occurrenceMenu').then((m) => ({ default: m.MoveOccurrenceDialog })))

type Scope = 'this' | 'all'

/** The scope control, the occurrence's header line and its actions. Nothing for a task that neither repeats nor is a record. */
export default function OccurrenceScope({ m, readOnly }: { m: TaskDetailModel; readOnly: boolean }) {
  const { task, series } = m
  const date = useOccurrenceView(task)
  if (!task) return null
  const isSeries = !!seriesRule(task)
  const record = !isSeries && isOccurrenceRecord(task)
  if (!isSeries && !record) return null
  const scope: Scope = record || date ? 'this' : 'all'
  const change = (next: Scope) => {
    if (isSeries) setPanelTaskId(task.id, next === 'this' ? task.due?.date ?? logicalToday() : undefined)
    else if (next === 'all' && task.series_id && series && !series.deleted_at) setPanelTaskId(task.series_id)
  }
  const on = record ? recordDate(task) : date
  return (
    <div className="space-y-2" data-occurrence-scope={scope}>
      <SegmentedControl label={t('Edit scope')} value={scope} onChange={change} data-scope-control
        options={[{ id: 'this', label: t('This occurrence') }, { id: 'all', label: t('All occurrences') }]} />
      {on && (
        <p className="flex items-center gap-1 text-meta text-muted" data-occurrence-for={on}>
          <Icon name="repeat" />{t('{date} · one occurrence of a repeating task', { date: formatDate(on, 'full') })}
        </p>
      )}
      {isSeries && date && <OccurrenceActions series={task} date={date} readOnly={readOnly} />}
    </div>
  )
}

/** Complete, Skip, Move to… and Edit this occurrence, for those who may edit a calendar series. */
function OccurrenceActions({ series, date, readOnly }: { series: Task; date: string; readOnly: boolean }) {
  const [moving, setMoving] = useState(false)
  const rule = seriesRule(series)
  if (readOnly) return null
  if (rule?.afterCompletion && date !== series.due?.date) {
    return <p className="text-meta text-muted" role="note">{t('Later dates of this task follow its completions, so they cannot be changed one by one.')}</p>
  }
  // Each action writes the occurrence's record; the panel then shows it.
  const run = (action: Parameters<typeof actOnOccurrence>[2]) => act(actOnOccurrence(series.id, date, action).then((id) => { if (id) setPanelTaskId(id) }))
  const time = series.due?.time
  return (
    <div className="flex flex-wrap gap-2" data-occurrence-actions>
      <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm touch-target gap-1" data-occurrence-action="complete" onClick={() => run({ kind: 'complete' })}>
        <Icon name="check" />{t('Complete')}
      </button>
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target gap-1" data-occurrence-action="skip" onClick={() => run({ kind: 'skip' })}>
        <Icon name="arrow-right" />{series.habit ? t('Skip this day') : t('Skip')}
      </button>
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target gap-1" data-occurrence-action="move" onClick={() => setMoving(true)}>
        <Icon name="calendar-days" />{t('Move to…')}
      </button>
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target gap-1" data-occurrence-action="edit" onClick={() => run({ kind: 'edit', patch: {} })}>
        <Icon name="pencil" />{t('Edit this occurrence')}
      </button>
      {moving && (
        <Suspense fallback={null}>
          <MoveOccurrenceDialog p={{ seriesId: series.id, occurrence: date, date, ...(time ? { time } : {}) }} onClose={() => setMoving(false)} />
        </Suspense>
      )}
    </div>
  )
}
