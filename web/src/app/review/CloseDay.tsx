// Close the day (OpenSpec changes close-the-day D1–D4, D8 and close-the-day-v2):
// three steps on the review stepper. The day being closed is the logical today
// when the screen opened and stays that day (v2 D1). How the day went is one
// sentence of figures from lib/review.ts `daySummary` (the Statistics definitions);
// Carry over takes the unfinished tasks one at a time (v2 D2, CarryOver.tsx) and
// writes the decisions as ONE undoable batch through the bulk path when the user
// moves on (v2 D3); A note for tomorrow morning closes the day, writing `closed_at`,
// `closed_day` and `tomorrow_note` on the synced `review` row. The screen then shows
// Done for today (moments-and-onboarding D6, DoneForToday.tsx).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatInstant, localDueOf } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { useReviewRow } from '../../lib/localData'
import {
  applyCarryOver, CLOSE_PHASE_TITLES, CLOSE_STEP_IDS, CLOSE_STEP_TITLES, closeDay, dayClosed, daySummary, TOMORROW_NOTE_MAX,
  type CarryDecision, type CarryTask, type CloseStepId, type DaySummary,
} from '../../lib/review'
import type { Project } from '../../lib/types'
import { Button, Dialog, Field, Input, Notice, PageBody, PageHeader, Skeleton, type IconName } from '../../ui'
import { act } from '../actionError'
import { showBulkToast } from '../bulk/toastStore'
import { DateField } from '../datetime/DateField'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { useMethodInput } from '../method/useMethodInput'
import { navigate } from '../router'
import { useShortcutScope } from '../shortcuts'
import { reopenDayAction } from '../reopenDay'
import { CarryCard, CarryList } from './CarryOver'
import { ReviewProgress } from './ReviewProgress'
import { StepCard } from './StepCard'
import { DoneForToday, NOTHING_CARRIED, type Carried, type DayDoneFigures } from './DoneForToday'

const ICONS: Record<CloseStepId, IconName> = { summary: 'chart-column', carry: 'calendar-days', note: 'moon' }
const PHASE_OF: Record<CloseStepId, 'close'> = { summary: 'close', carry: 'close', note: 'close' }
const TOMORROW: CarryDecision = { kind: 'tomorrow' }
const KEEP: CarryDecision = { kind: 'keep' }
const CARRY_AT = CLOSE_STEP_IDS.indexOf('carry')

/** The decision of a task: the chosen one, else Tomorrow (Keep for a task the user may not edit). */
const decisionOf = (decisions: ReadonlyMap<string, CarryDecision>, x: CarryTask): CarryDecision => (x.editable ? decisions.get(x.task.id) ?? TOMORROW : KEEP)

/**
 * The day being closed (close-the-day-v2 D1): the first logical today the screen
 * sees, kept until it is left, so a close finished after midnight closes the day
 * it was started on. `initialDay` fixes it (the stories).
 */
function useClosingDay(initialDay?: string) {
  const live = useMethodInput()
  const day = useRef<string | null>(initialDay ?? null)
  if (live && !day.current) day.current = live.today
  const input = useMemo(() => (live && day.current ? { ...live, today: day.current } : null), [live])
  return { live, input, day: day.current }
}

/** `initialStep` opens another step first, `initialDay` fixes the day (the stories). */
export function CloseDay({ initialStep = 'summary', initialDay }: { initialStep?: CloseStepId; initialDay?: string } = {}) {
  const weekStart = useDateTimeFormat().resolved.weekStart
  const { live, input, day } = useClosingDay(initialDay)
  const review = useReviewRow()
  const summary = useMemo(() => (input ? daySummary(input, review, weekStart) : null), [input, review, weekStart])
  const [step, setStep] = useState<CloseStepId>(initialStep)
  const [decisions, setDecisions] = useState<Map<string, CarryDecision>>(() => new Map())
  // The task on the card; 'end' once every task has a decision.
  const [cursor, setCursor] = useState<string | null>(null)
  // Whether the user has moved on from Carry over (its circle then shows a check).
  const [passed, setPassed] = useState(initialStep === 'note')
  // What the batches carried, and the final state once the close is written (device state only).
  const [carried, setCarried] = useState<Carried>(NOTHING_CARRIED)
  // The tasks the latest batch left in Today (Keep, or read-only); null until a batch is written.
  const [kept, setKept] = useState<number | null>(null)
  const [closed, setClosed] = useState<DayDoneFigures | null>(null)
  const [note, setNote] = useState('')
  const [picking, setPicking] = useState<CarryTask | null>(null)
  // Opening the screen and every step change put focus on the step's title.
  const title = useRef<HTMLHeadingElement>(null)
  const loaded = !!summary
  useEffect(() => { if (loaded) title.current?.focus({ preventScroll: false }) }, [step, loaded])

  const unfinished = useMemo(() => summary?.unfinished ?? [], [summary])
  const shown = cursor === 'end' ? null : unfinished.find((x) => x.task.id === cursor) ?? unfinished.find((x) => !decisions.has(x.task.id)) ?? null
  const decide = (x: CarryTask, d: CarryDecision) => {
    if (!x.editable && d.kind !== 'keep') return
    const next = new Map(decisions).set(x.task.id, d)
    setDecisions(next)
    const after = unfinished.slice(unfinished.indexOf(x) + 1).find((y) => !next.has(y.task.id))
    setCursor(after?.task.id ?? unfinished.find((y) => !next.has(y.task.id))?.task.id ?? 'end')
  }
  const choose = (x: CarryTask, kind: CarryDecision['kind']) => (kind === 'day' ? (x.editable && setPicking(x)) : decide(x, { kind } as CarryDecision))
  const index = CLOSE_STEP_IDS.indexOf(step)

  // Moving on from Carry over writes its decisions as one batch (close-the-day-v2 D3).
  const apply = async () => {
    if (!input) return
    const r = await applyCarryOver(decisions, unfinished, input.today, [...input.tasks])
    if (r.entry) {
      showBulkToast(r.label, r.entry.id)
      const counts = { ...carried }
      for (const x of unfinished) if (x.editable && decisionOf(decisions, x).kind !== 'keep') counts[decisionOf(decisions, x).kind]++
      setCarried(counts)
    }
    setKept(unfinished.filter((x) => decisionOf(decisions, x).kind === 'keep').length)
    setDecisions((m) => new Map([...m].filter(([, d]) => d.kind === 'keep')))
    setCursor(null)
  }
  const go = async (to: CloseStepId) => {
    if (step === 'carry' && CLOSE_STEP_IDS.indexOf(to) > CARRY_AT) {
      await apply()
      setPassed(true)
    }
    setStep(to)
  }
  const prev = index > 0 ? CLOSE_STEP_IDS[index - 1] : null
  const next = index < CLOSE_STEP_IDS.length - 1 ? CLOSE_STEP_IDS[index + 1] : null
  const onCard = (fn: (x: CarryTask) => void) => () => {
    if (step !== 'carry' || !shown) return false
    fn(shown)
  }
  useShortcutScope('view', {
    'review.prev-step': () => { if (!prev) return false; void go(prev) },
    'review.next-step': () => { if (!next) return false; void act(go(next)) },
    'close.tomorrow': onCard((x) => choose(x, 'tomorrow')),
    'close.pick': onCard((x) => choose(x, 'day')),
    'close.someday': onCard((x) => choose(x, 'someday')),
    'close.keep': onCard((x) => choose(x, 'keep')),
    'close.done': onCard((x) => choose(x, 'done')),
  }, { view: 'review', paused: !!picking })

  const finish = async () => {
    if (!summary || !day) return
    const at = Date.now()
    await closeDay(note, day, at)
    setClosed({ time: formatInstant(at, 'time'), planned: summary.planned, done: summary.done, carried, kept: kept ?? unfinished.length, note: note.trim() })
  }

  // The header and Reopen follow the day being closed and the live day: Reopen only while that day lasts.
  const closedHere = !!day && dayClosed(review, day)
  const reopenable = !!live && dayClosed(review, live.today)
  const meta = closedHere ? t('Day closed, {time}', { time: formatInstant(review!.closed_at, 'time') }) : undefined
  const progress = {
    done: { summary: index > 0, carry: unfinished.length === 0 || (passed && step !== 'carry'), note: false },
    left: { summary: 0, carry: passed ? 0 : unfinished.filter((x) => x.editable).length, note: 0 },
  }
  const projectMap = useMemo(() => new Map((input?.projects ?? []).map((p) => [p.id, p])), [input])

  return (
    <PageBody width="list">
      <PageHeader title={t('Close the day')} icon="moon" meta={meta} help="review/close"
        actions={reopenable && live && !closed ? <Button variant="secondary" size="sm" icon="rotate-ccw" onClick={() => reopenDayAction(live.today)} data-reopen-day>{t('Reopen the day')}</Button> : undefined}
        back={{ label: t('Today'), onClick: () => navigate({ view: 'today' }), hideFrom: 'lg' }} />
      {closed && live ? (
        <DoneForToday figures={closed} onBack={() => navigate({ view: 'today' })}
          onReopen={reopenable ? () => { reopenDayAction(live.today); setClosed(null) } : undefined} />
      ) : !summary || !day ? <Skeleton shape="row" count={4} /> : (
        <>
          <ReviewProgress<CloseStepId, 'close'> steps={progress} step={step} onStep={(s) => void act(go(s))} ids={CLOSE_STEP_IDS} phases={['close']}
            phaseOf={PHASE_OF} phaseTitles={CLOSE_PHASE_TITLES} stepTitles={CLOSE_STEP_TITLES} label={t('Close the day progress')} />
          <StepCard step={step} titleRef={title} icon={ICONS[step]} title={CLOSE_STEP_TITLES[step]} navInside
            position={t('Step {n} of {total} · {phase}', { n: index + 1, total: CLOSE_STEP_IDS.length, phase: CLOSE_PHASE_TITLES.close })}
            onBack={prev ? () => void go(prev) : null}
            next={next ? { label: t('Next: {step}', { step: CLOSE_STEP_TITLES[next] }), onClick: () => void act(go(next)) } : { label: t('Close the day'), onClick: () => void act(finish()), finish: true }}>
            {step === 'summary' && <SummaryStep summary={summary} />}
            {step === 'carry' && (
              <CarryStep rows={unfinished} shown={shown} day={day} decisions={decisions} projectMap={projectMap}
                onChoose={choose} onShow={(id) => setCursor(id)} />
            )}
            {step === 'note' && <NoteStep note={note} onNote={setNote} left={kept ?? unfinished.length} onClose={finish} />}
          </StepCard>
        </>
      )}
      {picking && (
        <Dialog title={t('Pick a day for {title}', { title: picking.task.title })} onClose={() => setPicking(null)}>
          <DateField label={t('Date')} autoFocus value={null} onChange={(iso) => { const x = picking; setPicking(null); if (iso) decide(x, { kind: 'day', date: iso }) }} />
        </Dialog>
      )}
    </PageBody>
  )
}

/** How the day went: one sentence of figures, no time, mood or score (weekly-review "How the day went"). */
function SummaryStep({ summary }: { summary: DaySummary }) {
  if (summary.planned === 0) return <p className="text-body text-muted" data-close-empty>{t('Nothing was planned for today and nothing was completed.')}</p>
  // Each number is its own tag, so a translation can move it and the tests can read it.
  const figure = (key: string) => (s: ReactNode) => <strong className="font-semibold tabular-nums text-strong" data-close-figure={key}>{s}</strong>
  return (
    <div className="space-y-2 text-h3 text-default" data-close-summary>
      <p>{t.rich('You planned <n-planned>{planned}</n-planned> {planned, plural, one {task} other {tasks}} and finished <n-done>{done}</n-done>.', { planned: summary.planned, done: summary.done, 'n-planned': figure('planned'), 'n-done': figure('done') })}</p>
      {summary.focusTotal > 0 && (
        <p>{t.rich('Today’s focus: <n-focus>{done} of {total}</n-focus> done.', { done: summary.focusDone, total: summary.focusTotal, 'n-focus': figure('focus') })}</p>
      )}
    </div>
  )
}

/** Carry over: the card for the task in hand and the decisions so far (weekly-review "Carry over unfinished tasks"). */
function CarryStep({ rows, shown, day, decisions, projectMap, onChoose, onShow }: {
  rows: CarryTask[]
  shown: CarryTask | null
  day: string
  decisions: ReadonlyMap<string, CarryDecision>
  projectMap: Map<string, Project>
  onChoose: (x: CarryTask, kind: CarryDecision['kind']) => void
  onShow: (id: string) => void
}) {
  if (rows.length === 0) return <p className="text-body text-muted" data-close-nothing>{t('Today is done: nothing to carry over.')}</p>
  const earlier = rows.filter((x) => x.task.due && localDueOf(x.task.due).date < day).length
  return (
    <>
      <p className="mb-3 text-body text-muted" data-close-count>
        {t('{n, plural, one {# task is still in Today.} other {# tasks are still in Today.}}', { n: rows.length })}{' '}
        {earlier > 0 && <>{t('{n, plural, one {# is still open from earlier.} other {# are still open from earlier.}}', { n: earlier })}{' '}</>}
        {t('Decide for each; moving on carries them over.')}
      </p>
      {shown ? (
        <CarryCard row={shown} position={rows.indexOf(shown) + 1} total={rows.length} day={day}
          project={shown.task.project_id ? projectMap.get(shown.task.project_id) : undefined}
          decision={decisionOf(decisions, shown)} onDecide={onChoose} />
      ) : (
        <p className="rounded-card border border-dashed border-default px-4 py-3 text-body text-muted" data-carry-all-set>{t('Every task has a decision. Change one below, or move on.')}</p>
      )}
      <CarryList rows={rows} current={shown?.task.id ?? null} decisionOf={(x) => decisionOf(decisions, x)} onShow={onShow} />
    </>
  )
}

/** A note for tomorrow morning: one optional field with a preview of where it appears; Enter or the primary action closes the day. */
function NoteStep({ note, onNote, left, onClose }: { note: string; onNote: (v: string) => void; left: number; onClose: () => Promise<void> }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); act(onClose()) }} data-close-note>
      {left > 0 && <div className="mb-3"><Notice tone="info">{t('{n, plural, one {# task stays in Today.} other {# tasks stay in Today.}}', { n: left })}</Notice></div>}
      <Field label={t('Note (optional)')} description={t('One line you want to read first tomorrow morning.')}>
        <Input value={note} maxLength={TOMORROW_NOTE_MAX} onChange={(e) => onNote(e.target.value)} placeholder={t('Start with…')} data-close-note-input />
      </Field>
      <p className="mt-2 text-meta text-muted" data-close-note-preview>
        {note.trim() ? t('Tomorrow your Daily check starts with: “{note}”', { note: note.trim() }) : t('Leave it empty if there’s nothing to remember.')}
      </p>
    </form>
  )
}
