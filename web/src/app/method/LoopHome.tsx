// The Loop home (OpenSpec changes loop-home-refresh and loop-guided-dashboard;
// open-loops "Loop home" and "Loop pulse"): a Next step card naming one move and
// its reason, the five moves as a stepper in method order, the Loop pulse as one
// quiet line, and the open move in place below them (/loop/<move>). Everything is
// computed on the device from the local rows, nothing is stored or sent, and the
// page follows changes from other devices as they sync. Each move's part and the
// pulse details are lazy chunks.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { useAllLabels, useReviewRow, useReviewedAt, useUserPrefsRow } from '../../lib/localData'
import { BENTO_SLOTS, orderedFocusIds, readBento, readFocusStyle } from '../../lib/bento'
import { move as term, RHYTHMS, termName, type MoveId, type RhythmId } from '../../lib/method'
import { nextGroups } from '../../lib/method/groups'
import { decided, INBOX_AGE_CAUTION_DAYS, inboxAge, lastDays, nextMove, type NextStep } from '../../lib/method/pulse'
import { MethodRules } from '../../lib/method/rules'
import { dailyDue, dayClosed, FOCUS_MAX, focusTasks, monthlyDue, reviewAgo, reviewDue } from '../../lib/review'
import { compute, periodFor, sharedIds } from '../../lib/stats'
import { qualifies } from '../../lib/triage'
import type { Project, Task } from '../../lib/types'
import { Button, DESKTOP_HEADER_QUERY, Icon, IconButton, PageBody, PageHeader, Skeleton, useMediaQuery, type IconName } from '../../ui'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { MethodLink } from '../help/MethodLink'
import { navigate, type Route } from '../router'
import { useMethodInput } from './useMethodInput'

const Catch = lazy(() => import('./loop/CatchMove'))
const Clarify = lazy(() => import('./loop/ClarifyMove'))
const Place = lazy(() => import('./loop/PlaceMove'))
const Do = lazy(() => import('./loop/DoMove'))
const Review = lazy(() => import('./loop/ReviewMove'))
const PulseDetails = lazy(() => import('./loop/PulseDetails'))

/** The moves in method order, the stepper's order (D3). */
const ORDER: readonly MoveId[] = ['catch', 'clarify', 'place', 'do', 'review']
const ICONS: Record<MoveId, IconName> = { catch: 'inbox', clarify: 'list', place: 'layers', do: 'arrow-right', review: 'clipboard-check' }
const RHYTHM_ROUTES: Record<RhythmId, Route> = { daily: { view: 'review', step: 'daily' }, weekly: { view: 'review' }, monthly: { view: 'review', step: 'monthly' } }

export interface PulseData { week: number; lastWeek: number; decided: number; caught: number; age: number | null; days: { date: string; count: number }[] }

export interface RhythmLine { id: RhythmId; name: string; due: boolean; when: string }

/** What the home and its moves read, computed once per change of the local rows. */
export interface LoopData {
  inbox: number
  /** The open Inbox tasks, newest first (Catch's latest captures). */
  latest: Task[]
  withoutNext: Project[]
  stalled: Project[]
  contexts: { key: string; heading: string; tasks: Task[] }[]
  nextCount: number
  rhythms: RhythmLine[]
  /** When the day was closed on the logical today, else null. */
  closedAt: number | null
  focus: Task[]
  /** Room for one more focus task by touch. */
  room: boolean
  pulse: PulseData
  up: NextStep
}

/** The props every move's part gets. */
export interface MoveProps {
  data: LoopData
  /** Close the move (Esc, the Vim `:q`), as Back would. */
  onClose: () => void
  /** The Clarify move reports how many tasks are left. */
  onLeft?: (n: number) => void
}

function useLoopData(): LoopData | null {
  const input = useMethodInput()
  const labels = useAllLabels()
  const review = useReviewRow()
  const prefs = useUserPrefsRow()
  const reviewedAt = useReviewedAt()
  const weekStart = useDateTimeFormat().resolved.weekStart
  return useMemo(() => {
    if (!input) return null
    const now = Date.now()
    const rules = new MethodRules(input)
    const live = input.tasks.filter((x) => !x.deleted_at)
    const inboxTasks = live.filter(qualifies)
    const withoutNext = rules.working.filter((p) => rules.needsNextAction(p.id))
    const stalled = rules.working.filter((p) => rules.stalled(p.id, now))
    const contexts = nextGroups(input, labels)
    const nextCount = new Set(contexts.flatMap((g) => g.tasks.map((x) => x.id))).size
    const due = { daily: dailyDue(review?.daily_at, input.today), weekly: reviewDue(review?.completed_at, now), monthly: monthlyDue(review?.monthly_at, now) }
    const stamps = { weekly: review?.completed_at ?? null, monthly: review?.monthly_at ?? null }
    const rhythms = RHYTHMS.map((r) => ({ id: r.id, name: termName(r), due: due[r.id], when: due[r.id] ? t('due') : r.id === 'daily' ? t('done today') : reviewAgo(stamps[r.id]) }))
    const rhythm = (['daily', 'weekly', 'monthly'] as const).find((id) => due[id]) ?? null
    const byId = new Map(live.map((x) => [x.id, x]))
    // Listed in the Bento order when Bento is on (bento-daily-check D6).
    const focus = orderedFocusIds(review, prefs, input.today, live).map((id) => byId.get(id)).filter((x): x is Task => !!x)
    // Room for one more by touch (phone-touch-focus): a free slot in Bento, fewer than three open tasks otherwise.
    const room = readFocusStyle(prefs) === 'bento'
      ? BENTO_SLOTS.some((s) => !readBento(review, input.today, live.filter((x) => !x.completed_at)).slots[s])
      : focusTasks(review, input.today, live).length < FOCUS_MAX
    const stats = { tasks: input.tasks, projects: input.projects, shared: sharedIds([...input.memberships.values()]), me: input.me, today: input.today }
    const pulse = {
      week: compute(stats, periodFor('this-week', input.today, weekStart), weekStart).completed,
      lastWeek: compute(stats, periodFor('last-week', input.today, weekStart), weekStart).completed,
      ...decided(input.tasks, input.today),
      age: inboxAge(input.tasks, input.today),
      days: compute(stats, lastDays(input.today), weekStart).perDay,
    }
    const closedAt = review && dayClosed(review, input.today) ? review.closed_at : null
    const latest = [...inboxTasks].sort((a, b) => b.created_at - a.created_at)
    const up = nextMove({ inbox: inboxTasks.length, withoutNext: withoutNext.length, rhythm, nextCount })
    return { inbox: inboxTasks.length, latest, withoutNext, stalled, contexts, nextCount, rhythms, closedAt, focus, room, pulse, up }
  }, [input, labels, review, prefs, reviewedAt, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps -- reviewedAt: the walk's stamps change what Place counts
}

export function LoopHome({ move }: { move?: MoveId }) {
  const data = useLoopData()
  const wide = useMediaQuery(DESKTOP_HEADER_QUERY)
  // Opened from this page: Back (history) closes it. Opened by a link: closing replaces the address.
  const pushed = useRef(false)
  const items = useRef<Partial<Record<MoveId, HTMLButtonElement | null>>>({})
  const [left, setLeft] = useState<number | null>(null)
  const last = useRef(move)
  useEffect(() => {
    const was = last.current
    last.current = move
    if (move) return
    pushed.current = false
    setLeft(null)
    // Closed (Back, Esc, the open step): focus returns to the step it was opened from.
    const active = document.activeElement
    if (was && (!active || active === document.body)) items.current[was]?.focus()
  }, [move])

  const open = (id: MoveId) => {
    if (id === move) { close(); return }
    // Switching moves replaces the entry, so Back always closes to the Loop home.
    navigate({ view: 'loop', move: id }, { replace: !!move })
    if (!move) pushed.current = true
  }
  const close = () => {
    if (pushed.current) { pushed.current = false; history.back() } else navigate({ view: 'loop' }, { replace: true })
  }
  // Below 768 px an open move takes the screen as a page with Back (D7).
  const page = !wide && !!move
  const name = move ? termName(term(move)) : ''

  return (
    <PageBody width="list">
      <PageHeader title={page ? name : t('Loop home')} icon={page ? undefined : 'rotate-ccw'} help="loop"
        back={page ? { label: t('Loop home'), onClick: close } : undefined}
        meta={page ? (move === 'clarify' && left ? t('{n} left', { n: left }) : undefined) : <MethodLink />} subtitle={page ? undefined : <MethodLink />} />
      {!data ? <LoopSkeleton /> : (
        <div onKeyDown={move && move !== 'clarify' ? escCloses(close) : undefined}>
          {!page && (
            <>
              <NextStepCard step={data.up} onOpen={open} open={move} />
              <Stepper data={data} open={move} up={data.up.move} onOpen={open} items={items.current} />
              <PulseLine pulse={data.pulse} />
            </>
          )}
          {move && <MovePart move={move} data={data} page={page} left={left} onLeft={setLeft} onClose={close} />}
        </div>
      )}
    </PageBody>
  )
}

/** Esc closes the open move (Clarify's own triage key does it there), except in a field with text. */
function escCloses(close: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    const el = e.target instanceof HTMLElement ? e.target : null
    if (el?.matches('input, textarea') && (el as HTMLInputElement).value) return
    if (el?.closest('[data-overlay-root]')) return
    e.preventDefault()
    close()
  }
}

/** The reason and the label of the card's one button (D2). */
function stepText(step: NextStep): { reason: string; action: string } {
  switch (step.move) {
    case 'clarify':
      return { reason: t('{n, plural, one {# thing in the Inbox is waiting.} other {# things in the Inbox are waiting.}}', { n: step.count }), action: termName(term('clarify')) }
    case 'place':
      return { reason: t('{n, plural, one {# project has no next action.} other {# projects have no next action.}}', { n: step.count }), action: t('Walk your projects') }
    case 'review':
      return step.rhythm === 'daily' ? { reason: t('Your Daily check is due.'), action: t('Start the daily check') }
        : step.rhythm === 'monthly' ? { reason: t('Your Monthly look is due.'), action: t('Open the monthly look') }
          : { reason: t('Your weekly review is due.'), action: t('Start the weekly review') }
    case 'do':
      return { reason: t('{n, plural, one {# next action is ready.} other {# next actions are ready.}}', { n: step.count }), action: t('Go to Next') }
    default:
      return { reason: t('Your loops are closed.'), action: t('Catch something') }
  }
}

/**
 * The Next step card: one sentence with the reason and the page's only primary
 * button. While its move is open below, the button has done its job and steps
 * aside, so the open move's own primary action is the only one.
 */
function NextStepCard({ step, onOpen, open }: { step: NextStep; onOpen: (id: MoveId) => void; open?: MoveId }) {
  const { reason, action } = stepText(step)
  const closed = step.move === 'catch'
  // A due rhythm opens its own screen; every other step opens its move in place.
  const run = () => (step.move === 'review' && step.rhythm ? navigate(RHYTHM_ROUTES[step.rhythm]) : onOpen(step.move))
  return (
    <section aria-labelledby="loop-next" data-loop-next={step.move}
      className="mt-2 flex flex-col gap-4 rounded-surface border border-default bg-surface p-5 shadow-1 sm:flex-row sm:items-center sm:gap-5">
      <span aria-hidden="true" className={`hidden h-10 w-10 shrink-0 place-items-center rounded-full sm:grid ${closed ? 'bg-success-soft text-on-success-soft' : 'bg-accent-soft text-on-accent-soft'}`}>
        <Icon name={closed ? 'circle-check-big' : ICONS[step.move]} size="md" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="loop-next" className="text-meta font-medium text-muted">{t('Next step', { context: 'method' })}</h2>
        <p className="mt-0.5 text-h2 text-strong" data-loop-reason>{reason}</p>
      </div>
      {open !== step.move && <Button variant="primary" iconEnd="arrow-right" className="self-start sm:self-auto" onClick={run} data-loop-action>{action}</Button>}
    </section>
  )
}

/** One move's line in the stepper: the count, the done mark, or Review's "due", and what assistive technology reads. */
function stepFacts(id: MoveId, d: LoopData): { count: number | null; due?: boolean; sentence: string } {
  switch (id) {
    case 'catch':
      return { count: d.inbox || null, sentence: t('{n, plural, =0 {The Inbox is empty} one {# in the Inbox} other {# in the Inbox}}', { n: d.inbox }) }
    case 'clarify':
      return { count: d.inbox || null, sentence: t('{n, plural, =0 {Nothing to decide} one {# to decide} other {# to decide}}', { n: d.inbox }) }
    case 'place':
      return { count: d.withoutNext.length || null, sentence: t('{n, plural, =0 {Every project has a next action} one {# project without a next action} other {# projects without a next action}}', { n: d.withoutNext.length }) }
    case 'do':
      return { count: d.nextCount || null, sentence: t('{n, plural, =0 {No next action} one {# next action} other {# next actions}}', { n: d.nextCount }) }
    default:
      return { count: null, due: d.rhythms.some((r) => r.due), sentence: d.rhythms.map((r) => `${r.name}: ${r.when}`).join(', ') }
  }
}

/**
 * The stepper (D3): the five moves in method order, each with its count or a done
 * mark; only the next move carries the accent. ← and → move between the steps, and
 * Enter or a click opens a step below or closes it when it is open.
 */
function Stepper({ data, open, up, onOpen, items }: { data: LoopData; open?: MoveId; up: MoveId; onOpen: (id: MoveId) => void; items: Partial<Record<MoveId, HTMLButtonElement | null>> }) {
  const [focus, setFocus] = useState<MoveId>(open ?? 'catch')
  useEffect(() => { if (open) setFocus(open) }, [open])
  const onKey = (e: KeyboardEvent<HTMLOListElement>) => {
    const i = ORDER.indexOf(focus)
    const to = e.key === 'ArrowRight' ? ORDER[(i + 1) % ORDER.length] : e.key === 'ArrowLeft' ? ORDER[(i + ORDER.length - 1) % ORDER.length]
      : e.key === 'Home' ? ORDER[0] : e.key === 'End' ? ORDER[ORDER.length - 1] : null
    if (!to) return
    e.preventDefault()
    setFocus(to)
    items[to]?.focus()
  }
  return (
    <nav aria-label={t('The five moves')} className="mt-6">
      <ol onKeyDown={onKey} className="grid grid-cols-5 gap-1 rounded-surface bg-sunken p-1" data-loop-stepper>
        {ORDER.map((id) => {
          const f = stepFacts(id, data)
          const lit = id === up
          const expanded = id === open
          const done = f.count === null && !f.due
          return (
            <li key={id} className="min-w-0" data-loop-step={id} data-loop-up={lit || undefined}>
              <button ref={(el) => { items[id] = el }} type="button" tabIndex={id === focus ? 0 : -1} aria-expanded={expanded} aria-controls={expanded ? 'loop-move' : undefined}
                onClick={() => onOpen(id)} onFocus={() => setFocus(id)}
                className={`flex min-h-12 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-1 py-1.5 outline-none transition duration-(--duration-ui) ease-calm focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus md:flex-row md:justify-between md:gap-2 md:px-3 md:py-2.5 ${expanded ? 'bg-surface shadow-1' : 'hover:bg-hover'}`}>
                <span className={`flex min-w-0 items-center gap-1.5 text-meta font-medium md:text-body ${lit ? 'text-accent' : expanded ? 'text-strong' : 'text-default'}`}>
                  {lit && <span aria-hidden="true" className="hidden h-1.5 w-1.5 shrink-0 rounded-full bg-accent md:block" />}
                  <span className="truncate">{termName(term(id))}</span>
                </span>{' '}
                <span aria-hidden="true" className="flex h-5 items-center text-meta tabular-nums md:text-body">
                  {done ? <span className="flex text-success" data-loop-done><Icon name="check" /></span>
                    : f.due ? <span className={lit ? 'text-accent' : 'text-on-warning-soft'}>{t('due')}</span>
                      : <span className={lit ? 'font-semibold text-accent' : 'text-muted'}>{f.count}</span>}
                </span>
                <span className="sr-only">{f.sentence}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** The Loop pulse as one quiet line (D6); its figures and the 14-day strip open behind it. */
function PulseLine({ pulse }: { pulse: PulseData }) {
  const [shown, setShown] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const stale = pulse.age !== null && pulse.age > INBOX_AGE_CAUTION_DAYS
  return (
    <>
      <button ref={anchor} type="button" aria-haspopup="dialog" aria-expanded={shown} onClick={() => setShown(true)} data-loop-pulse-line
        className="mt-2 flex w-full min-w-0 items-center gap-1.5 rounded-control px-3 py-1.5 text-left text-meta text-muted outline-none hover:text-default focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus">
        <span className="min-w-0 flex-1 tabular-nums">
          {t('{n} done this week', { n: pulse.week })}
          <span aria-hidden="true"> · </span><span className="sr-only">, </span>
          {t('{decided} of {caught} decided', { decided: pulse.decided, caught: pulse.caught })}
          <span aria-hidden="true"> · </span><span className="sr-only">, </span>
          {pulse.age === null ? t('Inbox empty') : (
            <span className={stale ? 'text-on-warning-soft' : undefined} data-loop-age-stale={stale || undefined}>
              {stale && <Icon name="circle-alert" size="xs" className="mr-1 inline align-[-2px]" />}
              {t('{n, plural, one {oldest in Inbox # day} other {oldest in Inbox # days}}', { n: pulse.age })}
            </span>
          )}
        </span>
        <Icon name="chevron-right" className="shrink-0" />
      </button>
      {shown && <Suspense fallback={null}><PulseDetails pulse={pulse} anchor={anchor} onClose={() => setShown(false)} /></Suspense>}
    </>
  )
}

/** The open move below the stepper (D4), or the page of its own on a phone (D7). */
function MovePart({ move, data, page, left, onLeft, onClose }: { move: MoveId; data: LoopData; page: boolean; left: number | null; onLeft: (n: number) => void; onClose: () => void }) {
  const props: MoveProps = { data, onClose, onLeft }
  const part: ReactNode = move === 'catch' ? <Catch {...props} /> : move === 'clarify' ? <Clarify {...props} /> : move === 'place' ? <Place {...props} />
    : move === 'do' ? <Do {...props} /> : <Review {...props} />
  const meta = move === 'clarify' && left ? t('{n} left', { n: left }) : null
  return (
    <section id="loop-move" aria-labelledby="loop-move-title" data-loop-move={move} className={page ? '' : 'mt-8'}>
      {page ? <h2 id="loop-move-title" className="sr-only">{termName(term(move))}</h2> : (
        <div className="mb-3 flex items-center gap-3 border-b border-soft pb-2">
          <h2 id="loop-move-title" className="text-title text-strong">{termName(term(move))}</h2>
          {meta && <span className="text-meta tabular-nums text-muted" data-loop-left>{meta}</span>}
          <IconButton icon="x" size="sm" label={t('Close')} className="ml-auto" onClick={onClose} data-loop-close />
        </div>
      )}
      <Suspense fallback={<Skeleton shape="row" count={3} />}>{part}</Suspense>
    </section>
  )
}

/** The loading state has the final layout's shape, so nothing shifts when the rows arrive. */
export function LoopSkeleton() {
  return (
    <div data-loop-skeleton aria-hidden="true">
      <Skeleton shape="card" count={1} label="" />
      <div className="mt-6 grid grid-cols-5 gap-1 rounded-surface bg-sunken p-1">
        {ORDER.map((id) => <span key={id} className="h-12 rounded-control" />)}
      </div>
      <Skeleton shape="line" count={1} className="mt-3" label="" />
    </div>
  )
}
