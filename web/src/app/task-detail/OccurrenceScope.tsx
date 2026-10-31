// The occurrence panel's scope (OpenSpec change series-exceptions, design D5): on a
// recurring series, a projection and an occurrence record, a control under the title
// chooses This occurrence or All occurrences. Opened from the series row it shows All
// occurrences and the panel is the series' as before; opened from a projection (or
// switched to This occurrence) it names the occurrence's date, shows the series'
// values without editing them, and offers Complete, Skip, Move to… and Edit this
// occurrence, which writes the occurrence's record and opens it. A record opens on
// This occurrence; All occurrences opens its series. On an occurrence after the
// current one of a calendar rule, This and following (series-split D6) makes the
// values editable: the first edit splits the series there and the panel shows the
// new series. The panel of a split series names the series it continues and the
// one that continues it. On All occurrences of a series with a past (an earlier
// piece, a done or skipped record), a second choice Only future ones · Also past
// ones (series-all-scope D1) lets edits reach the past too.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { formatDate, logicalToday } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { useSeriesRecords } from '../../lib/localData'
import { actOnOccurrence } from '../../lib/occurrenceActions'
import { redirectNextEdit, setPastScope } from '../../lib/ops'
import { isOccurrenceRecord, recordDate, seriesRule } from '../../lib/recurring'
import { hasPast } from '../../lib/seriesPast'
import { splittable } from '../../lib/seriesSplit'
import { splitFromOccurrence } from '../../lib/seriesSplitActions'
import type { Task } from '../../lib/types'
import { Icon, SegmentedControl } from '../../ui'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import { setPanelTaskId, usePanelProjection } from '../panel'
import { setFollowing, useFollowing, useOccurrenceView } from './occurrenceView'
import type { TaskDetailModel } from './useTaskDetail'

const MoveOccurrenceDialog = lazy(() => import('../calendar/occurrenceMenu').then((m) => ({ default: m.MoveOccurrenceDialog })))

type Scope = 'this' | 'following' | 'all'

/** The scope control, the occurrence's header line and its actions. Nothing for a task that neither repeats nor is a record. */
export default function OccurrenceScope({ m, readOnly }: { m: TaskDetailModel; readOnly: boolean }) {
  const { task, series } = m
  const date = useOccurrenceView(task)
  const following = useFollowing(task)
  const projected = usePanelProjection(task?.id)
  const isSeries = !!task && !!seriesRule(task)
  const record = !!task && !isSeries && isOccurrenceRecord(task)
  const seriesId = isSeries ? task!.id : record ? task!.series_id ?? '' : task?.id ?? ''
  const rows = useSeriesRecords(seriesId)
  const owner = isSeries ? task : record ? series : null
  const on = record ? recordDate(task!) : following ?? date
  // This and following: a later occurrence of a calendar rule, for an editor.
  const offerFollowing = useMemo(() => {
    if (readOnly || !owner || owner.deleted_at || !on) return false
    return splittable(owner, on, rows, logicalToday())
  }, [readOnly, owner, on, rows])
  // Also past ones (series-all-scope D1): offered on All occurrences of a series with a past, for an editor; held per series.
  const [pastFor, setPastFor] = useState<string | null>(null)
  const onAll = isSeries && !following && !date
  const offerPast = useMemo(() => !readOnly && onAll && !!task && hasPast(task, rows), [readOnly, onAll, task, rows])
  const pastOn = offerPast && pastFor === task?.id
  useEffect(() => {
    if (!pastOn || !task) return
    setPastScope({ id: task.id, committed: (label, entryId) => showUndoToast(label, entryId) })
    return () => setPastScope(null)
  }, [pastOn, task])
  // Leaving the panel leaves This and following.
  useEffect(() => () => setFollowing(null), [])
  useEffect(() => {
    if (!following || !task) return
    return redirectNextEdit(task.id, async (patch) => {
      const r = await splitFromOccurrence(task.id, following, patch)
      if (!r) return null
      setFollowing(null)
      setPanelTaskId(r.id)
      if (r.entry) showUndoToast(r.label, r.entry.id)
      return r.id
    })
  }, [following, task])
  if (!task) return null
  const lineage = <Continues task={task} rows={rows} />
  if (!isSeries && !record) return lineage
  const scope: Scope = following ? 'following' : record || date ? 'this' : 'all'
  const change = (next: Scope) => {
    const target = isSeries ? task.id : task.series_id
    const at = record ? recordDate(task) : projected ?? task.due?.date ?? logicalToday()
    if (next === 'following' && target && at) {
      setPanelTaskId(target, at)
      setFollowing({ id: target, date: at })
      return
    }
    setFollowing(null)
    if (isSeries) setPanelTaskId(task.id, next === 'this' ? at ?? undefined : undefined)
    else if (next === 'all' && task.series_id && series && !series.deleted_at) setPanelTaskId(task.series_id)
  }
  const options: { id: Scope; label: string }[] = [
    { id: 'this', label: t('This occurrence') },
    ...(offerFollowing || following ? [{ id: 'following' as const, label: t('This and following') }] : []),
    { id: 'all', label: t('All occurrences') },
  ]
  return (
    <div className="space-y-2" data-occurrence-scope={scope}>
      <SegmentedControl label={t('Edit scope')} value={scope} onChange={change} data-scope-control options={options} wrap={options.length > 2} />
      {offerPast && (
        <SegmentedControl label={t('Apply to')} value={pastOn ? 'past' : 'future'} onChange={(v) => setPastFor(v === 'past' ? task.id : null)} data-past-control
          options={[{ id: 'future', label: t('Only future ones') }, { id: 'past', label: t('Also past ones') }]} />
      )}
      {pastOn && (
        <p className="flex items-center gap-1 text-meta text-muted" data-past-note>
          <Icon name="history" />{t('Past occurrences take the new title, notes, labels, project and priority; their dates and completions stay.')}
        </p>
      )}
      {on && scope !== 'following' && (
        <p className="flex items-center gap-1 text-meta text-muted" data-occurrence-for={on}>
          <Icon name="repeat" />{t('{date} · one occurrence of a repeating task', { date: formatDate(on, 'full') })}
        </p>
      )}
      {following && (
        <p className="flex items-center gap-1 text-meta text-muted" data-following-from={following}>
          <Icon name="repeat" />{t('From {date} on: a change here starts a new repeating task from this date; earlier occurrences stay as they are.', { date: formatDate(following, 'full') })}
        </p>
      )}
      {isSeries && date && <OccurrenceActions series={task} date={date} readOnly={readOnly} />}
      {lineage}
    </div>
  )
}

/** "Continues Study from 14 Oct" and "Continues as Study from 14 Oct": the neighbouring pieces of a split series (series-split D6). */
function Continues({ task, rows }: { task: Task; rows: readonly Task[] }) {
  const before = task.split_from ? rows.find((r) => r.id === task.split_from!.series && !r.deleted_at) : undefined
  const after = rows.filter((r) => r.split_from?.series === task.id && !r.deleted_at && !r.series_id)
  if (!before && after.length === 0) return null
  const link = (to: Task, label: string, key: string) => (
    <button key={key} type="button" className="touch-target flex items-center gap-1 text-left text-meta text-faint hover:text-default" data-continues={key} onClick={() => setPanelTaskId(to.id)}>
      <Icon name="repeat" />{label}
    </button>
  )
  return (
    <div className="space-y-1" data-lineage>
      {before && task.split_from && link(before, t('Continues {title} from {date}', { title: before.title || t('Untitled'), date: formatDate(task.split_from.date, 'compact') }), 'from')}
      {after.map((p) => link(p, t('Continues as {title} from {date}', { title: p.title || t('Untitled'), date: formatDate(p.split_from!.date, 'compact') }), `as-${p.id}`))}
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
