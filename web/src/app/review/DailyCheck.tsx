// The Daily check (OpenSpec change open-loops-method, design D5; weekly-review
// "Daily check"): on one page the Inbox count, what is overdue and today's tasks,
// where `f` puts up to three of them in today's focus. "Done for today" records
// the check on the synced personal `review` row. Yesterday's line for tomorrow
// (close-the-day D7) is shown first, read-only, until the day is closed again.
import { useEffect, useMemo, useState } from 'react'
import { todayList } from '../../lib/dayLists'
import { formatInstant } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { resolveLabels } from '../../lib/labels'
import { useAllLabels, useReviewRow } from '../../lib/localData'
import { setTaskCompleted } from '../../lib/ops'
import { dailyDue, finishDailyCheck, FOCUS_MAX, focusTasks, toggleFocus, yesterdaysNote } from '../../lib/review'
import { qualifies } from '../../lib/triage'
import type { Task } from '../../lib/types'
import { overdueInToday } from '../../lib/views'
import { Button, Dialog, Notice, PageBody, PageHeader, Skeleton } from '../../ui'
import { act } from '../actionError'
import { useWithMethod } from '../help/MethodLink'
import { LabelPicker } from '../LabelPicker'
import { useMethodInput } from '../method/useMethodInput'
import { setPanelTaskId, usePanelTaskId } from '../panel'
import { navigate } from '../router'
import { useShortcutScope } from '../shortcuts'
import { TaskRow } from '../TaskRow'
import { useListKeys } from '../useListKeys'

export function DailyCheck() {
  const input = useMethodInput()
  const labels = useAllLabels()
  const review = useReviewRow()
  const [message, setMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const openId = usePanelTaskId()
  const groups = useMemo(() => {
    if (!input) return null
    const archived = new Set(input.projects.filter((p) => p.archived || p.deleted_at).map((p) => p.id))
    const live = input.tasks.filter((x) => !x.deleted_at && !(x.project_id && archived.has(x.project_id)))
    const today = todayList(live, input.today)
    return {
      inbox: live.filter(qualifies).length,
      focus: focusTasks(review, input.today, live),
      overdue: today.filter((x) => overdueInToday(x, input.today)),
      today: today.filter((x) => !overdueInToday(x, input.today)),
    }
  }, [input, review])
  const sections: { key: string; heading: string; tasks: Task[] }[] = groups ? [
    { key: 'focus', heading: t('Today’s focus'), tasks: groups.focus },
    { key: 'overdue', heading: t('Overdue'), tasks: groups.overdue },
    { key: 'today', heading: t('Today'), tasks: groups.today },
  ] : []
  const rows = sections.flatMap((s) => s.tasks.map((task) => ({ key: `${s.key}:${task.id}`, task })))
  useListKeys({ rows, selected, setSelected, openId, setOpenId: setPanelTaskId, pickerFor, setPickerFor, onIdleEscape: () => setSelected(null) })
  useEffect(() => { if (selected && !rows.some((r) => r.key === selected)) setSelected(null) }, [rows, selected])
  const focusIds = new Set(groups?.focus.map((x) => x.id) ?? [])
  const toggle = async (task: Task) => {
    if (!input) return
    const outcome = await toggleFocus(review, input.today, input.tasks, task.id)
    setMessage(outcome === 'full' ? t('Today’s focus holds {n} tasks. Take one out first.', { n: FOCUS_MAX })
      : outcome === 'added' ? t('{title} is in today’s focus.', { title: task.title }) : t('{title} left today’s focus.', { title: task.title }))
  }
  useShortcutScope('view', {
    'review.focus': () => {
      const task = rows.find((r) => r.key === selected)?.task
      if (!task || openId) return false
      act(toggle(task))
    },
  }, { view: 'review' })

  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const projectMap = useMemo(() => new Map((input?.projects ?? []).map((p) => [p.id, p])), [input])
  const done = !!input && !dailyDue(review?.daily_at, input.today)
  const note = input ? yesterdaysNote(review, input.today) : null
  const meta = useWithMethod('review', done ? t('Done today, {instant}', { instant: formatInstant(review!.daily_at, 'time') }) : undefined)
  const subtitle = useWithMethod('review')

  return (
    <PageBody width="list">
      <PageHeader title={t('Daily check', { context: 'method' })} icon="sun" meta={meta} subtitle={subtitle} help="review/daily"
        back={{ label: t('Weekly review'), onClick: () => navigate({ view: 'review' }), hideFrom: 'lg' }}
        actions={<Button size="sm" variant={done ? 'secondary' : 'primary'} onClick={() => act(finishDailyCheck().then(() => setMessage(t('Daily check done. See you tomorrow.'))))}>{t('Done for today')}</Button>} />
      {!groups ? <Skeleton shape="row" count={4} /> : (
        <>
          {note && (
            <div className="mb-4" data-daily-note>
              <Notice tone="info">
                <span className="block text-hint font-semibold uppercase tracking-wide">{t('Yesterday’s line')}</span>
                <span className="user-text">{note}</span>
              </Notice>
            </div>
          )}
          {message && <p role="status" className="mb-3 text-meta text-muted" data-daily-message>{message}</p>}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2" data-daily-inbox>
            <p className="text-body text-muted">{groups.inbox ? t('{count} to process in the Inbox.', { count: groups.inbox }) : t('The Inbox is empty.')}</p>
            {groups.inbox > 0 && <Button size="sm" onClick={() => navigate({ view: 'triage' })}>{t('Process the Inbox')}</Button>}
          </div>
          <p className="mb-3 text-meta text-faint">{t('Select a task and press f to put it in today’s focus, up to three. c completes, Enter opens.')}</p>
          {groups.overdue.length === 0 && groups.today.length === 0 && <Notice tone="info">{t('Nothing is due today. Pick your focus from Next.')}</Notice>}
          {sections.filter((s) => s.tasks.length > 0).map((s) => (
            <section key={s.key} data-group={s.key} className="mb-4" aria-labelledby={`daily-${s.key}`}>
              <h2 id={`daily-${s.key}`} className="mb-1 px-2 text-meta font-semibold text-faint">{s.heading}</h2>
              <ul>
                {s.tasks.map((task) => {
                  const key = `${s.key}:${task.id}`
                  return (
                    <TaskRow key={key} task={task} project={task.project_id ? projectMap.get(task.project_id) : undefined} labels={resolveLabels(task.labels, labelMap)}
                      showProject selected={key === selected} breadcrumb={s.key !== 'focus' && focusIds.has(task.id) ? t('In today’s focus') : null}
                      onToggle={() => act(setTaskCompleted(task.id, !task.completed_at))}
                      onOpen={() => { setSelected(key); setPanelTaskId(task.id) }} />
                  )
                })}
              </ul>
            </section>
          ))}
        </>
      )}
      {pickerFor && (
        <Dialog title={t('Labels')} label={t('Labels for task')} onClose={() => setPickerFor(null)}>
          <LabelPicker taskId={pickerFor} onClose={() => setPickerFor(null)} />
        </Dialog>
      )}
    </PageBody>
  )
}
