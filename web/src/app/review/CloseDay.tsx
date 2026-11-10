// Close the day (OpenSpec changes close-the-day, close-the-day-v2 and
// close-the-day-redesign): a guided ritual of three steps, one at a time, in the
// page column. Done lists what was finished today; What moves takes every
// unfinished task on one list, each with Tomorrow, Later or Someday (CarryOver.tsx);
// Tomorrow's first thing picks the task tomorrow starts with, plus a line for the
// morning. Decisions are device state: nothing is written until "Close the day",
// which writes ONE batch with one Undo (lib/review.ts `closeTheDay`). The day being
// closed is the logical today when the screen opened and stays that day (v2 D1).
// The screen then shows Done for today (DoneForToday.tsx).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { formatInstant } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { useReviewRow } from '../../lib/localData'
import {
  CLOSE_STEP_IDS, CLOSE_STEP_TITLES, closeTheDay, daySummary, tomorrowsTasks,
  type CarryDecision, type CarryTask, type CloseStepId, type DaySummary,
} from '../../lib/closeDay'
import { dayClosed, TOMORROW_NOTE_MAX } from '../../lib/review'
import type { Project, Task } from '../../lib/types'
import { Button, DESKTOP_HEADER_QUERY, Dialog, Icon, Input, PageBody, PageHeader, Skeleton, TruncatedText, useMediaQuery } from '../../ui'
import { act } from '../actionError'
import { showBulkToast } from '../bulk/toastStore'
import { DateField } from '../datetime/DateField'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { useMethodInput } from '../method/useMethodInput'
import { navigate } from '../router'
import { isActivationTarget, isTypingTarget, useShortcutScope } from '../shortcuts'
import { reopenDayAction } from '../reopenDay'
import { MovesList, type Kind } from './CarryOver'
import { CloseProgress } from './CloseProgress'
import { DoneForToday, type DayDoneFigures } from './DoneForToday'

/** Completed tasks shown before "and n more". */
const DONE_FOLD = 8

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
export function CloseDay({ initialStep = 'done', initialDay }: { initialStep?: CloseStepId; initialDay?: string } = {}) {
  const weekStart = useDateTimeFormat().resolved.weekStart
  const { live, input, day } = useClosingDay(initialDay)
  const review = useReviewRow()
  const summary = useMemo(() => (input ? daySummary(input, review, weekStart) : null), [input, review, weekStart])
  const [step, setStep] = useState<CloseStepId>(initialStep)
  const [seen, setSeen] = useState<Set<CloseStepId>>(() => new Set(CLOSE_STEP_IDS.slice(0, CLOSE_STEP_IDS.indexOf(initialStep) + 1)))
  const [decisions, setDecisions] = useState<Map<string, CarryDecision>>(() => new Map())
  const [cursor, setCursor] = useState<string | null>(null)
  const [first, setFirst] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [picking, setPicking] = useState<CarryTask | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [closed, setClosed] = useState<DayDoneFigures | null>(null)
  const closing = useRef(false)
  // Opening the screen and every step change put focus on the step's title.
  const title = useRef<HTMLHeadingElement>(null)
  const loaded = !!summary
  useEffect(() => { if (loaded) title.current?.focus({ preventScroll: false }) }, [step, loaded])

  const unfinished = useMemo(() => summary?.unfinished ?? [], [summary])
  const rowAt = unfinished.find((x) => x.task.id === cursor) ?? unfinished[0] ?? null
  const tomorrow = useMemo(() => (input && day ? tomorrowsTasks(decisions, unfinished, day, input.tasks) : []), [input, day, decisions, unfinished])
  const chosen = first && tomorrow.some((x) => x.id === first) ? first : null
  const projects = useMemo(() => new Map((input?.projects ?? []).map((p) => [p.id, p])), [input])

  const decide = (x: CarryTask, d: CarryDecision, advance: boolean) => {
    if (!x.editable) return
    setDecisions((m) => new Map(m).set(x.task.id, d))
    if (advance) {
      const next = unfinished[unfinished.indexOf(x) + 1]
      if (next) setCursor(next.task.id)
    }
  }
  const choose = (x: CarryTask, kind: Kind, advance = false) => {
    if (!x.editable) return
    if (kind === 'day') setPicking(x)
    else decide(x, { kind } as CarryDecision, advance)
  }
  const index = CLOSE_STEP_IDS.indexOf(step)
  const prev = index > 0 ? CLOSE_STEP_IDS[index - 1] : null
  const next = index < CLOSE_STEP_IDS.length - 1 ? CLOSE_STEP_IDS[index + 1] : null
  const go = (to: CloseStepId) => {
    setSeen((s) => new Set(s).add(to))
    setStep(to)
  }

  // The one write (close-the-day-redesign D5): carry-over, first thing, stamp, note and record.
  const finish = async () => {
    if (!summary || !day || !input || closing.current) return
    closing.current = true
    try {
      const at = Date.now()
      const r = await closeTheDay({ decisions, tasks: unfinished, day, note, first: chosen, all: [...input.tasks], now: at })
      if (r.entry) showBulkToast(r.label, r.entry.id)
      const firstTask = chosen ? tomorrow.find((x) => x.id === chosen) : undefined
      setClosed({ time: formatInstant(at, 'time'), planned: summary.planned, done: summary.done, carried: r.carried, kept: r.carried.keep, note: note.trim(), first: firstTask ? firstTask.title || t('Untitled') : undefined })
    } finally {
      closing.current = false
    }
  }

  const onRow = (fn: (x: CarryTask) => void) => () => {
    if (step !== 'moves' || !rowAt) return false
    fn(rowAt)
  }
  const moveCursor = (by: number) => () => {
    if (step !== 'moves' || !rowAt) return false
    const to = unfinished[Math.max(0, Math.min(unfinished.length - 1, unfinished.indexOf(rowAt) + by))]
    setCursor(to.task.id)
    document.querySelector(`[data-carry-row="${CSS.escape(to.task.id)}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }
  const allToTomorrow = () => setDecisions(new Map())
  useShortcutScope('view', {
    'review.prev-step': () => { if (!prev) return false; go(prev) },
    'review.next-step': () => { if (!next) return false; go(next) },
    'close.next': (e) => {
      if (isActivationTarget(e.target) || isTypingTarget(e.target)) return false
      if (next) go(next)
      else void act(finish())
    },
    'close.leave': () => navigate({ view: 'today' }),
    'close.down': moveCursor(1),
    'close.up': moveCursor(-1),
    'close.all-tomorrow': () => { if (step !== 'moves') return false; allToTomorrow() },
    'close.tomorrow': onRow((x) => choose(x, 'tomorrow', true)),
    'close.pick': onRow((x) => choose(x, 'day', true)),
    'close.someday': onRow((x) => choose(x, 'someday', true)),
    'close.keep': onRow((x) => choose(x, 'keep', true)),
    'close.done': onRow((x) => choose(x, 'done', true)),
  }, { view: 'review', paused: !!picking || menuOpen, enabled: !closed })

  // The header and Reopen follow the day being closed and the live day: Reopen only while that day lasts.
  const closedHere = !!day && dayClosed(review, day)
  const reopenable = !!live && dayClosed(review, live.today)
  const meta = closedHere ? t('Day closed, {time}', { time: formatInstant(review!.closed_at, 'time') }) : undefined
  const ready = !!summary && !!day && !closed
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  const showReopen = reopenable && !!live && !closed
  const reopen = showReopen && <Button variant="secondary" size="sm" icon="rotate-ccw" onClick={() => reopenDayAction(live.today)} data-reopen-day>{t('Reopen the day')}</Button>

  return (
    <PageBody width="list">
      {/* On a phone Reopen stands in the page, under the shell's bar and its one divider; in the header it drew a second (no-layout-jump). */}
      <PageHeader title={t('Close the day')} icon="moon" meta={meta} help="review/close"
        actions={desktop && (showReopen || ready) ? <>{reopen}{ready && <CloseProgress step={step} seen={seen} onStep={go} />}</> : undefined}
        back={{ label: t('Today'), onClick: () => navigate({ view: 'today' }), hideFrom: 'lg' }} />
      {!desktop && reopen && <div className="pt-2">{reopen}</div>}
      {closed && live ? (
        <DoneForToday figures={closed} onBack={() => navigate({ view: 'today' })}
          onReopen={reopenable ? () => { reopenDayAction(live.today); setClosed(null) } : undefined} />
      ) : !summary || !day ? <Skeleton shape="row" count={4} /> : (
        <section aria-labelledby="close-step-title" data-close-step={step} data-review-step={step} className="mx-auto max-w-[42rem] pt-4 sm:pt-12">
          {!desktop && <div className="-ml-1 mb-3"><CloseProgress step={step} seen={seen} onStep={go} /></div>}
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            {/* Focused from code on each step so a screen reader reads it; not a stop for Tab, so no ring. */}
            <h2 id="close-step-title" ref={title} tabIndex={-1} className="text-h1 text-strong outline-none">{CLOSE_STEP_TITLES[step]}</h2>
            {step === 'done' && <DoneLead summary={summary} />}
            {step === 'moves' && unfinished.some((x) => x.editable) && (
              <Button variant="ghost" size="sm" onClick={allToTomorrow} aria-keyshortcuts="Shift+T" data-close-all-tomorrow>{t('All to tomorrow')}</Button>
            )}
          </div>
          {step === 'done' && <DoneStep summary={summary} projects={projects} />}
          {step === 'moves' && (unfinished.length === 0
            ? <Quiet data-close-nothing>{t('Today is done: nothing to carry over.')}</Quiet>
            : <MovesList rows={unfinished} day={day} decisions={decisions} projects={projects} cursor={rowAt?.task.id ?? null}
                onCursor={setCursor} onChoose={(x, k) => choose(x, k)} onMenu={setMenuOpen} />)}
          {step === 'first' && <FirstStep tasks={tomorrow} projects={projects} chosen={chosen} onChoose={setFirst} note={note} onNote={setNote} onClose={finish} />}
          <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-soft pt-4" data-close-nav>
            {prev && <Button variant="ghost" icon="chevron-left" onClick={() => go(prev)} data-close-back>{t('Back')}</Button>}
            <span className="flex-1" />
            {next ? <>
              <Button variant="ghost" onClick={() => void act(finish())} data-close-now>{t('Close the day')}</Button>
              <Button variant="primary" iconEnd="chevron-right" onClick={() => go(next)} data-close-next>{t('Next')}</Button>
            </> : <Button variant="primary" icon="check" onClick={() => void act(finish())} data-close-finish>{t('Close the day')}</Button>}
          </div>
        </section>
      )}
      {picking && (
        <Dialog title={t('Move {title} to', { title: picking.task.title || t('Untitled') })} onClose={() => setPicking(null)}>
          <DateField label={t('Date')} autoFocus value={null} onChange={(iso) => {
            const x = picking
            setPicking(null)
            if (iso) decide(x, { kind: 'day', date: iso }, x.task.id === rowAt?.task.id)
          }} />
        </Dialog>
      )}
    </PageBody>
  )
}

function Quiet({ children, ...hooks }: { children: ReactNode; [hook: `data-${string}`]: boolean | string | undefined }) {
  return <p {...hooks} className="py-6 text-body text-muted">{children}</p>
}

/** The Done step's lead: "5 of 8 done · focus 2 of 3". Each number is its own tag, so a translation can move it and the tests can read it. */
function DoneLead({ summary }: { summary: DaySummary }) {
  if (summary.planned === 0) return null
  const figure = (key: string) => (s: ReactNode) => <strong className="font-semibold tabular-nums text-default" data-close-figure={key}>{s}</strong>
  return (
    <p className="text-meta text-muted" data-close-summary>
      {t.rich('<n-done>{done}</n-done> of <n-planned>{planned}</n-planned> done', { planned: summary.planned, done: summary.done, 'n-planned': figure('planned'), 'n-done': figure('done') })}
      {summary.focusTotal > 0 && <>
        <span aria-hidden="true"> · </span>
        {t.rich('focus <n-focus>{done} of {total}</n-focus>', { done: summary.focusDone, total: summary.focusTotal, 'n-focus': figure('focus') })}
      </>}
    </p>
  )
}

function ProjectName({ task, projects }: { task: Task; projects: ReadonlyMap<string, Project> }) {
  const p = task.project_id ? projects.get(task.project_id) : undefined
  return p ? <span className="shrink-0 truncate text-meta text-muted">{p.name}</span> : null
}

/** Done (weekly-review "How the day went"): the tasks completed today, read-only, in completion order. */
function DoneStep({ summary, projects }: { summary: DaySummary; projects: ReadonlyMap<string, Project> }) {
  const [all, setAll] = useState(false)
  if (summary.planned === 0 && summary.completed.length === 0) return <Quiet data-close-empty>{t('Nothing was planned for today and nothing was completed.')}</Quiet>
  if (summary.completed.length === 0) return <Quiet data-close-none-done>{t('Nothing finished yet today.')}</Quiet>
  const shown = all ? summary.completed : summary.completed.slice(0, DONE_FOLD)
  const more = summary.completed.length - shown.length
  return (
    <>
      <ul className="-mx-2 sm:-mx-3" aria-label={t('Done today')} data-close-done-list>
        {shown.map((x) => (
          <li key={x.id} className="flex min-w-0 items-center gap-3 rounded-control px-2 py-2 sm:px-3" data-close-done-row={x.id}>
            <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"><Icon name="check" size="sm" /></span>
            <TruncatedText as="span" text={x.title || t('Untitled')} className="user-text min-w-0 flex-1 text-body text-default" />
            <ProjectName task={x} projects={projects} />
          </li>
        ))}
      </ul>
      {more > 0 && (
        <button type="button" onClick={() => setAll(true)} data-close-done-more
          className="mt-1 cursor-pointer rounded-control px-2 py-1 text-meta text-muted hover:text-default focus-visible:outline-2 focus-visible:outline-focus sm:-mx-1">
          {t('and {n} more', { n: more })}
        </button>
      )}
    </>
  )
}

/** Tomorrow's first thing (weekly-review "Tomorrow's first thing"): one of tomorrow's tasks, or none, and the line for the morning. */
function FirstStep({ tasks, projects, chosen, onChoose, note, onNote, onClose }: {
  tasks: Task[]
  projects: ReadonlyMap<string, Project>
  chosen: string | null
  onChoose: (id: string | null) => void
  note: string
  onNote: (v: string) => void
  onClose: () => Promise<void>
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const at = Math.max(0, tasks.findIndex((x) => x.id === chosen))
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const to = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? i - 1 : null
    if (to === null || to < 0 || to >= tasks.length) return
    e.preventDefault()
    refs.current[to]?.focus()
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); void act(onClose()) }} data-close-note>
      {tasks.length === 0 ? <Quiet data-close-first-none>{t('Nothing is due tomorrow yet.')}</Quiet> : (
        <div role="radiogroup" aria-label={CLOSE_STEP_TITLES.first} className="-mx-2 sm:-mx-3" data-close-first-list>
          {tasks.map((x, i) => {
            const on = x.id === chosen
            return (
              <button key={x.id} ref={(el) => { refs.current[i] = el }} type="button" role="radio" aria-checked={on} tabIndex={i === at ? 0 : -1}
                onClick={() => onChoose(on ? null : x.id)} onKeyDown={(e) => onKeyDown(e, i)} data-close-first={x.id}
                className={`flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-control px-2 py-2.5 text-left outline-none transition-colors duration-(--duration-ui) hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus sm:px-3 ${on ? 'bg-accent-soft' : ''}`}>
                <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-accent bg-accent' : 'border-strong'}`}>
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-on-accent" />}
                </span>
                <span className={`user-text min-w-0 flex-1 truncate text-body ${on ? 'font-medium text-strong' : 'text-default'}`}>{x.title || t('Untitled')}</span>
                <ProjectName task={x} projects={projects} />
              </button>
            )
          })}
        </div>
      )}
      <label className="mt-8 block">
        <span className="mb-1.5 block text-meta font-medium text-muted">{t('A line for tomorrow')}</span>
        <Input value={note} maxLength={TOMORROW_NOTE_MAX} onChange={(e) => onNote(e.target.value)} placeholder={t('Start with…')} data-close-note-input />
      </label>
      {note.trim() && (
        <p className="mt-2 text-meta text-muted" data-close-note-preview>{t('Tomorrow your Daily check starts with: “{note}”', { note: note.trim() })}</p>
      )}
    </form>
  )
}

