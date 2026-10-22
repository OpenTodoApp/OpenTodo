// The weekly review (OpenSpec changes `stats-and-review` D3, D4, D8,
// `open-loops-method` D6 and `review-guided-stepper`): seven steps in three phases
// with live data from the local rows (lib/review.ts), walked one at a time: the
// progress above, the step in one card, Back and Next below (and `[` / `]`). List
// steps use the ordinary task rows, so the list keys work inside them; the Projects
// step is the project walk, which owns its keys while it is shown. "Finish review"
// writes the synced `review` row; the menu opens the Daily check and the Monthly look.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Card, Dialog, Icon, MenuItem, Notice, PageBody, PageHeader, Skeleton, type IconName } from '../../ui'
import { useAllLabels, useAllProjects, useReviewRow, useReviewedAt } from '../../lib/localData'
import { formatInstant } from '../../lib/dates'
import { createTask, setTaskCompleted } from '../../lib/ops'
import { resolveLabels } from '../../lib/labels'
import { hasTimeColumn } from '../../lib/rowTime'
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
import { ReviewProgress } from './ReviewProgress'
import { StepCard } from './StepCard'
import { useShortcutScope } from '../shortcuts'

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
  // Changing step (and opening the screen) puts focus on the step's title, which names it and its position.
  const title = useRef<HTMLHeadingElement>(null)
  const focusTitle = () => title.current?.focus({ preventScroll: false })
  useEffect(() => { if (step) focusTitle() }, [step])

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
  // The time column (rows-v2 D2): one fact of the step's list.
  const timeColumn = useMemo(() => hasTimeColumn(taskRows), [taskRows])
  const keyRows = useMemo(() => taskRows.map((tk) => ({ key: tk.id, task: tk })), [taskRows])
  useListKeys({
    rows: keyRows, selected, setSelected, openId, setOpenId: setPanelTaskId, pickerFor, setPickerFor,
    paused: !LIST_STEPS.includes(current) || !!addTo,
    onIdleEscape: () => { setSelected(null); focusTitle() },
  })

  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const allDone = !!steps && STEP_IDS.every((s) => steps.done[s])
  const last = finished ?? (review?.completed_at || null)
  const methodMeta = useWithMethod('review')
  const subtitle = useWithMethod('review', last ? t('Last review {instant}', { instant: formatInstant(last, 'long') }) : t('No review finished yet'))

  const finish = async () => {
    const at = Date.now()
    await finishReview(at)
    setFinished(at)
    focusTitle()
  }
  const go = (s: StepId) => { chosen.current = true; setStep(s) }
  const index = step ? STEP_IDS.indexOf(step) : 0
  const prev = index > 0 ? STEP_IDS[index - 1] : null
  const next = index < STEP_IDS.length - 1 ? STEP_IDS[index + 1] : null
  useShortcutScope('view', {
    'review.prev-step': () => { if (!prev) return false; go(prev) },
    'review.next-step': () => { if (!next) return false; go(next) },
  }, { view: 'review', paused: !step || !!addTo || !!pickerFor })

  const add = async ({ labels: typed, ...rest }: QuickAddInput) => {
    if (!addTo) return
    await createTask({ ...rest, project_id: addTo.id, labels: typed ?? [] })
    setNotice(t('Added a next action to {name}.', { name: addTo.name }))
    setAddTo(null)
  }

  return (
    <PageBody width="list">
      <PageHeader title={t('Weekly review')} icon="clipboard-check" meta={methodMeta} subtitle={subtitle} help="review"
        actions={<Button size="sm" variant={allDone ? 'primary' : 'secondary'} onClick={finish}>{t('Finish review')}</Button>}
        overflow={<>
          <MenuItem icon="sun" label={t('Daily check', { context: 'method' })} onSelect={() => navigate({ view: 'review', step: 'daily' })} />
          <MenuItem icon="calendar-range" label={t('Monthly look', { context: 'method' })} onSelect={() => navigate({ view: 'review', step: 'monthly' })} />
        </>} />
      {!steps || !step ? <Skeleton shape="row" count={4} /> : (
        <>
          {(allDone || finished) && <AllClear finished={finished} />}
          {notice && <div className="mb-3"><Notice tone="info">{notice}</Notice></div>}
          <ReviewProgress steps={steps} step={step} onStep={go} />
          <StepCard step={step} titleRef={title} icon={STEP_ICONS[step]} title={STEP_TITLES[step]}
            position={t('Step {n} of {total} · {phase}', { n: STEP_IDS.indexOf(step) + 1, total: STEP_IDS.length, phase: PHASE_TITLES[PHASE_OF[step]] })}
            badge={steps.done[step]
              ? <Badge hue="green">{t('Done')}</Badge>
              : steps.left[step] > 0 && <Badge hue="orange">{t('{n} left', { n: steps.left[step] })}</Badge>}
            onBack={prev ? () => go(prev) : null}
            next={next ? { label: t('Next: {step}', { step: STEP_TITLES[next] }), onClick: () => go(next) } : { label: t('Finish review'), onClick: finish, finish: true }}>
            <StepIntro step={step} steps={steps} />
            {step === 'projects' ? (
              <ProjectWalk walk={steps.walk} now={now} paused={!!addTo || !!openId} onAdd={(w: WalkProject) => setAddTo(w.project)} />
            ) : step === 'sweep' ? (
              <MindSweep projects={projects} labels={labels} />
            ) : taskRows.length > 0 && (
              <ul className="-mx-2" data-testid={`review-${step}`}>
                {taskRows.map((item) => (
                  <TaskRow key={item.id} task={item} project={item.project_id ? projectMap.get(item.project_id) : undefined} labels={resolveLabels(item.labels, labelMap)}
                    showProject={step !== 'clear'} selected={item.id === selected} timeColumn={timeColumn}
                    onToggle={() => act(setTaskCompleted(item.id, !item.completed_at))}
                    onOpen={() => { setSelected(item.id); setPanelTaskId(item.id) }} />
                ))}
              </ul>
            )}
          </StepCard>
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

const STEP_ICONS: Record<StepId, IconName> = { clear: 'inbox', sweep: 'lightbulb', back: 'history', waiting: 'hourglass', projects: 'folder', ahead: 'calendar-days', someday: 'star' }

/** Every step done, or the review just finished: a calm moment of closure before the next week. */
function AllClear({ finished }: { finished: number | null }) {
  return (
    <Card className="mb-5 flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left" data-review-all-clear>
      <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success-soft text-on-success-soft">
        <Icon name="circle-check-big" size="lg" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-h3 font-semibold text-strong">{finished ? t('Review done. See you next week.') : t('All clear')}</p>
        {finished
          ? <p role="status" className="text-body text-muted" data-testid="review-finished">{t('Review finished {instant}.', { instant: formatInstant(finished, 'long') })}</p>
          : <p className="text-body text-muted">{t('Every step is done. Finish the review to record it on all your devices.')}</p>}
      </div>
    </Card>
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
      <ul className="mb-4 flex flex-wrap gap-2" aria-label={t('Prompts')}>
        {SWEEP_PROMPTS.map((p) => <li key={p} className="rounded-chip border border-default bg-sunken px-3 py-1.5 text-meta text-default">{t(p)}</li>)}
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-body text-muted">{steps.inbox.length ? t('{count} to process: move, schedule, complete or trash each Inbox task.', { count: steps.inbox.length }) : t('The Inbox is empty.')}</p>
          {steps.inbox.length > 0 && <Button size="sm" onClick={() => navigate({ view: 'triage' })}>{t('Process the Inbox')}</Button>}
        </div>
      )
    case 'sweep':
      return <p className="mb-3 text-body text-muted">{t('What else is on your mind? Read each prompt and catch whatever comes up. Process it in the Inbox step afterwards.')}</p>
    case 'back':
      return (
        <p className="mb-3 text-body text-muted">
          {t('{n, plural, one {You completed # task this week.} other {You completed # tasks this week.}}', { n: steps.completedThisWeek })}{' '}
          {steps.overdue.length ? t('{n} overdue: complete them with c, or open one to give it a new date.', { n: steps.overdue.length }) : t('Nothing is overdue.')}{' '}
          <button type="button" className="text-accent underline" onClick={() => navigate({ view: 'stats' })}>{t('See statistics')}</button>
        </p>
      )
    case 'waiting':
      return <p className="mb-3 text-body text-muted">{steps.waiting.length ? t('Assigned to someone else or blocked by another task. Open one to follow up in its comments.') : t('Nothing is waiting.')}</p>
    case 'projects':
      return <p className="mb-3 text-body text-muted">{t('One project at a time: is it still alive, and is its next step clear? r marks it reviewed, q adds a next action.')}</p>
    case 'someday':
      return <p className="mb-3 text-body text-muted">{steps.someday.length ? t('Anything you now want to do? n brings a task back from Someday, c completes it, Delete trashes it.') : t('Nothing is parked in Someday.')}</p>
    default:
      return <p className="mb-3 text-body text-muted">{steps.ahead.length ? t('Due today and in the next six days. Set priorities with 1 to 4.') : t('Nothing is due in the next seven days.')}</p>
  }
}
