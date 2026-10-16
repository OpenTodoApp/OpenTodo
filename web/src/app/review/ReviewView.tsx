// The weekly review (OpenSpec change `stats-and-review`, design D3, D4, D8): four
// steps with live data from the local rows (lib/review.ts), on the Tabs primitive
// and the ordinary task rows, so the list keys work inside each step. The only
// manual action is "Finish review", which writes the synced `review` row.
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Icon, Notice, PageBody, PageHeader, Skeleton, Tabs } from '../../ui'
import { db } from '../../lib/db'
import { formatInstant } from '../../lib/dates'
import { archiveProject, createTask, setTaskCompleted } from '../../lib/ops'
import { unarchiveProject } from '../../lib/archive'
import { resolveLabels } from '../../lib/labels'
import { finishReview, firstUnfinished, REVIEW_ID, reviewSteps, STEP_IDS, STEP_TITLES, type NextActionProject, type StepId } from '../../lib/review'
import { currentUserId } from '../../lib/sharing'
import { compute, periodFor, sharedIds } from '../../lib/stats'
import { visibleTasks } from '../../lib/trash'
import type { Label, Membership, Project, Task } from '../../lib/types'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { HelpLink } from '../help/HelpLink'
import { LabelPicker } from '../LabelPicker'
import { Dialog } from '../overlay'
import { setPanelTaskId, usePanelTaskId } from '../panel'
import { QuickAdd, type QuickAddInput } from '../QuickAdd'
import { navigate } from '../router'
import { isActivationTarget, useShortcutScope } from '../shortcuts'
import { TaskRow } from '../TaskRow'
import { useListKeys } from '../useListKeys'
import { useToday } from '../useViews'
import { t } from '../../lib/i18n'

export function ReviewView({ userId }: { userId?: string }) {
  const today = useToday()
  const weekStart = useDateTimeFormat().resolved.weekStart
  const tasks = useLiveQuery(() => visibleTasks(), [], undefined as Task[] | undefined)
  const projects = useLiveQuery(() => db.projects.toArray(), [], [] as Project[])
  const memberships = useLiveQuery(() => db.memberships.toArray(), [], [] as Membership[])
  const labels = useLiveQuery(() => db.labels.toArray(), [], [] as Label[])
  const meRow = useLiveQuery(() => currentUserId(), [], null)
  const me = meRow ?? userId ?? null
  const review = useLiveQuery(() => db.review.get(REVIEW_ID), [])
  const memberMap = useMemo(() => new Map(memberships.map((m) => [m.projectId, m])), [memberships])
  const steps = useMemo(() => {
    if (!tasks) return null
    const thisWeek = compute({ tasks, projects, shared: sharedIds(memberships), me, today }, periodFor('this-week', today, weekStart), weekStart)
    return reviewSteps({ tasks, projects, memberships: memberMap, me, today, completedThisWeek: thisWeek.completed })
  }, [tasks, projects, memberships, memberMap, me, today, weekStart])

  const [step, setStep] = useState<StepId | null>(null)
  // The screen opens on the first step that is not done (weekly-review "Review screen"),
  // and keeps following it while rows are still arriving (a first sync), until the user picks a step.
  const chosen = useRef(false)
  useEffect(() => { if (steps && !chosen.current) setStep(firstUnfinished(steps.done)) }, [steps])
  const tabs = useRef<HTMLDivElement>(null)
  const focusTab = () => (tabs.current?.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement | null)?.focus()
  // The selected tab takes focus, so the arrow keys move between steps (also when the opening step moves during a first sync).
  useEffect(() => { if (step && !chosen.current) focusTab() }, [step])

  const [selected, setSelected] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [addTo, setAddTo] = useState<Project | null>(null)
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null)
  const [finished, setFinished] = useState<number | null>(null)
  const openId = usePanelTaskId()
  useEffect(() => setSelected(null), [step])
  // Working in a step (a selection, an open task) counts as choosing it.
  useEffect(() => { if (selected) chosen.current = true }, [selected])

  const current = step ?? 'clear'
  const taskRows = !steps ? [] : current === 'clear' ? steps.inbox : current === 'back' ? steps.overdue : current === 'ahead' ? steps.ahead : []
  const keyRows = useMemo(() => taskRows.map((tk) => ({ key: tk.id, task: tk })), [taskRows])
  useListKeys({
    rows: keyRows, selected, setSelected, openId, setOpenId: setPanelTaskId, pickerFor, setPickerFor,
    paused: current === 'next' || !!addTo,
    onIdleEscape: () => { setSelected(null); focusTab() },
  })
  // Next actions: j / k select a project row, Enter opens quick add for it.
  const projectRows = steps?.nextActions ?? []
  const pIdx = projectRows.findIndex((r) => r.project.id === selected)
  useShortcutScope('list', {
    'list.down': () => setSelected(projectRows[Math.min(projectRows.length - 1, pIdx + 1)]?.project.id ?? null),
    'list.up': () => setSelected(projectRows[Math.max(0, pIdx - 1)]?.project.id ?? null),
    'list.open': (e) => {
      const target = e.target as Element | null
      if (pIdx < 0 || (isActivationTarget(target) && target?.getAttribute('role') !== 'tab')) return false
      setAddTo(projectRows[pIdx].project)
    },
    'list.escape': () => { if (!selected) return false; setSelected(null); focusTab() },
  }, { enabled: current === 'next' && !addTo })

  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const allDone = !!steps && STEP_IDS.every((s) => steps.done[s])
  const last = finished ?? (review?.completed_at || null)

  const archive = async (p: Project) => {
    await archiveProject(p.id)
    setNotice({ text: t('Archived {name}.', { name: p.name }), undo: () => void unarchiveProject(p.id).then(() => setNotice(null)) })
  }
  const add = async ({ labels: typed, ...rest }: QuickAddInput) => {
    if (!addTo) return
    await createTask({ ...rest, project_id: addTo.id, labels: typed ?? [] })
    setNotice({ text: t('Added a next action to {name}.', { name: addTo.name }) })
    setAddTo(null)
  }

  return (
    <PageBody width="list">
      <PageHeader title={t('Weekly review')} icon="clipboard-check"
        subtitle={last ? t('Last review {instant}', { instant: formatInstant(last, 'long') }) : t('No review finished yet')}
        actions={<Button size="sm" variant={allDone ? 'primary' : 'secondary'} onClick={() => void (async () => {
          const now = Date.now()
          await finishReview(now)
          setFinished(now)
          focusTab()
        })()}>{t('Finish review')}</Button>} />
      {!steps || !step ? <Skeleton shape="row" count={4} /> : (
        <>
          {allDone && <div className="mb-3"><Notice tone="success">{t('Every step is done. Finish the review to record it on all your devices.')}</Notice></div>}
          {finished && <p role="status" className="mb-3 text-meta text-muted" data-testid="review-finished">{t('Review finished {instant}.', { instant: formatInstant(finished, 'long') })}</p>}
          {notice && (
            <div className="mb-3"><Notice tone="info" action={notice.undo && <Button size="sm" onClick={notice.undo}>{t('Undo')}</Button>}>{notice.text}</Notice></div>
          )}
          <div ref={tabs}>
            <Tabs label={t('Review steps')} value={step} onChange={(s) => { chosen.current = true; setStep(s as StepId) }}
              tabs={STEP_IDS.map((s) => ({
                id: s,
                label: (
                  <span className="inline-flex items-center gap-1.5" data-step={s}>
                    {steps.done[s] && <Icon name="check" size="sm" />}
                    {STEP_TITLES[s]}
                    <span className="sr-only">{steps.done[s] ? `, ${t('done')}` : `, ${t('{n} left', { n: steps.left[s] })}`}</span>
                  </span>
                ),
                count: steps.done[s] || s === 'ahead' ? undefined : steps.left[s],
              }))}>
              <StepIntro step={step} steps={steps} />
              {step === 'next' ? (
                <ProjectRows rows={projectRows} selected={selected} onAdd={setAddTo} onArchive={(p) => void archive(p)} onSelect={setSelected} />
              ) : (
                <ul data-testid={`review-${step}`}>
                  {taskRows.map((item) => (
                    <TaskRow key={item.id} task={item} project={item.project_id ? projectMap.get(item.project_id) : undefined} labels={resolveLabels(item.labels, labelMap)}
                      showProject={step !== 'clear'} selected={item.id === selected}
                      onToggle={() => void setTaskCompleted(item.id, !item.completed_at)}
                      onOpen={() => { setSelected(item.id); setPanelTaskId(item.id) }} />
                  ))}
                </ul>
              )}
            </Tabs>
          </div>
        </>
      )}
      {addTo && (
        <Dialog title={t('Add a next action to {name}', { name: addTo.name })} onClose={() => setAddTo(null)}>
          <QuickAdd autoFocus hideHint placeholder={t('What is the next step?')} label={t('Next action for {name}', { name: addTo.name })}
            projects={projects.filter((p) => !p.deleted_at && !p.archived)} labels={labels} onAdd={add} />
        </Dialog>
      )}
      {pickerFor && (
        <Dialog title={t('Labels')} label={t('Labels for task')} onClose={() => setPickerFor(null)}>
          <LabelPicker taskId={pickerFor} onClose={() => setPickerFor(null)} />
        </Dialog>
      )}
    </PageBody>
  )
}

function StepIntro({ step, steps }: { step: StepId; steps: NonNullable<ReturnType<typeof reviewSteps>> }) {
  switch (step) {
    case 'clear':
      return (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-body text-muted">{steps.inbox.length ? t('{count} to process: move, schedule, complete or trash each Inbox task.', { count: steps.inbox.length }) : t('The Inbox is empty.')}</p>
          {steps.inbox.length > 0 && <Button size="sm" onClick={() => navigate({ view: 'triage' })}>{t('Process the Inbox')}</Button>}
        </div>
      )
    case 'back':
      return (
        <p className="mb-2 text-body text-muted">
          {t('{n, plural, one {You completed # task this week.} other {You completed # tasks this week.}}', { n: steps.completedThisWeek })}{' '}
          {steps.overdue.length ? t('{n} overdue: complete them with c, or open one to give it a new date.', { n: steps.overdue.length }) : t('Nothing is overdue.')}{' '}
          <button type="button" className="text-accent underline" onClick={() => navigate({ view: 'stats' })}>{t('See statistics')}</button>
        </p>
      )
    case 'next':
      return <p className="mb-2 text-body text-muted">{steps.nextActions.length ? t('These projects have no open task. Add the next step, or archive the project if it is finished.') : t('Every project has a next action.')} <HelpLink screen="review" topic={t('Weekly review')} /></p>
    default:
      return <p className="mb-2 text-body text-muted">{steps.ahead.length ? t('Due today and in the next six days. Set priorities with 1 to 4.') : t('Nothing is due in the next seven days.')}</p>
  }
}

function ProjectRows({ rows, selected, onAdd, onArchive, onSelect }: {
  rows: readonly NextActionProject[]
  selected: string | null
  onAdd: (p: Project) => void
  onArchive: (p: Project) => void
  onSelect: (id: string) => void
}) {
  return (
    <ul data-testid="review-next" className="divide-y divide-(--ot-border)">
      {rows.map(({ project: p, canArchive }) => (
        <li key={p.id} data-review-project={p.id} aria-selected={p.id === selected} onClick={() => onSelect(p.id)}
          className={`flex flex-wrap items-center justify-between gap-2 rounded-control px-2 py-2 ${p.id === selected ? 'bg-accent-soft' : ''}`}>
          <span className="flex min-w-0 items-center gap-2 text-body text-default">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="truncate">{p.name}</span>
          </span>
          <span className="flex gap-2">
            <Button size="sm" icon="plus" onClick={() => onAdd(p)}>{t('Add a next action')}</Button>
            {canArchive && <Button size="sm" variant="ghost" icon="archive" onClick={() => onArchive(p)}>{t('Archive')}</Button>}
          </span>
        </li>
      ))}
    </ul>
  )
}
