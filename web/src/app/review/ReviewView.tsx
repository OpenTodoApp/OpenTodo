// The weekly review (OpenSpec changes `stats-and-review` D3, D4, D8 and
// `open-loops-method` D6): seven steps in three phases with live data from the
// local rows (lib/review.ts), on the Tabs primitive and the ordinary task rows,
// so the list keys work inside each list step; the Projects step is the project
// walk, which owns the keyboard while it is shown. "Finish review" writes the
// synced `review` row; the menu opens the Daily check and the Monthly look.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Dialog, Icon, MenuItem, Notice, PageBody, PageHeader, Skeleton, Tabs } from '../../ui'
import { useAllLabels, useAllProjects, useReviewRow, useReviewedAt } from '../../lib/localData'
import { formatInstant } from '../../lib/dates'
import { createTask, setTaskCompleted } from '../../lib/ops'
import { resolveLabels } from '../../lib/labels'
import { finishReview, firstUnfinished, PHASE_OF, PHASE_TITLES, reviewSteps, STEP_IDS, STEP_TITLES, SWEEP_PROMPTS, type ReviewSteps, type StepId, type WalkProject } from '../../lib/review'
import { compute, periodFor, sharedIds } from '../../lib/stats'
import type { Project, Task } from '../../lib/types'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { useWithMethod } from '../help/MethodLink'
import { LabelPicker } from '../LabelPicker'
import { useMethodInput } from '../method/useMethodInput'
import { setPanelTaskId, usePanelTaskId } from '../panel'
import { QuickAdd, type QuickAddInput } from '../QuickAdd'
import { navigate } from '../router'
import { TaskRow } from '../TaskRow'
import { useListKeys } from '../useListKeys'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { ProjectWalk } from './ProjectWalk'

const LIST_STEPS: readonly StepId[] = ['clear', 'back', 'waiting', 'ahead', 'someday']

export function ReviewView({ step: routeStep }: { userId?: string; step?: string }) {
  const weekStart = useDateTimeFormat().resolved.weekStart
  const input = useMethodInput()
  const projects = useAllProjects()
  const labels = useAllLabels()
  const reviewedAt = useReviewedAt()
  const review = useReviewRow()
  const [now, setNow] = useState(() => Date.now())
  const steps = useMemo(() => {
    if (!input) return null
    const thisWeek = compute({ tasks: input.tasks, projects: input.projects, shared: sharedIds([...input.memberships.values()]), me: input.me, today: input.today }, periodFor('this-week', input.today, weekStart), weekStart)
    return reviewSteps({ ...input, completedThisWeek: thisWeek.completed, reviewedAt, now })
  }, [input, reviewedAt, now, weekStart])

  const initial = (STEP_IDS as readonly string[]).includes(routeStep ?? '') ? (routeStep as StepId) : null
  const [step, setStep] = useState<StepId | null>(initial)
  // The screen opens on the first step that is not done (weekly-review "Review screen"),
  // and keeps following it while rows are still arriving (a first sync), until the user picks a step.
  const chosen = useRef(!!initial)
  useEffect(() => { if (steps && !chosen.current) setStep(firstUnfinished(steps.done)) }, [steps])
  const tabs = useRef<HTMLDivElement>(null)
  const focusTab = () => (tabs.current?.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement | null)?.focus()
  // The selected tab takes focus, so the arrow keys move between steps (also when the opening step moves during a first sync).
  useEffect(() => { if (step && !chosen.current) focusTab() }, [step])

  const [selected, setSelected] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [addTo, setAddTo] = useState<Project | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [finished, setFinished] = useState<number | null>(null)
  const openId = usePanelTaskId()
  useEffect(() => setSelected(null), [step])
  // Working in a step (a selection, an open task) counts as choosing it.
  useEffect(() => { if (selected) chosen.current = true }, [selected])
  // The walk compares stamps with "now"; refresh it when a project is marked reviewed.
  useEffect(() => setNow(Date.now()), [reviewedAt])

  const current = step ?? 'clear'
  const taskRows = useMemo(() => (steps ? stepTasks(steps, current) : []), [steps, current])
  const keyRows = useMemo(() => taskRows.map((tk) => ({ key: tk.id, task: tk })), [taskRows])
  useListKeys({
    rows: keyRows, selected, setSelected, openId, setOpenId: setPanelTaskId, pickerFor, setPickerFor,
    paused: !LIST_STEPS.includes(current) || !!addTo,
    onIdleEscape: () => { setSelected(null); focusTab() },
  })

  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const allDone = !!steps && STEP_IDS.every((s) => steps.done[s])
  const last = finished ?? (review?.completed_at || null)
  const methodMeta = useWithMethod('review')
  const subtitle = useWithMethod('review', last ? t('Last review {instant}', { instant: formatInstant(last, 'long') }) : t('No review finished yet'))

  const add = async ({ labels: typed, ...rest }: QuickAddInput) => {
    if (!addTo) return
    await createTask({ ...rest, project_id: addTo.id, labels: typed ?? [] })
    setNotice(t('Added a next action to {name}.', { name: addTo.name }))
    setAddTo(null)
  }

  return (
    <PageBody width="list">
      <PageHeader title={t('Weekly review')} icon="clipboard-check" meta={methodMeta} subtitle={subtitle} help="review"
        actions={<Button size="sm" variant={allDone ? 'primary' : 'secondary'} onClick={() => void (async () => {
          const at = Date.now()
          await finishReview(at)
          setFinished(at)
          focusTab()
        })()}>{t('Finish review')}</Button>}
        overflow={<>
          <MenuItem icon="sun" label={t('Daily check', { context: 'method' })} onSelect={() => navigate({ view: 'review', step: 'daily' })} />
          <MenuItem icon="calendar-range" label={t('Monthly look', { context: 'method' })} onSelect={() => navigate({ view: 'review', step: 'monthly' })} />
        </>} />
      {!steps || !step ? <Skeleton shape="row" count={4} /> : (
        <>
          {allDone && <div className="mb-3"><Notice tone="success">{t('Every step is done. Finish the review to record it on all your devices.')}</Notice></div>}
          {finished && <p role="status" className="mb-3 text-meta text-muted" data-testid="review-finished">{t('Review finished {instant}.', { instant: formatInstant(finished, 'long') })}</p>}
          {notice && <div className="mb-3"><Notice tone="info">{notice}</Notice></div>}
          <div ref={tabs}>
            <Tabs label={t('Review steps')} value={step} onChange={(s) => { chosen.current = true; setStep(s as StepId) }}
              tabs={STEP_IDS.map((s) => ({
                id: s,
                group: PHASE_TITLES[PHASE_OF[s]],
                label: (
                  <span className="inline-flex items-center gap-1.5" data-step={s}>
                    {steps.done[s] && <Icon name="check" size="sm" />}
                    {STEP_TITLES[s]}
                    <span className="sr-only">{steps.done[s] ? `, ${t('done')}` : `, ${t('{n} left', { n: steps.left[s] })}`}</span>
                  </span>
                ),
                count: steps.done[s] ? undefined : steps.left[s] || undefined,
              }))}>
              <StepIntro step={step} steps={steps} />
              {step === 'projects' ? (
                <ProjectWalk walk={steps.walk} now={now} paused={!!addTo || !!openId} onAdd={(w: WalkProject) => setAddTo(w.project)} />
              ) : step === 'sweep' ? (
                <MindSweep projects={projects} labels={labels} />
              ) : (
                <ul data-testid={`review-${step}`}>
                  {taskRows.map((item) => (
                    <TaskRow key={item.id} task={item} project={item.project_id ? projectMap.get(item.project_id) : undefined} labels={resolveLabels(item.labels, labelMap)}
                      showProject={step !== 'clear'} selected={item.id === selected}
                      onToggle={() => act(setTaskCompleted(item.id, !item.completed_at))}
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

/** The task rows of a list step. */
function stepTasks(steps: ReviewSteps, step: StepId): Task[] {
  switch (step) {
    case 'clear': return steps.inbox
    case 'back': return steps.overdue
    case 'waiting': return steps.waiting
    case 'ahead': return steps.ahead
    case 'someday': return steps.someday
    default: return []
  }
}

/** Mind sweep (weekly-review "Mind sweep"): trigger prompts and a quick add that captures into the Inbox and keeps focus. */
function MindSweep({ projects, labels }: { projects: Project[]; labels: ReturnType<typeof useAllLabels> }) {
  const [caught, setCaught] = useState(0)
  return (
    <div data-testid="review-sweep">
      <ul className="mb-3 grid gap-x-4 gap-y-1 text-body text-muted sm:grid-cols-2">
        {SWEEP_PROMPTS.map((p) => <li key={p} className="flex items-center gap-2"><Icon name="chevron-right" size="sm" />{t(p)}</li>)}
      </ul>
      <QuickAdd hideHint placeholder={t('Whatever is on your mind…')} label={t('Catch into the Inbox')}
        projects={projects.filter((p) => !p.deleted_at && !p.archived)} labels={labels}
        onAdd={async (input) => { await createTask({ ...input, project_id: input.project_id ?? null, labels: input.labels ?? [] }); setCaught((n) => n + 1) }} />
      {caught > 0 && <p role="status" className="mt-2 text-meta text-muted">{t('{n, plural, one {# caught into the Inbox.} other {# caught into the Inbox.}}', { n: caught })}</p>}
    </div>
  )
}

function StepIntro({ step, steps }: { step: StepId; steps: ReviewSteps }) {
  switch (step) {
    case 'clear':
      return (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-body text-muted">{steps.inbox.length ? t('{count} to process: move, schedule, complete or trash each Inbox task.', { count: steps.inbox.length }) : t('The Inbox is empty.')}</p>
          {steps.inbox.length > 0 && <Button size="sm" onClick={() => navigate({ view: 'triage' })}>{t('Process the Inbox')}</Button>}
        </div>
      )
    case 'sweep':
      return <p className="mb-2 text-body text-muted">{t('What else is on your mind? Read each prompt and catch whatever comes up. Process it in the Inbox step afterwards.')}</p>
    case 'back':
      return (
        <p className="mb-2 text-body text-muted">
          {t('{n, plural, one {You completed # task this week.} other {You completed # tasks this week.}}', { n: steps.completedThisWeek })}{' '}
          {steps.overdue.length ? t('{n} overdue: complete them with c, or open one to give it a new date.', { n: steps.overdue.length }) : t('Nothing is overdue.')}{' '}
          <button type="button" className="text-accent underline" onClick={() => navigate({ view: 'stats' })}>{t('See statistics')}</button>
        </p>
      )
    case 'waiting':
      return <p className="mb-2 text-body text-muted">{steps.waiting.length ? t('Assigned to someone else or blocked by another task. Open one to follow up in its comments.') : t('Nothing is waiting.')}</p>
    case 'projects':
      return <p className="mb-2 text-body text-muted">{t('One project at a time: is it still alive, and is its next step clear? r marks it reviewed, q adds a next action.')}</p>
    case 'someday':
      return <p className="mb-2 text-body text-muted">{steps.someday.length ? t('Anything you now want to do? n brings a task back from Someday, c completes it, Delete trashes it.') : t('Nothing is parked in Someday.')}</p>
    default:
      return <p className="mb-2 text-body text-muted">{steps.ahead.length ? t('Due today and in the next six days. Set priorities with 1 to 4.') : t('Nothing is due in the next seven days.')}</p>
  }
}
