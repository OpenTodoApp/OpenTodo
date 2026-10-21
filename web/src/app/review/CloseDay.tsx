// Close the day (OpenSpec change close-the-day, design D1–D4, D8): three steps on
// the review stepper. How the day went (pure figures from lib/review.ts
// `daySummary`, the Statistics definitions), Carry over (one decision per unfinished
// task of Today, device state until Apply writes ONE undoable batch through the
// bulk path) and A line for tomorrow (the close writes `closed_at` and
// `tomorrow_note` on the synced `review` row, then Today opens).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { formatInstant } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { resolveLabels } from '../../lib/labels'
import { useAllLabels, useReviewRow } from '../../lib/localData'
import { setTaskCompleted } from '../../lib/ops'
import {
  applyCarryOver, CLOSE_PHASE_TITLES, CLOSE_STEP_IDS, CLOSE_STEP_TITLES, closeDay, dayClosed, daySummary, TOMORROW_NOTE_MAX,
  type CarryDecision, type CarryTask, type CloseStepId, type DaySummary,
} from '../../lib/review'
import type { Label, Project } from '../../lib/types'
import { Badge, Button, Dialog, Field, Input, Notice, PageBody, PageHeader, Skeleton, type IconName } from '../../ui'
import { act } from '../actionError'
import { showBulkToast } from '../bulk/toastStore'
import { DateField } from '../datetime/DateField'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { LabelPicker } from '../LabelPicker'
import { useMethodInput } from '../method/useMethodInput'
import { setPanelTaskId, usePanelTaskId } from '../panel'
import { navigate } from '../router'
import { useShortcutScope } from '../shortcuts'
import { TaskRow } from '../TaskRow'
import { useListKeys } from '../useListKeys'
import { reopenDayAction } from '../reopenDay'
import { ReviewProgress } from './ReviewProgress'
import { StepCard } from './StepCard'

const ICONS: Record<CloseStepId, IconName> = { summary: 'chart-column', carry: 'calendar-days', note: 'moon' }
const PHASE_OF: Record<CloseStepId, 'close'> = { summary: 'close', carry: 'close', note: 'close' }
const TOMORROW: CarryDecision = { kind: 'tomorrow' }
const KEEP: CarryDecision = { kind: 'keep' }

/** The decision a row shows: the chosen one, else Tomorrow (Keep for a task the user may not edit). */
const decisionOf = (decisions: ReadonlyMap<string, CarryDecision>, x: CarryTask): CarryDecision => (x.editable ? decisions.get(x.task.id) ?? TOMORROW : KEEP)

/** `initialStep` opens another step first (the stories). */
export function CloseDay({ initialStep = 'summary' }: { initialStep?: CloseStepId } = {}) {
  const weekStart = useDateTimeFormat().resolved.weekStart
  const input = useMethodInput()
  const review = useReviewRow()
  const labels = useAllLabels()
  const summary = useMemo(() => (input ? daySummary(input, review, weekStart) : null), [input, review, weekStart])
  const [step, setStep] = useState<CloseStepId>(initialStep)
  const [decisions, setDecisions] = useState<Map<string, CarryDecision>>(() => new Map())
  const [applied, setApplied] = useState(false)
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [picking, setPicking] = useState<CarryTask | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const openId = usePanelTaskId()
  // Opening the screen and every step change put focus on the step's title.
  const title = useRef<HTMLHeadingElement>(null)
  const loaded = !!summary
  useEffect(() => { if (loaded) title.current?.focus({ preventScroll: false }) }, [step, loaded])
  useEffect(() => setSelected(null), [step])

  const unfinished = useMemo(() => summary?.unfinished ?? [], [summary])
  const keyRows = useMemo(() => unfinished.map((x) => ({ key: x.task.id, task: x.task })), [unfinished])
  // The list keys (j / k / c / Enter) on the Carry over rows; `y` is this screen's Someday,
  // so the list's time-tracking `y` passes the key on to the view entry below.
  useListKeys({
    rows: keyRows, selected, setSelected, openId, setOpenId: setPanelTaskId, pickerFor, setPickerFor,
    paused: step !== 'carry' || !!picking, onIdleEscape: () => { setSelected(null); title.current?.focus() },
    extra: { 'list.track': () => false },
  })
  const decide = (x: CarryTask, d: CarryDecision) => {
    if (!x.editable && d.kind !== 'keep') return
    setDecisions((m) => new Map(m).set(x.task.id, d))
    setApplied(false)
  }
  const selectedRow = unfinished.find((x) => x.task.id === selected)
  const onRow = (fn: (x: CarryTask) => void) => () => {
    if (step !== 'carry' || !selectedRow || openId) return false
    fn(selectedRow)
  }
  const index = CLOSE_STEP_IDS.indexOf(step)
  const prev = index > 0 ? CLOSE_STEP_IDS[index - 1] : null
  const next = index < CLOSE_STEP_IDS.length - 1 ? CLOSE_STEP_IDS[index + 1] : null
  useShortcutScope('view', {
    'review.prev-step': () => { if (!prev) return false; setStep(prev) },
    'review.next-step': () => { if (!next) return false; setStep(next) },
    'close.tomorrow': onRow((x) => decide(x, TOMORROW)),
    'close.pick': onRow((x) => { if (x.editable) setPicking(x) }),
    'close.someday': onRow((x) => decide(x, { kind: 'someday' })),
    'close.keep': onRow((x) => decide(x, KEEP)),
  }, { view: 'review', paused: !!picking || !!pickerFor })

  const apply = async () => {
    if (!input) return
    const r = await applyCarryOver(decisions, unfinished, input.today)
    if (r.entry) showBulkToast(r.label, r.entry.id)
    setApplied(true)
  }
  const finish = async () => {
    await closeDay(note)
    navigate({ view: 'today' })
  }

  const closedToday = !!input && dayClosed(review?.closed_at, input.today)
  const meta = closedToday ? t('Day closed, {time}', { time: formatInstant(review!.closed_at, 'time') }) : undefined
  const left = applied ? 0 : unfinished.filter((x) => x.editable && decisionOf(decisions, x).kind !== 'keep').length
  const progress = {
    done: { summary: index > 0, carry: unfinished.length === 0 || applied, note: false },
    left: { summary: 0, carry: left, note: 0 },
  }
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const projectMap = useMemo(() => new Map((input?.projects ?? []).map((p) => [p.id, p])), [input])

  return (
    <PageBody width="list">
      <PageHeader title={t('Close the day')} icon="moon" meta={meta} help="review/close"
        actions={closedToday && input ? <Button variant="secondary" size="sm" icon="rotate-ccw" onClick={() => reopenDayAction(input.today)} data-reopen-day>{t('Reopen the day')}</Button> : undefined}
        back={{ label: t('Today'), onClick: () => navigate({ view: 'today' }), hideFrom: 'lg' }} />
      {!summary ? <Skeleton shape="row" count={4} /> : (
        <>
          <ReviewProgress<CloseStepId, 'close'> steps={progress} step={step} onStep={setStep} ids={CLOSE_STEP_IDS} phases={['close']}
            phaseOf={PHASE_OF} phaseTitles={CLOSE_PHASE_TITLES} stepTitles={CLOSE_STEP_TITLES} label={t('Close the day progress')} />
          <StepCard step={step} titleRef={title} icon={ICONS[step]} title={CLOSE_STEP_TITLES[step]}
            position={t('Step {n} of {total} · {phase}', { n: index + 1, total: CLOSE_STEP_IDS.length, phase: CLOSE_PHASE_TITLES.close })}
            badge={step === 'carry' && unfinished.length > 0 && (applied ? <Badge hue="green">{t('Applied')}</Badge> : <Badge hue="orange">{t('Not applied')}</Badge>)}
            onBack={prev ? () => setStep(prev) : null}
            next={next ? { label: t('Next: {step}', { step: CLOSE_STEP_TITLES[next] }), onClick: () => setStep(next) } : { label: t('Close the day'), onClick: finish, finish: true }}>
            {step === 'summary' && <SummaryStep summary={summary} />}
            {step === 'carry' && (
              <CarryStep rows={unfinished} decisions={decisions} applied={applied} selected={selected} projectMap={projectMap} labelMap={labelMap}
                onDecide={decide} onPick={setPicking} onApply={apply} onOpen={(id) => { setSelected(id); setPanelTaskId(id) }} />
            )}
            {step === 'note' && <NoteStep note={note} onNote={setNote} left={unfinished.length} onClose={finish} />}
          </StepCard>
        </>
      )}
      {picking && (
        <Dialog title={t('Pick a day for {title}', { title: picking.task.title })} onClose={() => setPicking(null)}>
          <DateField label={t('Date')} autoFocus value={null} onChange={(iso) => { const x = picking; setPicking(null); if (iso) decide(x, { kind: 'day', date: iso }) }} />
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

/** How the day went: three figures, no time, mood or score (weekly-review "How the day went"). */
function SummaryStep({ summary }: { summary: DaySummary }) {
  if (summary.planned === 0) return <p className="text-body text-muted" data-close-empty>{t('Nothing was planned for today and nothing was completed.')}</p>
  const figures = [
    { key: 'planned', value: String(summary.planned), label: t('planned') },
    { key: 'done', value: String(summary.done), label: t('done') },
    ...(summary.focusTotal > 0 ? [{ key: 'focus', value: t('{done} of {total} done', { done: summary.focusDone, total: summary.focusTotal }), label: t('Today’s focus') }] : []),
  ]
  return (
    <>
      <p className="mb-3 text-body text-muted">{t('What Today listed plus what you finished today.')}</p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-close-summary>
        {figures.map((f) => (
          <div key={f.key} className="rounded-card border border-default bg-surface px-3 py-2" data-close-figure={f.key}>
            <dt className="text-meta text-muted">{f.label}</dt>
            <dd className="text-h2 font-semibold tabular-nums text-strong">{f.value}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

const CHOICES: { kind: CarryDecision['kind']; label: () => string }[] = [
  { kind: 'tomorrow', label: () => t('Tomorrow') },
  { kind: 'day', label: () => t('Pick a day') },
  { kind: 'someday', label: () => t('Someday') },
  { kind: 'keep', label: () => t('Keep in Today') },
]

/** Carry over: every unfinished task of Today with its decision, and Apply (weekly-review "Carry over unfinished tasks"). */
function CarryStep({ rows, decisions, applied, selected, projectMap, labelMap, onDecide, onPick, onApply, onOpen }: {
  rows: CarryTask[]
  decisions: ReadonlyMap<string, CarryDecision>
  applied: boolean
  selected: string | null
  projectMap: Map<string, Project>
  labelMap: Map<string, Label>
  onDecide: (x: CarryTask, d: CarryDecision) => void
  onPick: (x: CarryTask) => void
  onApply: () => Promise<void>
  onOpen: (id: string) => void
}) {
  if (rows.length === 0) return <p className="text-body text-muted" data-close-nothing>{t('Today is done: nothing to carry over.')}</p>
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-body text-muted" data-close-count>
          {t('{n, plural, one {# task is still in Today.} other {# tasks are still in Today.}}', { n: rows.length })}{' '}
          {applied ? t('Applied.') : t('Not applied yet: choose for each, then Apply.')}
        </p>
        <Button size="sm" variant="secondary" icon="check" onClick={onApply} data-close-apply>{t('Apply')}</Button>
      </div>
      <p className="mb-2 text-meta text-faint">{t('On the selected task: t tomorrow, p pick a day, y Someday, h keep in Today.')}</p>
      <ul className="-mx-2" data-testid="close-carry">
        {rows.map((x) => (
          <li key={x.task.id} className="border-b border-default last:border-b-0 sm:flex sm:items-center sm:gap-2" data-carry-row={x.task.id}>
            <ul className="min-w-0 sm:flex-1">
              <TaskRow task={x.task} project={x.task.project_id ? projectMap.get(x.task.project_id) : undefined} labels={resolveLabels(x.task.labels, labelMap)}
                showProject selected={x.task.id === selected} readOnly={!x.editable}
                onToggle={() => act(setTaskCompleted(x.task.id, !x.task.completed_at))} onOpen={() => onOpen(x.task.id)} />
            </ul>
            <DecisionGroup row={x} decision={decisionOf(decisions, x)} onDecide={onDecide} onPick={onPick} />
          </li>
        ))}
      </ul>
    </>
  )
}

/** One task's four decisions as a radio group; arrow keys move within it. A read-only task offers Keep only. */
function DecisionGroup({ row, decision, onDecide, onPick }: { row: CarryTask; decision: CarryDecision; onDecide: (x: CarryTask, d: CarryDecision) => void; onPick: (x: CarryTask) => void }) {
  const dt = useDateTimeFormat()
  const choices = row.editable ? CHOICES : CHOICES.filter((c) => c.kind === 'keep')
  const choose = (kind: CarryDecision['kind']) => {
    if (kind === 'day') onPick(row)
    else onDecide(row, { kind } as CarryDecision)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    e.stopPropagation()
    const at = choices.findIndex((c) => c.kind === decision.kind)
    const nextChoice = choices[(at + (e.key === 'ArrowRight' ? 1 : choices.length - 1)) % choices.length]
    choose(nextChoice.kind)
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    buttons[choices.indexOf(nextChoice)]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={t('What happens to {title}', { title: row.task.title })} onKeyDown={onKeyDown}
      className="grid grid-cols-2 gap-1 px-2 pb-2 sm:flex sm:shrink-0 sm:pb-0" data-carry-decision={decision.kind}>
      {choices.map((c) => {
        const checked = c.kind === decision.kind
        const label = c.kind === 'day' && decision.kind === 'day' ? dt.formatDate(decision.date, 'long') : c.label()
        return (
          <Button key={c.kind} size="sm" variant={checked ? 'primary' : 'ghost'} role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1}
            onClick={() => choose(c.kind)} data-carry-choice={c.kind}>{label}</Button>
        )
      })}
    </div>
  )
}

/** A line for tomorrow: one optional field; Enter or the primary action closes the day. */
function NoteStep({ note, onNote, left, onClose }: { note: string; onNote: (v: string) => void; left: number; onClose: () => Promise<void> }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); act(onClose()) }} data-close-note>
      {left > 0 && <div className="mb-3"><Notice tone="info">{t('{n, plural, one {# task is still in Today.} other {# tasks are still in Today.}}', { n: left })}</Notice></div>}
      <Field label={t('One line for tomorrow (optional)')} description={t('Shown at the top of tomorrow’s Daily check.')}>
        <Input value={note} maxLength={TOMORROW_NOTE_MAX} onChange={(e) => onNote(e.target.value)} placeholder={t('Start with…')} data-close-note-input />
      </Field>
    </form>
  )
}
