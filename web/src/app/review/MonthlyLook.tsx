// The Monthly look (OpenSpec change open-loops-method, design D5; weekly-review
// "Monthly look"): areas and the projects in them that need attention, Someday
// tasks older than three months, and the four-week trend with the definitions of
// Statistics. "Finish monthly look" records it on the synced `review` row.
import { useMemo, useState } from 'react'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { formatInstant } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { resolveLabels } from '../../lib/labels'
import { hasTimeColumn } from '../../lib/rowTime'
import { useAllLabels, useReviewRow, useReviewedAt } from '../../lib/localData'
import { oldSomeday } from '../../lib/method/rules'
import { setTaskCompleted } from '../../lib/ops'
import { areasOf, finishMonthlyLook, monthlyDue } from '../../lib/review'
import { compute, periodFor, sharedIds } from '../../lib/stats'
import { Badge, Button, Dialog, PageBody, PageHeader, Skeleton } from '../../ui'
import { act } from '../actionError'
import { useWithMethod } from '../help/MethodLink'
import { LabelPicker } from '../LabelPicker'
import { useMethodInput } from '../method/useMethodInput'
import { setPanelTaskId, usePanelTaskId } from '../panel'
import { navigate } from '../router'
import { TaskRow } from '../TaskRow'
import { useListKeys } from '../useListKeys'

export function MonthlyLook() {
  const input = useMethodInput()
  const labels = useAllLabels()
  const review = useReviewRow()
  const reviewedAt = useReviewedAt()
  const weekStart = useDateTimeFormat().resolved.weekStart
  const [now] = useState(() => Date.now())
  const [finished, setFinished] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const openId = usePanelTaskId()
  const data = useMemo(() => {
    if (!input) return null
    const areas = areasOf({ ...input, completedThisWeek: 0, reviewedAt, now })
    const someday = oldSomeday(input.tasks, now)
    const trend = compute({ tasks: input.tasks, projects: input.projects, shared: sharedIds([...input.memberships.values()]), me: input.me, today: input.today }, periodFor('4-weeks', input.today, weekStart), weekStart)
    return { areas, someday, trend }
  }, [input, reviewedAt, now, weekStart])
  const rows = useMemo(() => (data?.someday ?? []).map((task) => ({ key: task.id, task })), [data])
  // The time column (rows-v2 D2): one fact of the Old someday list.
  const timeColumn = useMemo(() => hasTimeColumn(rows.map((r) => r.task)), [rows])
  useListKeys({ rows, selected, setSelected, openId, setOpenId: setPanelTaskId, pickerFor, setPickerFor, onIdleEscape: () => setSelected(null) })
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const projectMap = useMemo(() => new Map((input?.projects ?? []).map((p) => [p.id, p])), [input])
  const last = finished ?? (review?.monthly_at || null)
  const meta = useWithMethod('review', last ? t('Last look {instant}', { instant: formatInstant(last, 'long') }) : undefined)
  const subtitle = useWithMethod('review')

  return (
    <PageBody width="list">
      <PageHeader title={t('Monthly look', { context: 'method' })} icon="calendar-range" meta={meta} subtitle={subtitle} help="review/monthly"
        back={{ label: t('Weekly review'), onClick: () => navigate({ view: 'review' }), hideFrom: 'lg' }}
        actions={<Button size="sm" variant={monthlyDue(last) ? 'primary' : 'secondary'} onClick={() => act((async () => { const at = Date.now(); await finishMonthlyLook(at); setFinished(at) })())}>{t('Finish monthly look')}</Button>} />
      {!data ? <Skeleton shape="row" count={4} /> : (
        <>
          {finished && <p role="status" className="mb-3 text-meta text-muted">{t('Monthly look finished {instant}.', { instant: formatInstant(finished, 'long') })}</p>}
          <section className="mb-6" aria-labelledby="monthly-areas" data-monthly-areas>
            <h2 id="monthly-areas" className="mb-1 text-h3 font-semibold">{t('Areas')}</h2>
            <p className="mb-2 text-meta text-muted">{t('Each top-level project that holds sub-projects, and those of them without a next action or stalled.')}</p>
            {data.areas.length === 0 ? <p className="text-body text-faint">{t('No area yet: nest projects under a top-level project to make one.')}</p> : (
              <ul className="divide-y divide-(--ot-border)">
                {data.areas.map((a) => (
                  <li key={a.project.id} data-area={a.project.id} className="py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button type="button" className="flex min-w-0 items-center gap-2 text-body font-medium text-default hover:underline" onClick={() => navigate({ view: 'project', id: a.project.id })}>
                        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.project.color }} />
                        <span className="user-text truncate">{a.project.name}</span>
                      </button>
                      <span className="text-meta text-muted">{t('{n, plural, one {# project} other {# projects}}, {k} need attention', { n: a.children.length, k: a.attention.length })}</span>
                    </div>
                    {a.attention.length > 0 && (
                      <ul className="mt-1 flex flex-wrap gap-2 pl-5">
                        {a.attention.map((w) => (
                          <li key={w.project.id}>
                            <button type="button" className="inline-flex items-center gap-1.5 text-meta" onClick={() => navigate({ view: 'project', id: w.project.id })}>
                              <span className="user-text underline">{w.project.name}</span>
                              {w.needsNext && <Badge hue="orange">{t('No next action')}</Badge>}
                              {w.stalled && <Badge hue="red">{t('Stalled')}</Badge>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="mb-6" aria-labelledby="monthly-someday" data-monthly-someday>
            <h2 id="monthly-someday" className="mb-1 text-h3 font-semibold">{t('Old someday')}</h2>
            <p className="mb-2 text-meta text-muted">{t('Parked more than three months ago. n brings a task back, c completes it, Delete trashes it.')}</p>
            {data.someday.length === 0 ? <p className="text-body text-faint">{t('Nothing old in Someday.')}</p> : (
              <ul>
                {data.someday.map((task) => (
                  <TaskRow key={task.id} task={task} project={task.project_id ? projectMap.get(task.project_id) : undefined} labels={resolveLabels(task.labels, labelMap)}
                    showProject selected={task.id === selected} timeColumn={timeColumn} onToggle={() => act(setTaskCompleted(task.id, !task.completed_at))}
                    onOpen={() => { setSelected(task.id); setPanelTaskId(task.id) }} />
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="monthly-trend" data-monthly-trend>
            <h2 id="monthly-trend" className="mb-1 text-h3 font-semibold">{t('The last four weeks')}</h2>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {[[t('Completed'), data.trend.completed], [t('Created'), data.trend.created], [t('Slipped'), data.trend.slipped]].map(([label, value]) => (
                <div key={String(label)} className="rounded-card border border-default p-3">
                  <dt className="text-meta text-muted">{label}</dt>
                  <dd className="text-h2 font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-meta"><button type="button" className="text-accent underline" onClick={() => navigate({ view: 'stats' })}>{t('See statistics')}</button></p>
          </section>
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
